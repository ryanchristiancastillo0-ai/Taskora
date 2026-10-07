"use strict";

/**
 * Browser push and the daily summary email — the two notification channels that
 * send on their own schedules rather than on a request.
 *
 * PushService is exercised with a fake WebPush transport so no VAPID network
 * calls happen; the suite checks the gates (unconfigured, switch off, no
 * devices), the endpoint lifecycle (subscribe/unsubscribe) and the one
 * interesting delivery behaviour: a 404/410 from the push service removes the
 * dead device while anything else only counts as a failed attempt.
 *
 * DailySummaryService talks to the memory DB and a stub mailer/queue: the scan
 * must only enqueue accounts whose local hour has reached the send hour and
 * who have not already been sent to today, and deliver must render from fresh
 * task rows and claim the day only after the email left.
 */

const { db, resetState } = require("../support/harness");
// The prisma module is mocked (tests/jest/setup/mocks.js) to the memoryDb
// proxy, so requiring it here hands each service the same client the app uses.
const prisma = require("../../src/config/prisma.js");

const PushService = require("../../src/services/notifications/pushService.js");
const DailySummaryService = require("../../src/services/notifications/dailySummaryService.js");
const { startOfDayInZone, dayKeyInZone } = require("../../src/utils/date.js");

beforeEach(resetState);

// ------------------------------------------------------------------ push

const VAPID_ENV = {
  VAPID_SUBJECT: "mailto:tests@taskora.dev",
  VAPID_PUBLIC_KEY: "test-public-key",
  VAPID_PRIVATE_KEY: "test-private-key",
};

function pushService(env = VAPID_ENV) {
  const webPush = {
    setVapidDetails: jest.fn(),
    sendNotification: jest.fn(async () => {}),
  };
  const service = new PushService(prisma, webPush, env);
  return { service, webPush };
}

function seedSubscription({ userId, endpoint = "https://push.example/abc" }) {
  return db.seed("pushSubscription", {
    userId,
    endpoint,
    p256dh: "p256dh-bytes",
    auth: "auth-bytes",
    userAgent: "Test Browser",
  });
}

