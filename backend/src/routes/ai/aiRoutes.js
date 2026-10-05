const express = require("express");

const { aiService } = require("../../config/container.js");
const AIController = require("../../controllers/ai/aiController.js");
const authMiddleware = require("../../middleware/authMiddleware.js");
const {
  createUpload,
  ALLOWED_MIME_TYPES,
} = require("../../middleware/uploadMiddleware.js");

const router = express.Router();

const aiController = new AIController(aiService);

const aiUpload = createUpload({
  fieldName: "files",
  maxFiles: 6,
  maxSizeBytes: 12 * 1024 * 1024,
  allowedTypes: new Set([
    ...ALLOWED_MIME_TYPES,
    "image/heic",
    "image/heif",
    "image/pjpeg",
  ]),
});

router.get("/preferences", authMiddleware, aiController.getPreferences);
router.get("/dashboard", authMiddleware, aiController.getDashboardSummary);
router.post("/recommend", authMiddleware, aiController.recommend);

router.get("/conversations", authMiddleware, aiController.listConversations);
router.post("/conversations", authMiddleware, aiController.createConversation);
router.get("/conversations/:id", authMiddleware, aiController.getConversation);
router.patch("/conversations/:id", authMiddleware, aiController.updateConversation);
router.delete("/conversations/:id", authMiddleware, aiController.deleteConversation);
router.post("/conversations/:id/messages", authMiddleware, aiUpload, aiController.sendMessage);

module.exports = router;