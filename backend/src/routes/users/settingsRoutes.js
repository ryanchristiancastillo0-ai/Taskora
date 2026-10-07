const express = require("express");
const prisma = require("../../config/prisma.js");

const SettingsService = require("../../services/users/settingsService.js");
const NotificationSoundService = require("../../services/notifications/notificationSoundService.js");
const PushService = require("../../services/notifications/pushService.js");
const EmailService = require("../../services/platform/emailService.js");
const SettingsController = require("../../controllers/users/settingsController.js");
const authMiddleware = require("../../middleware/authMiddleware.js");

const router = express.Router();

const notificationSoundService = new NotificationSoundService(prisma);
const settingsService = new SettingsService(
  prisma,
  notificationSoundService,
  new EmailService(),
  new PushService(prisma)
);
const settingsController = new SettingsController(settingsService);

router.get("/", authMiddleware, settingsController.getSettings);
router.patch("/", authMiddleware, settingsController.updateSettings);
router.patch(
  "/notifications",
  authMiddleware,
  settingsController.updateNotificationSettings
);
// Declared after the PATCH above on purpose: Express matches "/notifications"
// and "/notifications/test-email" independently, but keeping the more specific
// path next to its own handler stops a later wildcard from swallowing it.
router.post(
  "/notifications/test-email",
  authMiddleware,
  settingsController.sendNotificationTestEmail
);

// Web Push. The config route is how the client learns the VAPID public key;
// subscribe/unsubscribe store or forget one device. All three declared after
// the broad PATCH above so the exact paths never compete with a wildcard — the
// same reason test-email sits where it does.
router.get(
  "/notifications/push/config",
  authMiddleware,
  settingsController.getPushConfig
);
router.post(
  "/notifications/push/subscribe",
  authMiddleware,
  settingsController.subscribePush
);
router.delete(
  "/notifications/push/subscribe",
  authMiddleware,
  settingsController.unsubscribePush
);

module.exports = router;