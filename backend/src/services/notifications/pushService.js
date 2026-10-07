// PushService: Web Push for browsers that support it.
//
// Delivery model, deliberately mirroring the email path (emailService +
// notificationService.queueEmail): the settings routes own the subscription
// lifecycle here, and notificationService.create fans every notification out to
// push just like it fans out to email. The push switch (NotificationSettings.
// pushNotifications) is the master gate, read here on every send so a turned-off
// account is never contacted again after the fact.
//
// Transport is web-push, kept behind this class so nothing else in the product
// learns the VAPID keys or the push-protocol details. When the server has no
// VAPID configuration the service degrades to a no-op send instead of failing
// the request that created a notification, matching how email already behaves.

const AppError = require("../../utils/AppError.js");

class PushService {
  constructor(prisma, webPush = null, env = process.env) {
    this.prisma = prisma;
    this.env = env;
    this.webPush = webPush || require("web-push");

    // A request never blocks on this: it only records whether the server can
    // honour push at all, which the Settings screen shows as the switch's
    // availability hint.
    if (this.isConfigured()) {
      this.webPush.setVapidDetails(
        this.env.VAPID_SUBJECT,
        this.env.VAPID_PUBLIC_KEY,
        this.env.VAPID_PRIVATE_KEY
      );
    }
  }

  isConfigured() {
    return Boolean(
      this.env.VAPID_PUBLIC_KEY &&
        this.env.VAPID_PRIVATE_KEY &&
        this.env.VAPID_SUBJECT
    );
  }

  /** Public-facing config for /settings/notifications/push/config. */
  config() {
    return {
      enabled: this.isConfigured(),
      publicKey: this.isConfigured() ? this.env.VAPID_PUBLIC_KEY : null,
    };
  }

  /**
   * Store (or refresh) one device's subscription. Keyed on the browser's
   * endpoint, because that is the only stable identity a device has: the same
   * browser re-subscribing gets the same endpoint, and two devices never share
   * one. A refresh also re-points the row at whoever holds the endpoint now.
   */
  async subscribe(userId, { endpoint, p256dh, auth, userAgent = null } = {}) {
    const parsed = {
      endpoint: String(endpoint ?? "").trim(),
      p256dh: String(p256dh ?? "").trim(),
      auth: String(auth ?? "").trim(),
    };

    if (!parsed.endpoint || !parsed.p256dh || !parsed.auth) {
      throw new AppError("endpoint, p256dh and auth are required", 400);
    }

    return this.prisma.pushSubscription.upsert({
      where: { endpoint: parsed.endpoint },
      create: { userId, ...parsed, userAgent },
      update: { userId, p256dh: parsed.p256dh, auth: parsed.auth, userAgent },
    });
  }

  /** Remove a single device, from the settings switch "off" on that device. */
  async unsubscribe(userId, endpoint) {
    if (!endpoint) return { removed: false };
    const result = await this.prisma.pushSubscription.deleteMany({
      where: { userId, endpoint: String(endpoint).trim() },
    });
    return { removed: result.count > 0 };
  }

  /**
   * Deliver one notification to every device the user has registered.
   *
   * Silent when the server has no VAPID keys, when the push switch is off, or
   * when the user has no subscriptions — those are all states where "do not
   * push" is correct, so the caller (a notification being created) must never
   * see them as errors.
   */
  async sendToUser(userId, { title, body, url = "/", tag = null } = {}) {
    if (!this.isConfigured()) return { sent: 0, failed: 0 };

    const [prefs, subscriptions] = await Promise.all([
      this.prisma.notificationSettings.findUnique({
        where: { userId },
        select: { pushNotifications: true },
      }),
      this.prisma.pushSubscription.findMany({ where: { userId } }),
    ]);

    // `=== false` not a truthiness check: the column defaults to true, so a
    // missing row means "push is on", exactly like the email gates.
    if (prefs && prefs.pushNotifications === false) return { sent: 0, failed: 0 };
    if (subscriptions.length === 0) return { sent: 0, failed: 0 };

    const payload = JSON.stringify({ title, body, url, tag });

    let sent = 0;
    let failed = 0;

    for (const subscription of subscriptions) {
      try {
        await this.webPush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          payload,
          { TTL: 60 * 60 * 24 }
        );
        sent += 1;
      } catch (error) {
        // 404/410 is the push service telling us this device is gone (app
        // removed, data cleared). Keeping the row would re-attempt it on every
        // notification forever, so it is dropped. Anything else is transient
        // and retryable.
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          await this.prisma.pushSubscription
            .deleteMany({ where: { id: subscription.id } })
            .catch(() => {});
        } else {
          failed += 1;
          console.error(
            `[PushService] send to ${subscription.endpoint} failed: ${error.message}`
          );
        }
      }
    }

    return { sent, failed };
  }
}

module.exports = PushService;