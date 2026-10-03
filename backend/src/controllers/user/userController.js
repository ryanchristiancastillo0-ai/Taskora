const asyncHandler = require("../../utils/asyncHandler.js");
const AppError = require("../../utils/AppError.js");

class UserController {
  constructor(userService) {
    this.userService = userService;
  }

  getCurrentUser = asyncHandler(async (req, res) => {
    const result = await this.userService.getCurrentUser(req.user.userId);

    return res.status(200).json({
      success: true,
      data: result,
    });
  });

  updateUser = asyncHandler(async (req, res) => {
    const user = await this.userService.updateUser({
      userId: req.user.userId,
      data: req.body,
    });

    return res.status(200).json({
      success: true,
      data: { user },
    });
  });

  deleteUser = asyncHandler(async (req, res) => {
    await this.userService.deleteUser(req.user.userId);

    return res.status(200).json({
      success: true,
      message: "Account deleted",
    });
  });

  changePassword = asyncHandler(async (req, res) => {
    await this.userService.changePassword(req.user.userId, req.body);

    return res.status(200).json({
      success: true,
      message: "Password changed successfully",
    });
  });

  requestChangePasswordCode = asyncHandler(async (req, res) => {
    const result = await this.userService.requestChangePasswordCode(req.user.userId);

    return res.status(200).json({
      success: true,
      message: result.message,
    });
  });

  changePasswordWithCode = asyncHandler(async (req, res) => {
    await this.userService.changePasswordWithCode(req.user.userId, req.body);

    return res.status(200).json({
      success: true,
      message: "Password changed successfully",
    });
  });

  requestEmailChangeCode = asyncHandler(async (req, res) => {
    const result = await this.userService.requestEmailChangeCode(
      req.user.userId,
      req.body
    );

    return res.status(200).json({
      success: true,
      message: result.message,
    });
  });

  verifyEmailChange = asyncHandler(async (req, res) => {
    const user = await this.userService.verifyEmailChange(
      req.user.userId,
      req.body
    );

    return res.status(200).json({
      success: true,
      message: "Email address changed successfully",
      data: { user },
    });
  });

  uploadAvatar = asyncHandler(async (req, res) => {    if (!req.file) {
      throw new AppError("No file uploaded", 400);
    }

    const url = await this.userService.setAvatar({
      userId: req.user.userId,
      filename: req.file.filename,
    });

    return res.status(200).json({
      success: true,
      data: { avatarUrl: url },
    });
  });
}

module.exports = UserController;