const express = require("express");

const { prisma, cacheService } = require("../../config/container.js");

const ProjectService = require("../../services/projects/projectService.js");
const ProjectController = require("../../controllers/projects/projectController.js");
const authMiddleware = require("../../middleware/authMiddleware.js");

const router = express.Router();

const projectService = new ProjectService(prisma, cacheService);
const projectController = new ProjectController(projectService);

router.get("/", authMiddleware, projectController.list);
router.post("/", authMiddleware, projectController.create);
router.get("/:id", authMiddleware, projectController.get);
router.patch("/:id", authMiddleware, projectController.update);
router.delete("/:id", authMiddleware, projectController.remove);

module.exports = router;