const asyncHandler = require("../../utils/asyncHandler.js");
const AppError = require("../../utils/AppError.js");

class AttachmentController {
  constructor(attachmentService) {
    this.attachmentService = attachmentService;
  }

  upload = asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new AppError("No file uploaded", 400);
    }

    const attachment = await this.attachmentService.addToTask(
      req.user.userId,
      req.params.taskId,
      req.file
    );

    return res.status(201).json({ success: true, data: { attachment } });
  });

  remove = asyncHandler(async (req, res) => {
    await this.attachmentService.remove(req.user.userId, req.params.id);

    return res.status(200).json({ success: true, message: "Attachment deleted" });
  });
}

module.exports = AttachmentController;