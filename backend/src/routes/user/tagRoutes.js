const express = require("express");
const prisma = require("../../config/prisma.js");

const TagService = require("../../services/user/tagService.js");
const TagController = require("../../controllers/user/tagController.js");
const authMiddleware = require("../../middleware/authMiddleware.js");

const router = express.Router();

const tagService = new TagService(prisma);
const tagController = new TagController(tagService);

router.get("/", authMiddleware, tagController.list);
router.post("/", authMiddleware, tagController.create);
router.get("/:id", authMiddleware, tagController.get);
router.patch("/:id", authMiddleware, tagController.update);
router.delete("/:id", authMiddleware, tagController.remove);

module.exports = router;