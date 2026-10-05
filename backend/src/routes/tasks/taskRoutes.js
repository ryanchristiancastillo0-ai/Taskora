const express = require("express");

const { taskService } = require("../../config/container.js");

const TaskController = require("../../controllers/tasks/taskController.js");
const authMiddleware = require("../../middleware/authMiddleware.js");

const router = express.Router();

const taskController = new TaskController(taskService);

router.get("/", authMiddleware, taskController.list);
router.post("/", authMiddleware, taskController.create);
router.get("/:id", authMiddleware, taskController.get);
router.patch("/:id", authMiddleware, taskController.update);
router.delete("/:id", authMiddleware, taskController.remove);

module.exports = router;