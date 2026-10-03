const express = require("express");
const prisma = require("../../config/prisma.js");

const NoteService = require("../../services/user/noteService.js");
const NoteController = require("../../controllers/user/noteController.js");
const authMiddleware = require("../../middleware/authMiddleware.js");

const router = express.Router();

const noteService = new NoteService(prisma);
const noteController = new NoteController(noteService);

router.get("/", authMiddleware, noteController.list);
router.post("/", authMiddleware, noteController.create);
router.get("/:id", authMiddleware, noteController.get);
router.patch("/:id", authMiddleware, noteController.update);
router.delete("/:id", authMiddleware, noteController.remove);

module.exports = router;