const express = require("express");

const { prisma, cacheService } = require("../../config/container.js");

const NotificationService = require("../../services/notifications/notificationService.js");
const NotificationSoundService = require("../../services/notifications/notificationSoundService.js");
const NotificationController = require("../../controllers/notifications/notificationController.js");
const authMiddleware = require("../../middleware/authMiddleware.js");

const router = express.Router();

const appNotificationService = new NotificationService(prisma, cacheService);
const notificationSoundService = new NotificationSoundService(prisma);
const notificationController = new NotificationController(
  appNotificationService,
  notificationSoundService
);

router.get("/", authMiddleware, notificationController.list);
// Must stay above "/:id" or Express would match "sounds" as a notification id.
router.get("/sounds", authMiddleware, notificationController.listSounds);
router.get("/:id", authMiddleware, notificationController.get);
router.patch("/:id/read", authMiddleware, notificationController.markRead);
router.patch("/read-all", authMiddleware, notificationController.markAllRead);
router.delete("/:id", authMiddleware, notificationController.remove);

module.exports = router;