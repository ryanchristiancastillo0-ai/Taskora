const express = require("express");
const prisma = require("../../config/prisma.js");

const AuthService = require("../../services/auth/authService.js");
const PasswordService = require("../../services/auth/passwordService.js");
const GoogleAuthService = require("../../services/auth/googleAuthService.js");
const AuthController = require("../../controllers/auth/authController.js");
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
// Google Sign-In. Built here beside AuthService rather than in the container for
// the same reason: it takes the same prisma, the same passwordService and the
// same supportService, so a router that built its own copies would be signing
// users in against a different view of the accounts than every other route reads.
//
// Note what it does NOT receive: no emailValidationService. ZeroBounce checks
// whether an address is deliverable, and a Google address has already been
// verified by Google as part of the exchange — spending a paid credit to ask
// again would add a failure mode and remove none.
const googleAuthService = new GoogleAuthService(
  prisma,
  passwordService,
  supportService
);
const authController = new AuthController(authService, auditService, googleAuthService);

router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/refresh", authController.refresh);
router.post("/logout", authMiddleware, authController.logout);
router.post("/forgot-password", authController.forgotPassword);
router.post("/verify-reset-code", authController.verifyResetCode);
router.post("/reset-password", authController.resetPassword);
router.get("/me", authMiddleware, authController.getCurrentUser);

// Google Sign-In. GET, not POST, and deliberately outside authMiddleware: the
// browser navigates to /google and Google navigates back to /google/callback, so
// both requests are top-level page loads with no body and nobody signed in yet.
//
// They are not exempt from the /api/auth rate limiter mounted in app.js — two
// requests per attempt is well inside a budget sized for a login form — and
// spending that budget is what stops the callback being used as an unauthenticated
// token-exchange oracle.
router.get("/google", authController.googleStart);
router.get("/google/callback", authController.googleCallback);

module.exports = router;