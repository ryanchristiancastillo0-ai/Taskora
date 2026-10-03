const asyncHandler = require("../../utils/asyncHandler.js");

class MessageController {
  constructor(messageService) {
    this.messageService = messageService;
  }

  list = asyncHandler(async (req, res) => {
    const data = await this.messageService.list(
      req.user.userId,
      req.params.conversationId,
      req.query
    );

    return res.status(200).json({ success: true, data });
  });

  send = asyncHandler(async (req, res) => {
    const message = await this.messageService.send(
      req.user.userId,
      req.params.conversationId,
      req.body,
      req.files
    );

    return res.status(201).json({ success: true, data: { message } });
  });

  setReaction = asyncHandler(async (req, res) => {
    const result = await this.messageService.setReaction(
      req.user.userId,
      req.params.conversationId,
      req.params.messageId,
      req.body
    );

    return res.status(200).json({ success: true, data: result });
  });
}

module.exports = MessageController;