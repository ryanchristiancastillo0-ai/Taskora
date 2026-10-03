const AppError = require("../../utils/AppError.js");
const { getPagination, buildMeta } = require("../../utils/pagination.js");

/**
 * Which per-type switch decides whether a notification type may be emailed.
 *
 * `emailNotifications` is only the master switch. Without this table a user who
 * silences "Task reminders" and turns email on would still receive every
 * reminder, because nothing between create() and the queue ever consulted the
 * per-type choice — the six switches were stored and then never read.
 *
 * `null` means the type has no per-type switch and follows the master alone.
 * FRIEND_REQUEST and NEW_MESSAGE are deliberately unmapped: they are direct
 * address (someone messaged you, someone requested you), not ambient chatter, so
 * silencing a category of background noise should not silence them.
 *
 * TASK_PATTERN_SUGGESTION sits under `aiSuggestions` because that is what it
 * is — an AI-generated proposal. TASK_REMINDER and TASK_DUE are separate
 * entries because they are separate events; see taskReminderQueue.js, which
 * emits TASK_REMINDER rather than reusing TASK_DUE so the reminder switch and
 * the deadline switch can each be honoured.
 */
const EMAIL_TYPE_GATES = {
  TASK_REMINDER: "taskReminders",
  TASK_DUE: "deadlineReminders",
  PROJECT_UPDATE: "projectUpdates",
  AI_SUGGESTION: "aiSuggestions",
  TASK_PATTERN_SUGGESTION: "aiSuggestions",
  SYSTEM: null,
  FRIEND_REQUEST: null,
  NEW_MESSAGE: null,

  // Admin-directed and support-lifecycle types are in-app only, and null here is
  // what makes that true: queueEmail reads the gate and a null value means the
  // type never reaches the user's inbox.
  //
  // Deliberate for NEW_USER and NEW_SUPPORT_REQUEST — an admin's inbox should
  // not fill with every signup on the platform. SUPPORT_STATUS_CHANGED is a
  // closer call, since someone waiting on a ticket arguably wants an email the
  // moment it is resolved; it would need a real column on NotificationSettings
  // to be opt-in, which is deliberately out of scope here. It is in-app only for
  // now and can be gated later without a schema change to this table.
  NEW_USER: null,
  NEW_SUPPORT_REQUEST: null,
  SUPPORT_STATUS_CHANGED: null,
};

// The columns queueEmail has to read. Narrower selects are cheaper, but this one
// runs on every notification the product creates.
const EMAIL_PREF_FIELDS = [
  "emailNotifications",
  "taskReminders",
  "deadlineReminders",
  "projectUpdates",
  "aiSuggestions",
];

class NotificationService {
  constructor(prisma, cacheService = null, realtimeService = null, { queue = null } = {}) {
    this.prisma = prisma;
    this.cacheService = cacheService;
    this.realtimeService = realtimeService;
    this.emailQueue = queue;
  }

  /**
   * Notification email is opt-in per user via NotificationSettings.
   * emailNotifications. In-app delivery above is unaffected either way.
   *
   * Two switches have to agree before anything is queued: the master
   * emailNotifications, and — when the type has one — the per-type switch from
   * EMAIL_TYPE_GATES. Both are read from the same row so the decision costs a
   * single query regardless of how many gates a type passes through.
   */
  async queueEmail(userId, { title, message, type }) {
    if (!this.emailQueue) return;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        notificationSettings: { select: Object.fromEntries(EMAIL_PREF_FIELDS.map((f) => [f, true])) },
      },
    });

    const prefs = user?.notificationSettings;
    if (!prefs?.emailNotifications) return;

    // `=== false` rather than a truthiness check on purpose: every gate column
    // defaults to true, so "unset" has to mean "do email". Only an explicit opt
    // out may suppress a type.
    const gate = EMAIL_TYPE_GATES[type];
    if (gate && prefs[gate] === false) return;

    try {
      await this.emailQueue.add(
        "send-email",
        { email: user.email, title, message, type },
        {
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 },
          removeOnComplete: true,
          removeOnFail: 100,
        }
      );
    } catch (error) {
      // A queue outage must never fail the in-app notification the user already
      // received; the socket push and DB row are the source of truth.
      console.error(`[NotificationService] could not enqueue email: ${error.message}`);
    }
  }

  async create(
    userId,
    { taskId = null, title, message, type, taskSuggestionId = null, conversationId = null }
  ) {
    if (this.cacheService) {
      await this.cacheService.invalidatePattern(`app:${userId}:notifications:*`);
    }

    const notification = await this.prisma.notification.create({
      data: { userId, taskId, title, message, type, taskSuggestionId, conversationId },
    });

    await this.queueEmail(userId, { title, message, type });

    if (this.realtimeService) {
      const payload = await this.prisma.notification.findUnique({
        where: { id: notification.id },
        include: { task: { select: { id: true, priority: true } } },
      });
      this.realtimeService.emitToUser(userId, "notification", payload ?? notification);
    }

    return notification;
  }

  async list(userId, query = {}) {
    const { page, limit, skip, take } = getPagination(query);
    const unreadOnly = query.unreadOnly === "true";

    const cacheKey =
      this.cacheService &&
      this.cacheService.buildKey(userId, "notifications", {
        page,
        limit,
        unreadOnly: String(unreadOnly),
      });

    const cached =
      cacheKey && (await this.cacheService.getJson(cacheKey));
    if (cached) {
      return cached;
    }

    const where = {
      userId,
      ...(unreadOnly ? { readAt: null } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        include: { task: { select: { id: true, priority: true } } },
      }),
      this.prisma.notification.count({ where }),
    ]);

    const result = { items, pagination: buildMeta(page, limit, total) };

    if (cacheKey) {
      await this.cacheService.setJson(cacheKey, result);
    }

    return result;
  }

  async get(userId, id) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId },
    });

    if (!notification) {
      throw new AppError("Notification not found", 404);
    }

    return notification;
  }

  async markRead(userId, id) {
    await this.get(userId, id);

    const updated = await this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });

    if (this.cacheService) {
      await this.cacheService.invalidatePattern(`app:${userId}:notifications:*`);
    }

    return updated;
  }

  async markAllRead(userId) {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });

    if (this.cacheService) {
      await this.cacheService.invalidatePattern(`app:${userId}:notifications:*`);
    }
  }

  async remove(userId, id) {
    await this.get(userId, id);

    await this.prisma.notification.delete({ where: { id } });

    if (this.cacheService) {
      await this.cacheService.invalidatePattern(`app:${userId}:notifications:*`);
    }
  }
}

module.exports = NotificationService;