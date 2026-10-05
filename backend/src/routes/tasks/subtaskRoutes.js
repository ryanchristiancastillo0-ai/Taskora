const express = require("express");
const prisma = require("../../config/prisma.js");

const SubtaskService = require("../../services/tasks/subtaskService.js");
const SubtaskController = require("../../controllers/tasks/subtaskController.js");
const authMiddleware = require("../../middleware/authMiddleware.js");

const router = express.Router();

const subtaskService = new SubtaskService(prisma);
const subtaskController = new SubtaskController(subtaskService);

router.get("/tasks/:taskId/subtasks", authMiddleware, subtaskController.listByTask);
router.post("/tasks/:taskId/subtasks", authMiddleware, subtaskController.create);
router.patch("/subtasks/:id", authMiddleware, subtaskController.update);
router.delete("/subtasks/:id", authMiddleware, subtaskController.remove);

module.exports = router;