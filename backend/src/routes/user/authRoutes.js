const express = require("express");
const prisma = require("../../config/prisma.js");

const AuthService = require("../../services/user/authService.js");
const PasswordService = require("../../services/user/passwordService.js");
const AuthController = require("../../controllers/user/authController.js");
const authMiddleware = require("../../middleware/authMiddleware.js");
const { emailService, emailValidationService, auditService, supportService } = require("../../config/container.js");

const router = express.Router();

const passwordService = new PasswordService();
const authService = new AuthService(
  prisma,
  passwordService,
  emailService,
  emailValidationService,
  // Fifth argument purely so register() can tell the admins a new account
  // exists. Passed in rather than required from the container inside the service
  // for the same reason as the rest: this router is loadable in a test without
  // dragging support's notification dependencies in behind it.
  supportService
);
const authController = new AuthController(authService, auditService);

router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/refresh", authController.refresh);
router.post("/logout", authMiddleware, authController.logout);
router.post("/forgot-password", authController.forgotPassword);
router.post("/verify-reset-code", authController.verifyResetCode);
router.post("/reset-password", authController.resetPassword);
router.get("/me", authMiddleware, authController.getCurrentUser);

module.exports = router;