// TaskPatternService: persists and refreshes detected task patterns.
//
// `onTaskCompleted` is called by the normal task lifecycle whenever a task
// is marked COMPLETED (see TaskService). It reads the user's completed-task
// history for the same normalized title, runs the deterministic detector,
// and upserts one TaskPattern row per user+normalizedTitle.
//
// The refresh is bounded (HISTORY_LIMIT rows, all same user+title filtered
// in memory) and never runs on the hot list/get requests.

const detector = require("./taskPatternDetector.js");
const { localKey } = require("../../utils/date.js");

const HISTORY_LIMIT = 1000;

class TaskPatternService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  // Called after a task changed to COMPLETED. Never throws so a pattern
  // refresh can never break the task lifecycle.
  async onTaskCompleted(userId, task) {
    try {
      const normalizedTitle = detector.normalizeTaskTitle(task && task.title);
      if (!normalizedTitle) {
        return;
      }

      const dates = await this.collectOccurrenceDates(userId, normalizedTitle);
      const result = detector.detectTaskPattern(dates);

      const existing = await this.prisma.taskPattern.findUnique({
        where: { userId_normalizedTitle: { userId, normalizedTitle } },
      });

      if (!result.patternDetected) {
        // Not enough or too-irregular evidence right now. Keep the row (so
        // it can be revived later) but stop suggesting until it regroups.
        if (existing && existing.active) {
          await this.prisma.taskPattern.update({
            where: { id: existing.id },
            data: { active: false },
          });
        }
        return;
      }

      const data = {
        taskTitle: task.title,
        frequencyType: result.frequencyType,
        intervalDays: result.intervalDays,
        confidence: result.confidence,
        lastOccurrence: result.lastOccurrence,
        nextOccurrence: result.nextOccurrence,
        occurrenceCount: result.occurrences,
        active: true,
      };

      if (existing) {
        await this.prisma.taskPattern.update({
          where: { id: existing.id },
          data,
        });
      } else {
        await this.prisma.taskPattern.create({
          data: { userId, normalizedTitle, ...data },
        });
      }
    } catch (error) {
      console.error(
        `[task-pattern] failed to update pattern for task ${task && task.id}: ${error.message}`
      );
    }
  }

  // Distinct "YYYY-MM-DD" completion dates for a normalized title. Deleted
  // tasks are gone from the DB (intentionally excluded), CANCELLED tasks
  // are not "occurrences", and tasks inside ARCHIVED projects don't count.
  async collectOccurrenceDates(userId, normalizedTitle) {
    const tasks = await this.prisma.task.findMany({
      where: {
        userId,
        status: "COMPLETED",
        completedAt: { not: null },
        OR: [
          { project: { is: null } },
          { project: { status: { not: "ARCHIVED" } } },
        ],
      },
      select: { title: true, completedAt: true },
      orderBy: { completedAt: "asc" },
      take: HISTORY_LIMIT,
    });

    const dates = new Set();
    for (const task of tasks) {
      if (detector.normalizeTaskTitle(task.title) !== normalizedTitle) {
        continue;
      }
      dates.add(localKey(task.completedAt));
    }
    return Array.from(dates);
  }

  // Advance a pattern's nextOccurrence into its suggestion window when a
  // cycle slipped by. Deterministic, bounded, and safe to re-run.
  async forwardNextOccurrence(pattern, todayKey = localKey()) {
    const next = detector.forwardNextOccurrenceKey(
      pattern.nextOccurrence,
      pattern.intervalDays,
      todayKey
    );

    if (next === pattern.nextOccurrence) {
      return pattern;
    }

    return this.prisma.taskPattern.update({
      where: { id: pattern.id },
      data: { nextOccurrence: next },
    });
  }
}

module.exports = TaskPatternService;