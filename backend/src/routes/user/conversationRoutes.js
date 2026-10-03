const express = require("express");

const ConversationService = require("../../services/user/conversationService.js");
const MessageService = require("../../services/user/messageService.js");
const ConversationController = require("../../controllers/user/conversationController.js");
const MessageController = require("../../controllers/user/messageController.js");
const {
  MAX_ATTACHMENTS_PER_MESSAGE,
} = require("../../validators/user/messageValidators.js");
const authMiddleware = require("../../middleware/authMiddleware.js");
const { createUpload } = require("../../middleware/uploadMiddleware.js");
const {
  prisma,
  realtimeService,
  notificationService,
  fileService,
} = require("../../config/container.js");

const router = express.Router();

const conversationService = new ConversationService(
  prisma,
  realtimeService,
  fileService
);
const messageService = new MessageService(
  prisma,
  realtimeService,
  notificationService,
  fileService
);
const conversationController = new ConversationController(conversationService);
const messageController = new MessageController(messageService);

const uploadIcon = createUpload({ fieldName: "icon" });
// Group creation is multipart so the logo can be uploaded in the same request
// that creates the conversation. JSON clients still work: multer passes
// non-multipart bodies straight through.
const uploadCreateIcon = createUpload({ fieldName: "icon" });
const uploadAttachments = createUpload({
  fieldName: "attachments",
  maxFiles: MAX_ATTACHMENTS_PER_MESSAGE,
});

router.get("/", authMiddleware, conversationController.list);
router.post("/", authMiddleware, uploadCreateIcon, conversationController.create);

router.get("/direct/:userId", authMiddleware, conversationController.getOrCreateDirect);

router.get("/:id", authMiddleware, conversationController.get);
router.patch("/:id", authMiddleware, conversationController.update);
router.post("/:id/read", authMiddleware, conversationController.markRead);

router.post(
  "/:id/icon",
  authMiddleware,
  uploadIcon,
  conversationController.updateIcon
);

router.post("/:id/members", authMiddleware, conversationController.addMember);
router.delete(
  "/:id/members/:memberUserId",
  authMiddleware,
  conversationController.removeMember
);

router.get("/:conversationId/messages", authMiddleware, messageController.list);
router.post(
  "/:conversationId/messages",
  authMiddleware,
  uploadAttachments,
  messageController.send
);

// Set/toggle the current user's single reaction on a message. Sending the same
// emoji again removes it, so the picker needs no explicit "clear" call.
router.post(
  "/:conversationId/messages/:messageId/reaction",
  authMiddleware,
  messageController.setReaction
);

module.exports = router;