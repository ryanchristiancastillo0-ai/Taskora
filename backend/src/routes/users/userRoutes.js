const express = require("express");
const prisma = require("../../config/prisma.js");

const UserService = require("../../services/users/userService.js");
const PasswordService = require("../../services/auth/passwordService.js");
const FileService = require("../../services/platform/fileService.js");
const UserController = require("../../controllers/users/userController.js");
const authMiddleware = require("../../middleware/authMiddleware.js");
const { uploadMiddleware } = require("../../middleware/uploadMiddleware.js");
const { emailService } = require("../../config/container.js");

const router = express.Router();

const passwordService = new PasswordService();
const fileService = new FileService();
const userService = new UserService(prisma, passwordService, fileService, emailService);
const userController = new UserController(userService);

router.get("/me", authMiddleware, userController.getCurrentUser);
router.patch("/me", authMiddleware, userController.updateUser);
router.delete("/me", authMiddleware, userController.deleteUser);
router.post("/me/password", authMiddleware, userController.changePassword);
router.post(
  "/me/password/code",
  authMiddleware,
  userController.requestChangePasswordCode
);
router.post(
  "/me/password/verify",
  authMiddleware,
  userController.changePasswordWithCode
);
router.post(
  "/me/email/code",
  authMiddleware,
  userController.requestEmailChangeCode
);
router.post(
  "/me/email/verify",
  authMiddleware,
  userController.verifyEmailChange
);
router.post("/me/avatar", authMiddleware, uploadMiddleware, userController.uploadAvatar);

module.exports = router;