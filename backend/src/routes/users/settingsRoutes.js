const express = require("express");
const prisma = require("../../config/prisma.js");

const SettingsService = require("../../services/users/settingsService.js");
const NotificationSoundService = require("../../services/notifications/notificationSoundService.js");
const EmailService = require("../../services/platform/emailService.js");
const SettingsController = require("../../controllers/users/settingsController.js");
const authMiddleware = require("../../middleware/authMiddleware.js");

const router = express.Router();

const notificationSoundService = new NotificationSoundService(prisma);
const settingsService = new SettingsService(prisma, notificationSoundService, new EmailService());
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

module.exports = router;