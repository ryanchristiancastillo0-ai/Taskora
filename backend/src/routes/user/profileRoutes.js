const express = require("express");
const prisma = require("../../config/prisma.js");

const PersonalizationService = require("../../services/user/personalizationService.js");
const ProfileController = require("../../controllers/user/profileController.js");
const authMiddleware = require("../../middleware/authMiddleware.js");

const router = express.Router();

const personalizationService = new PersonalizationService(prisma);
const profileController = new ProfileController(personalizationService);

router.get("/", authMiddleware, profileController.getProfile);
router.patch("/", authMiddleware, profileController.updateProfile);
router.post("/onboarding", authMiddleware, profileController.completeOnboarding);

module.exports = router;