describe("PushService", () => {
  describe("config()", () => {
    it("reports the VAPID public key when the server is configured", () => {
      const { service } = pushService();
      expect(service.config()).toEqual({
        enabled: true,
        publicKey: "test-public-key",
      });
    });

    it("reports disabled when any VAPID variable is missing", () => {
      const { service } = pushService({
        VAPID_SUBJECT: "mailto:tests@taskora.dev",
        VAPID_PUBLIC_KEY: "test-public-key",
      });
      expect(service.config()).toEqual({ enabled: false, publicKey: null });
      expect(service.isConfigured()).toBe(false);
    });
  });

  describe("subscribe()", () => {
    it("rejects when the endpoint or keys are missing", async () => {
      const { service } = pushService();
      await expect(service.subscribe("user_1", {})).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it("creates a new subscription on first subscribe", async () => {
      const { service } = pushService();
      const row = await service.subscribe("user_1", {
        endpoint: "https://push.example/abc",
        p256dh: "k1",
        auth: "a1",
        userAgent: "Chrome",
      });

      expect(row.endpoint).toBe("https://push.example/abc");
      expect(row.userId).toBe("user_1");
      expect(row.p256dh).toBe("k1");
      expect(row.auth).toBe("a1");
      expect(row.userAgent).toBe("Chrome");
    });

    it("refreshes an existing row when the same endpoint re-subscribes", async () => {
      const { service } = pushService();
      seedSubscription({ userId: "user_1" });

      const start = db.rows("pushSubscription").length;
      const row = await service.subscribe("user_2", {
        endpoint: "https://push.example/abc",
        p256dh: "k2",
        auth: "a2",
      });

      // Upsert keyed on the endpoint: the row count does not grow.
      expect(db.rows("pushSubscription")).toHaveLength(start);
      expect(row.userId).toBe("user_2");
      expect(row.p256dh).toBe("k2");
    });
  });

  describe("unsubscribe()", () => {
    it("removes only the caller's own subscription", async () => {
      const { service } = pushService();
      seedSubscription({ userId: "user_1", endpoint: "https://push.example/a" });
      seedSubscription({ userId: "user_1", endpoint: "https://push.example/b" });
      seedSubscription({ userId: "user_2", endpoint: "https://push.example/a" });

      const result = await service.unsubscribe("user_1", "https://push.example/a");

      expect(result).toEqual({ removed: true });
      const remaining = db.rows("pushSubscription").map((row) => row.endpoint);
      expect(remaining).toEqual(["https://push.example/b", "https://push.example/a"]);
    });

    it("reports nothing was removed for an unknown endpoint", async () => {
      const { service } = pushService();
      await expect(service.unsubscribe("user_1", "https://push.example/zzz")).resolves.toEqual({
        removed: false,
      });
    });
  });

  describe("sendToUser()", () => {
    it("is a silent no-op without VAPID configuration", async () => {
      const { service, webPush } = pushService({ VAPID_SUBJECT: null });
      const { sent, failed } = await service.sendToUser("user_1", { title: "Hi" });

      expect({ sent, failed }).toEqual({ sent: 0, failed: 0 });
      expect(webPush.sendNotification).not.toHaveBeenCalled();
    });

    it("does not push when the push switch is explicitly off", async () => {
      const { service, webPush } = pushService();
      db.seed("user", { id: "user_1", email: "u@example.com" });
      db.seed("notificationSettings", { userId: "user_1", pushNotifications: false });
      seedSubscription({ userId: "user_1" });

      const { sent } = await service.sendToUser("user_1", { title: "Hi" });

      expect(sent).toBe(0);
      expect(webPush.sendNotification).not.toHaveBeenCalled();
    });

    it("delivers to every device with the JSON payload", async () => {
      const { service, webPush } = pushService();
      db.seed("user", { id: "user_1", email: "u@example.com" });
      seedSubscription({ userId: "user_1", endpoint: "https://push.example/a" });
      seedSubscription({ userId: "user_1", endpoint: "https://push.example/b" });

      const result = await service.sendToUser("user_1", {
        title: "Task due",
        body: "Finish the report",
        url: "/tasks",
        tag: "notif_1",
      });

      expect(result).toEqual({ sent: 2, failed: 0 });
      expect(webPush.sendNotification).toHaveBeenCalledTimes(2);
      const payload = JSON.parse(webPush.sendNotification.mock.calls[0][1]);
      expect(payload).toMatchObject({
        title: "Task due",
        body: "Finish the report",
        url: "/tasks",
        tag: "notif_1",
      });
    });

    it("drops a device the push service reports as gone (410)", async () => {
      const { service, webPush } = pushService();
      db.seed("user", { id: "user_1", email: "u@example.com" });
      const row = seedSubscription({ userId: "user_1", endpoint: "https://push.example/gone" });

      const gone = new Error("gone");
      gone.statusCode = 410;
      webPush.sendNotification.mockRejectedValueOnce(gone);

      const result = await service.sendToUser("user_1", { title: "Hi" });

      expect(result).toEqual({ sent: 0, failed: 0 });
      expect(db.findRow("pushSubscription", row.id)).toBeNull();
    });

    it("counts and keeps a device on a transient failure", async () => {
      const { service, webPush } = pushService();
      db.seed("user", { id: "user_1", email: "u@example.com" });
      const row = seedSubscription({ userId: "user_1" });

      webPush.sendNotification.mockRejectedValueOnce(new Error("network"));

      const result = await service.sendToUser("user_1", { title: "Hi" });

      expect(result).toEqual({ sent: 0, failed: 1 });
      expect(db.findRow("pushSubscription", row.id)).not.toBeNull();
    });
  });
});

// ------------------------------------------------------------- daily summary

function summaryService(env = { APP_TIMEZONE: "UTC", DAILY_SUMMARY_HOUR: "8" }) {
  const mail = { sendDailySummary: jest.fn(async () => ({})) };
  const queue = { add: jest.fn(async () => ({ id: "stub-job" })) };
  const service = new DailySummaryService(prisma, mail, queue, env);
  return { service, mail, queue };
}

// memoryDb models a to-one relation as the fk living on the PARENT row (a user
// carries the id of its notificationSettings), so the settings row is seeded and
// then linked to the user the way nested `connect` writes would.
function seedSummaryUser({
  email = "user@example.com",
  timezone = "UTC",
  status = "ACTIVE",
  prefs = { emailNotifications: true, dailySummary: true },
} = {}) {
  const userRow = db.seed("user", {
    id: "user_1",
    email,
    firstName: "Rey",
    status,
    settings: { timezone },
  });
  const settingsRow = db.seed("notificationSettings", {
    userId: "user_1",
    ...prefs,
  });
  // memoryDb models a to-one like Prisma's `connect` write: the parent row
  // carries the relation's fk column pointing at the child's id. Without it the
  // `settings.notificationSettings` projection would resolve null.
  userRow.userId = settingsRow.id;
  return settingsRow;
}

// A fixed instant whose local parts are unambiguous whether the host runs UTC
// or anything else: the hour is chosen far enough off midnight in every zone.
const SCAN_NOW = new Date("2026-10-07T08:30:00.000Z");

describe("DailySummaryService", () => {
  describe("targetHour", () => {
    it("defaults to 8 for a missing env value", () => {
      const { service } = summaryService({ APP_TIMEZONE: "UTC" });
      expect(service.targetHour).toBe(8);
    });

    it("clamps an out-of-range env value instead of never matching", () => {
      const { service } = summaryService({ APP_TIMEZONE: "UTC", DAILY_SUMMARY_HOUR: "99" });
      expect(service.targetHour).toBe(8);
    });

    it("honours a valid number", () => {
      const { service } = summaryService({ APP_TIMEZONE: "UTC", DAILY_SUMMARY_HOUR: "6" });
      expect(service.targetHour).toBe(6);
    });
  });

  describe("sendDueSummaries()", () => {
    it("queues a recap for an eligible account whose local hour has reached the send hour", async () => {
      const { service, queue } = summaryService();
      seedSummaryUser();

      const result = await service.sendDueSummaries({ now: SCAN_NOW });

      expect(result).toEqual({ scanned: 1, queued: 1 });
      expect(queue.add).toHaveBeenCalledTimes(1);
      const [name, data, options] = queue.add.mock.calls[0];
      expect(name).toBe("send-daily-summary");
      expect(data).toEqual({ userId: "user_1", email: "user@example.com" });
      expect(options.jobId).toBe(`daily-summary-user_1-${dayKeyInZone(SCAN_NOW, "UTC")}`);
    });

    it("skips an account before the send hour in its own timezone", async () => {
      const { service, queue } = summaryService();
      seedSummaryUser();

      const early = new Date("2026-10-07T07:00:00.000Z");
      const result = await service.sendDueSummaries({ now: early });

      expect(result).toEqual({ scanned: 0, queued: 0 });
      expect(queue.add).not.toHaveBeenCalled();
    });

    it("does not re-queue a day that was already delivered", async () => {
      const { service, queue } = summaryService();
      seedSummaryUser({
        prefs: {
          emailNotifications: true,
          dailySummary: true,
          dailySummaryLastSentAt: startOfDayInZone(SCAN_NOW, "UTC"),
        },
      });

      const result = await service.sendDueSummaries({ now: SCAN_NOW });

      expect(result).toEqual({ scanned: 0, queued: 0 });
      expect(queue.add).not.toHaveBeenCalled();
    });

    it("excludes an account whose master email switch is off", async () => {
      const { service, queue } = summaryService();
      seedSummaryUser({ prefs: { emailNotifications: false, dailySummary: true } });

      await service.sendDueSummaries({ now: SCAN_NOW });

      expect(queue.add).not.toHaveBeenCalled();
    });

    it("excludes a deactivated account", async () => {
      const { service, queue } = summaryService();
      seedSummaryUser({ status: "INACTIVE" });

      await service.sendDueSummaries({ now: SCAN_NOW });

      expect(queue.add).not.toHaveBeenCalled();
    });
  });

  describe("deliver()", () => {
    it("renders the day against fresh task rows, sends, then marks the day as sent", async () => {
      const { service, mail } = summaryService();
      seedSummaryUser();

      const now = new Date();
      const todayStart = startOfDayInZone(now, "UTC");
      const tomorrowStart = new Date(todayStart.getTime() + 86_400_000);
      const yesterdayStart = new Date(todayStart.getTime() - 86_400_000);

      db.seed("task", {
        userId: "user_1",
        title: "Late call",
        status: "TODO",
        dueDate: new Date(todayStart.getTime() - 1000),
      });
      db.seed("task", {
        userId: "user_1",
        title: "Ship release",
        status: "IN_PROGRESS",
        priority: "HIGH",
        dueDate: new Date(todayStart.getTime() + 1000),
      });
      db.seed("task", {
        userId: "user_1",
        title: "Plan retro",
        status: "TODO",
        dueDate: new Date(tomorrowStart.getTime() + 1000),
      });
      db.seed("task", {
        userId: "user_1",
        title: "Done yesterday",
        status: "COMPLETED",
        completedAt: new Date(yesterdayStart.getTime() + 1000),
      });

      const result = await service.deliver("user_1");

      expect(result.email).toBe("user@example.com");
      expect(result.dateKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      expect(mail.sendDailySummary).toHaveBeenCalledTimes(1);
      const args = mail.sendDailySummary.mock.calls[0][0];
      expect(args.email).toBe("user@example.com");
      expect(args.firstName).toBe("Rey");
      expect(args.overdue.map((row) => row.title)).toEqual(["Late call"]);
      expect(args.dueToday.map((row) => row.title)).toEqual(["Ship release"]);
      expect(args.upcoming.map((row) => row.title)).toEqual(["Plan retro"]);
      expect(args.overdue[0].time).toMatch(/^\d{1,2}:\d{2} (AM|PM)$/);
      expect(args.dueToday[0].priority).toBe("HIGH");
      expect(args.completedYesterdayCount).toBe(1);

      const settings = db.rows("notificationSettings").find((row) => row.userId === "user_1");
      expect(settings.dailySummaryLastSentAt.getTime()).toBeGreaterThanOrEqual(todayStart.getTime());
    });

    it("throws for an account with no email address", async () => {
      const { service, mail } = summaryService();
      db.seed("user", { id: "user_1", email: "" });

      await expect(service.deliver("user_1")).rejects.toMatchObject({ statusCode: 400 });
      expect(mail.sendDailySummary).not.toHaveBeenCalled();
    });
  });
});