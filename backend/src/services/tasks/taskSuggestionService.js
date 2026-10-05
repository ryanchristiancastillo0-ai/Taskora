// TaskSuggestionService: creates and resolves task-pattern suggestions.
//
// A suggestion is generated deterministically when a detected pattern's
// next expected occurrence enters its suggestion window. It NEVER creates
// a task by itself; the user must explicitly accept it (Add Task) or skip
// it. Both actions are recorded so future analysis can learn from them.
//
// Duplicate prevention: the (patternId, suggestedDate) unique constraint
// plus an explicit existence check make creation idempotent even if the
// scheduler job is run twice.

const AppError = require("../../utils/AppError.js");
const { getPagination, buildMeta } = require("../../utils/pagination.js");
const { localKey, parseKey, addDaysKey } = require("../../utils/date.js");
const detector = require("./taskPatternDetector.js");

const NOTIFICATION_TYPE = "TASK_PATTERN_SUGGESTION";
const HANDLED_TASK_BAND_DAYS = 1;

class TaskSuggestionService {
  constructor(prisma, notificationService, taskPatternService, taskService) {
    this.prisma = prisma;
    this.notificationService = notificationService;
    this.taskPatternService = taskPatternService;
    this.taskService = taskService;
  }

  async list(userId, query = {}) {
    const { page, limit, skip, take } = getPagination(query);
    const where = { userId };

    if (query.status) {
      where.status = query.status;
    }

    const [items, total] = await Promise.all([
      this.prisma.taskSuggestion.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        include: {
          pattern: {
            select: {
              taskTitle: true,
              frequencyType: true,
              intervalDays: true,
              confidence: true,
            },
          },
        },
      }),
      this.prisma.taskSuggestion.count({ where }),
    ]);

    return { items, pagination: buildMeta(page, limit, total) };
  }

  async get(userId, id) {
    const suggestion = await this.prisma.taskSuggestion.findFirst({
      where: { id, userId },
      include: { pattern: true },
    });

    if (!suggestion) {
      throw new AppError("Suggestion not found", 404);
    }

    return suggestion;
  }

  // Scans active patterns whose next expected occurrence is within the
  // suggestion window and creates (exactly) one pending suggestion each.
  // Safe to run repeatedly: duplicates are prevented by the unique
  // constraint on (patternId, suggestedDate) and the explicit check below.
  async generateDueSuggestions({ todayKey: today = localKey() } = {}) {
    const windowEnd = addDaysKey(today, detector.SUGGESTION_WINDOW_AFTER);
    const patterns = await this.prisma.taskPattern.findMany({
      where: { active: true, nextOccurrence: { lte: windowEnd } },
    });

    const created = [];

    for (const pattern of patterns) {
      // Slipped cycles roll forward into the window; too-early patterns stay.
      const relevant = await this.taskPatternService.forwardNextOccurrence(
        pattern,
        today
      );

      const expected = relevant.nextOccurrence;
      if (!detector.isWithinSuggestionWindow(today, expected)) {
        continue;
      }

      if (await this.hasAlreadyHandledTask(pattern.userId, pattern.normalizedTitle, expected)) {
        continue;
      }

      const existing = await this.prisma.taskSuggestion.findFirst({
        where: { patternId: pattern.id, suggestedDate: expected },
        select: { id: true },
      });
      if (existing) {
        continue;
      }

      const suggestion = await this.prisma.taskSuggestion.create({
        data: {
          userId: pattern.userId,
          patternId: pattern.id,
          suggestedDate: expected,
        },
      });

      await this.notificationService.create(pattern.userId, {
        title: `"${pattern.taskTitle}" suggestion`,
        message: `You usually do "${pattern.taskTitle}" around this time. Would you like to add it to today's tasks?`,
        type: NOTIFICATION_TYPE,
        taskSuggestionId: suggestion.id,
      });

      created.push(suggestion);
    }

    return created;
  }

  // Accept a suggestion: create the actual task through the existing task
  // creation logic, then mark the suggestion ACCEPTED. Repeating the call
  // returns the same task instead of creating a duplicate.
  async accept(userId, suggestionId) {
    const claimed = await this.prisma.taskSuggestion.updateMany({
      where: { id: suggestionId, userId, status: "PENDING" },
      data: { status: "ACCEPTED", respondedAt: new Date() },
    });

    if (claimed.count === 0) {
      const existing = await this.prisma.taskSuggestion.findFirst({
        where: { id: suggestionId, userId },
        include: { pattern: true },
      });

      if (!existing) {
        throw new AppError("Suggestion not found", 404);
      }

      if (existing.status === "ACCEPTED" && existing.createdTaskId) {
        const task = await this.prisma.task.findUnique({
          where: { id: existing.createdTaskId },
        });
        return { suggestion: existing, task };
      }

      throw new AppError("This suggestion is no longer pending", 409);
    }

    const suggestion = await this.prisma.taskSuggestion.findFirst({
      where: { id: suggestionId, userId },
      include: { pattern: true },
    });

    try {
      const task = await this.taskService.create(userId, {
        title: suggestion.pattern.taskTitle,
        dueDate: `${suggestion.suggestedDate}T00:00:00.000Z`,
        description: `Added from a detected pattern suggestion ("${suggestion.pattern.taskTitle}", expected ${suggestion.suggestedDate}).`,
      });

      const updated = await this.prisma.taskSuggestion.update({
        where: { id: suggestionId },
        data: { createdTaskId: task.id },
      });

      return { suggestion: updated, task };
    } catch (error) {
      // Revert the claim so a transient failure doesn't lose the suggestion.
      await this.prisma.taskSuggestion.update({
        where: { id: suggestionId },
        data: { status: "PENDING", respondedAt: null },
      });
      throw error;
    }
  }

  // Skip a suggestion: record the decision, keep the pattern intact so the
  // algorithm can keep learning from the user's behavior.
  async skip(userId, suggestionId) {
    const updated = await this.prisma.taskSuggestion.updateMany({
      where: { id: suggestionId, userId, status: "PENDING" },
      data: { status: "SKIPPED", respondedAt: new Date() },
    });

    if (updated.count === 0) {
      const existing = await this.prisma.taskSuggestion.findFirst({
        where: { id: suggestionId, userId },
        include: { pattern: true },
      });

      if (!existing) {
        throw new AppError("Suggestion not found", 404);
      }

      if (existing.status === "ACCEPTED") {
        return existing;
      }

      throw new AppError("This suggestion is no longer pending", 409);
    }

    return this.prisma.taskSuggestion.findFirst({
      where: { id: suggestionId, userId },
      include: { pattern: true },
    });
  }

  // True when the user already created/completed a same-title task on (or
  // within HANDLED_TASK_BAND_DAYS of) the expected date. Prevents nagging
  // when the user acted outside the suggestion flow.
  async hasAlreadyHandledTask(userId, normalizedTitle, dateKey) {
    const start = parseKey(addDaysKey(dateKey, -HANDLED_TASK_BAND_DAYS));
    const end = parseKey(addDaysKey(dateKey, HANDLED_TASK_BAND_DAYS));

    const tasks = await this.prisma.task.findMany({
      where: {
        userId,
        OR: [
          { completedAt: { gte: start, lte: end } },
          { createdAt: { gte: start, lte: end } },
          { dueDate: { gte: start, lte: end } },
        ],
      },
      select: { title: true },
      take: 100,
    });

    return tasks.some(
      (task) => detector.normalizeTaskTitle(task.title) === normalizedTitle
    );
  }
}

module.exports = TaskSuggestionService;