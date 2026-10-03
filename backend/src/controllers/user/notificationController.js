const asyncHandler = require("../../utils/asyncHandler.js");

class NotificationController {
  constructor(notificationService, notificationSoundService) {
    this.notificationService = notificationService;
    this.notificationSoundService = notificationSoundService;
  }

  list = asyncHandler(async (req, res) => {
    const data = await this.notificationService.list(req.user.userId, req.query);

    return res.status(200).json({
      success: true,
      data,
    });
  });

  // The sound catalogue. This is the single source of truth for which
  // notification sounds exist — the client keeps no hardcoded list of its own.
  listSounds = asyncHandler(async (req, res) => {
    const sounds = await this.notificationSoundService.list();

    return res.status(200).json({
      success: true,
      data: sounds,
    });
  });

  get = asyncHandler(async (req, res) => {
    const notification = await this.notificationService.get(
      req.user.userId,
      req.params.id
    );

    return res.status(200).json({
      success: true,
      data: { notification },
    });
  });

  markRead = asyncHandler(async (req, res) => {
    const notification = await this.notificationService.markRead(
      req.user.userId,
      req.params.id
    );

    return res.status(200).json({
      success: true,
      data: { notification },
    });
  });

  markAllRead = asyncHandler(async (req, res) => {
    await this.notificationService.markAllRead(req.user.userId);

    return res.status(200).json({
      success: true,
      message: "All notifications marked as read",
    });
  });

  remove = asyncHandler(async (req, res) => {
    await this.notificationService.remove(req.user.userId, req.params.id);

    return res.status(200).json({
      success: true,
      message: "Notification deleted",
    });
  });
}

module.exports = NotificationController;