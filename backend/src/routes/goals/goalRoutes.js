const express = require("express");
const prisma = require("../../config/prisma.js");

const GoalService = require("../../services/goals/goalService.js");
const GoalController = require("../../controllers/goals/goalController.js");
const authMiddleware = require("../../middleware/authMiddleware.js");

const router = express.Router();

const goalService = new GoalService(prisma);
const goalController = new GoalController(goalService);

router.get("/", authMiddleware, goalController.list);
router.post("/", authMiddleware, goalController.create);
router.get("/:id", authMiddleware, goalController.get);
router.patch("/:id", authMiddleware, goalController.update);
router.delete("/:id", authMiddleware, goalController.remove);

module.exports = router;