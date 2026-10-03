const express = require("express");

const { taskSuggestionService } = require("../../config/container.js");

const TaskSuggestionController = require("../../controllers/user/taskSuggestionController.js");
const authMiddleware = require("../../middleware/authMiddleware.js");

const router = express.Router();

const taskSuggestionController = new TaskSuggestionController(
  taskSuggestionService
);

router.get("/", authMiddleware, taskSuggestionController.list);
router.get("/:id", authMiddleware, taskSuggestionController.get);
router.post("/:id/accept", authMiddleware, taskSuggestionController.accept);
router.post("/:id/skip", authMiddleware, taskSuggestionController.skip);

module.exports = router;