const express = require("express");
const prisma = require("../../config/prisma.js");

const AttachmentService = require("../../services/attachments/attachmentService.js");
const AttachmentController = require("../../controllers/attachments/attachmentController.js");
const authMiddleware = require("../../middleware/authMiddleware.js");
const { uploadMiddleware } = require("../../middleware/uploadMiddleware.js");

const router = express.Router();

const attachmentService = new AttachmentService(prisma);
const attachmentController = new AttachmentController(attachmentService);

router.post(
  "/tasks/:taskId/attachments",
  authMiddleware,
  uploadMiddleware,
  attachmentController.upload
);

router.delete("/attachments/:id", authMiddleware, attachmentController.remove);

module.exports = router;