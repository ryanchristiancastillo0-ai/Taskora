const asyncHandler = require("../../utils/asyncHandler.js");

class ConversationController {
  constructor(conversationService) {
    this.conversationService = conversationService;
  }

  list = asyncHandler(async (req, res) => {
    const data = await this.conversationService.list(req.user.userId, req.query);

    return res.status(200).json({ success: true, data });
  });

  get = asyncHandler(async (req, res) => {
    const conversation = await this.conversationService.get(
      req.user.userId,
      req.params.id
    );

    return res.status(200).json({ success: true, data: { conversation } });
  });

  create = asyncHandler(async (req, res) => {
    const conversation = await this.conversationService.startGroup(
      req.user.userId,
      req.body,
      req.file
    );

    return res.status(201).json({ success: true, data: { conversation } });
  });

  getOrCreateDirect = asyncHandler(async (req, res) => {
    const conversation = await this.conversationService.getOrCreateDirect(
      req.user.userId,
      req.params.userId
    );

    return res.status(200).json({ success: true, data: { conversation } });
  });

  update = asyncHandler(async (req, res) => {
    const conversation = await this.conversationService.updateGroup(
      req.user.userId,
      req.params.id,
      req.body
    );

    return res.status(200).json({ success: true, data: { conversation } });
  });

  updateIcon = asyncHandler(async (req, res) => {
    const conversation = await this.conversationService.updateGroup(
      req.user.userId,
      req.params.id,
      {},
      req.file
    );

    return res.status(200).json({ success: true, data: { conversation } });
  });

  addMember = asyncHandler(async (req, res) => {
    const conversation = await this.conversationService.addMember(
      req.user.userId,
      req.params.id,
      req.body.userId
    );

    return res.status(200).json({ success: true, data: { conversation } });
  });

  removeMember = asyncHandler(async (req, res) => {
    const result = await this.conversationService.removeMember(
      req.user.userId,
      req.params.id,
      req.params.memberUserId
    );

    return res.status(200).json({ success: true, data: result });
  });

  markRead = asyncHandler(async (req, res) => {
    const result = await this.conversationService.markRead(
      req.user.userId,
      req.params.id
    );

    return res.status(200).json({ success: true, data: result });
  });
}

module.exports = ConversationController;