// DailySummaryService: the "emails a recap of your day" feature.
//
// Two halves:
//
//  Scheduler (sendDueSummaries): a recurring BullMQ scan finds accounts whose
//  local wall-clock time has reached the daily send hour and whose switches
//  allow mail at all (master emailNotifications AND the per-type dailySummary),
//  and queues one "send-daily-summary" job per account.
//
//  Delivery (deliver): renders the recap at send time against fresh data, sends
//  it through the shared email transport, and only then records the day as
//  sent. Recording at delivery rather than enqueue is what makes a delivery
//  failure retryable: the job carries no last-sent claim, and once it actually
//  lands, the timestamp stops any further scan from re-queueing the same day.
//
// Everything above the auto-injected hour is idempotent:
//  - The repeatable scan job is keyed by a fixed jobId in the queue.
//  - Per-user jobs are keyed by (userId, calendar-day), so BullMQ drops a
//    duplicate even if two scans overlap.
//  - dailySummaryLastSentAt is compared against the same calendar the recap is
//    written in — the user's timezone — never UTC.

const AppError = require("../../utils/AppError.js");
const { startOfDayInZone, hourInZone, dayKeyInZone } = require("../../utils/date.js");

const DAY_MS = 86_400_000;
const SEND_JOB = "send-daily-summary";
const ACTIVE_STATUSES = ["TODO", "IN_PROGRESS"];

class DailySummaryService {
  constructor(prisma, emailService, emailQueue = null, env = process.env) {
    this.prisma = prisma;
    this.emailService = emailService;
    this.emailQueue = emailQueue;
    this.env = env;
  }

  get targetHour() {
    const raw = Number(this.env.DAILY_SUMMARY_HOUR);
    // Clamped so a botched env value degrades to the default rather than never
    // matching any local hour (or matching every hour).
    return Number.isFinite(raw) && raw >= 0 && raw <= 23 ? raw : 8;
  }

  timezoneOf(user) {
    return user?.settings?.timezone || this.env.APP_TIMEZONE || "UTC";
  }

  formatTime(date, timeZone) {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  formatDateLabel(now, timeZone) {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "long",
      month: "short",
      day: "numeric",
    }).format(now);
  }

  /** Runs on the recurring scan job. Finds eligible accounts and queues a recap. */
  async sendDueSummaries({ now = new Date() } = {}) {
    if (!this.emailQueue) return { scanned: 0, queued: 0 };

    const users = await this.prisma.user.findMany({
      where: {
        status: "ACTIVE",
        notificationSettings: {
          is: { emailNotifications: true, dailySummary: true },
        },
      },
      select: {
        id: true,
        email: true,
        settings: { select: { timezone: true } },
        notificationSettings: { select: { dailySummaryLastSentAt: true } },
      },
    });

    const hour = this.targetHour;
    let scanned = 0;
    let queued = 0;

    for (const user of users) {
      const timeZone = this.timezoneOf(user);
      if (hourInZone(now, timeZone) !== hour) continue;

      const lastSent = user.notificationSettings?.dailySummaryLastSentAt;
      if (lastSent && lastSent.getTime() >= startOfDayInZone(now, timeZone).getTime()) {
        continue;
      }

      scanned += 1;

      try {
        await this.emailQueue.add(
          SEND_JOB,
          { userId: user.id, email: user.email },
          {
            jobId: `daily-summary-${user.id}-${dayKeyInZone(now, timeZone)}`,
            attempts: 3,
            backoff: { type: "exponential", delay: 5000 },
            removeOnComplete: true,
            removeOnFail: 100,
          }
        );
        queued += 1;
      } catch (error) {
        // A queue outage must not silently kill the scan; other users keep going.
        console.error(`[DailySummary] could not enqueue for ${user.id}: ${error.message}`);
      }
    }

    return { scanned, queued };
  }

  /**
   * Renders and sends the recap for one account, then records delivery.
   * Runs on the "send-daily-summary" email-queue job, so a mid-flight failure
   * retries via BullMQ's backoff rather than re-queueing from the scan.
   */
  async deliver(userId) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        settings: { select: { timezone: true } },
      },
    });

    if (!user?.email) {
      throw new AppError("No email address is on this account", 400);
    }

    const now = new Date();
    const timeZone = this.timezoneOf(user);
    const todayStart = startOfDayInZone(now, timeZone);
    const tomorrowStart = new Date(todayStart.getTime() + DAY_MS);
    const yesterdayStart = new Date(todayStart.getTime() - DAY_MS);
    const weekEnd = new Date(tomorrowStart.getTime() + 6 * DAY_MS);

    const activeWhere = {
      userId,
      status: { in: ACTIVE_STATUSES },
    };

    const [overdueRows, dueTodayRows, upcomingRows, completedYesterdayCount] = [
      await this.prisma.task.findMany({
        where: { ...activeWhere, dueDate: { lt: todayStart } },
        orderBy: { dueDate: "asc" },
        take: 8,
      }),
      await this.prisma.task.findMany({
        where: {
          ...activeWhere,
          dueDate: { gte: todayStart, lt: tomorrowStart },
        },
        orderBy: { dueDate: "asc" },
        take: 10,
      }),
      await this.prisma.task.findMany({
        where: {
          ...activeWhere,
          dueDate: { gte: tomorrowStart, lte: weekEnd },
        },
        orderBy: { dueDate: "asc" },
        take: 5,
      }),
      await this.prisma.task.count({
        where: {
          userId,
          status: "COMPLETED",
          completedAt: { gte: yesterdayStart, lt: todayStart },
        },
      }),
    ];

    const shape = (rows) =>
      rows.map((task) => ({
        title: task.title,
        priority: task.priority,
        time: task.dueDate ? this.formatTime(task.dueDate, timeZone) : null,
      }));

    // Hand the template already-labelled rows so it stays a pure renderer.
    await this.emailService.sendDailySummary({
      email: user.email,
      firstName: user.firstName,
      dateLabel: this.formatDateLabel(now, timeZone),
      overdue: shape(overdueRows),
      dueToday: shape(dueTodayRows),
      upcoming: shape(upcomingRows),
      completedYesterdayCount,
    });

    // Delivery is done: claim the day. A failure above never reaches here, so
    // lastSent reflects a real inbox arrival, not an enqueue.
    await this.prisma.notificationSettings.updateMany({
      where: { userId },
      data: { dailySummaryLastSentAt: now },
    });

    return { email: user.email, dateKey: dayKeyInZone(now, timeZone) };
  }
}

module.exports = DailySummaryService;