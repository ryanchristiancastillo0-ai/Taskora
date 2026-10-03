const express = require("express");

const FriendshipService = require("../../services/user/friendshipService.js");
const FriendshipController = require("../../controllers/user/friendshipController.js");
const authMiddleware = require("../../middleware/authMiddleware.js");
const {
  prisma,
  notificationService,
} = require("../../config/container.js");

const router = express.Router();

const friendshipService = new FriendshipService(prisma, notificationService);
const friendshipController = new FriendshipController(friendshipService);

router.get("/", authMiddleware, friendshipController.listFriends);
router.get("/search", authMiddleware, friendshipController.search);
router.get("/requests", authMiddleware, friendshipController.listRequests);
router.post("/requests", authMiddleware, friendshipController.send);
router.post("/requests/:id/respond", authMiddleware, friendshipController.respond);
router.post("/requests/:id/cancel", authMiddleware, friendshipController.cancel);
router.delete("/:userId", authMiddleware, friendshipController.removeFriend);

module.exports = router;