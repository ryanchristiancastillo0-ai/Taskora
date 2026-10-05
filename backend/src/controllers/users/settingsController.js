const asyncHandler = require("../../utils/asyncHandler.js");

class SettingsController {
  constructor(settingsService) {
    this.settingsService = settingsService;
  }

  getSettings = asyncHandler(async (req, res) => {
    const data = await this.settingsService.getSettings(req.user.userId);

    return res.status(200).json({
      success: true,
      data,
    });
  });

  updateSettings = asyncHandler(async (req, res) => {
    const settings = await this.settingsService.updateSettings(
      req.user.userId,
      req.body
    );

    return res.status(200).json({
      success: true,
      data: { settings },
    });
  });

  updateNotificationSettings = asyncHandler(async (req, res) => {
    const { notificationSettings, notificationSound } =
      await this.settingsService.updateNotificationSettings(
        req.user.userId,
        req.body
      );

    return res.status(200).json({
      success: true,
      data: { notificationSettings, notificationSound },
    });
  });

  sendNotificationTestEmail = asyncHandler(async (req, res) => {
    const result = await this.settingsService.sendNotificationTestEmail(
      req.user.userId
    );

    return res.status(200).json({
      success: true,
      data: result,
    });
  });
}

module.exports = SettingsController;