const express = require("express");
const prisma = require("../../config/prisma.js");

const HabitService = require("../../services/user/habitService.js");
const HabitController = require("../../controllers/user/habitController.js");
const authMiddleware = require("../../middleware/authMiddleware.js");

const router = express.Router();

const habitService = new HabitService(prisma);
const habitController = new HabitController(habitService);

router.get("/", authMiddleware, habitController.list);
router.post("/", authMiddleware, habitController.create);
router.get("/:id", authMiddleware, habitController.get);
router.patch("/:id", authMiddleware, habitController.update);
router.delete("/:id", authMiddleware, habitController.remove);
router.post("/:id/toggle", authMiddleware, habitController.toggle);

module.exports = router;