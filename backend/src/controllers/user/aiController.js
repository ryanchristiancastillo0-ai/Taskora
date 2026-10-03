const asyncHandler = require("../../utils/asyncHandler.js");

class AIController {
  constructor(aiService) {
    this.aiService = aiService;
  }

  createConversation = asyncHandler(async (req, res) => {
    const conversation = await this.aiService.createConversation(
      req.user.userId,
      req.body
    );

    return res.status(201).json({ success: true, data: { conversation } });
  });

  listConversations = asyncHandler(async (req, res) => {
    const data = await this.aiService.listConversations(
      req.user.userId,
      req.query
    );

    return res.status(200).json({ success: true, data });
  });

  getConversation = asyncHandler(async (req, res) => {
    const conversation = await this.aiService.getConversation(
      req.user.userId,
      req.params.id
    );

    return res.status(200).json({ success: true, data: { conversation } });
  });

  deleteConversation = asyncHandler(async (req, res) => {
    await this.aiService.deleteConversation(req.user.userId, req.params.id);

    return res.status(200).json({ success: true, message: "Conversation deleted" });
  });

  updateConversation = asyncHandler(async (req, res) => {
    const conversation = await this.aiService.updateTitle(
      req.user.userId,
      req.params.id,
      req.body
    );

    return res.status(200).json({ success: true, data: { conversation } });
  });

  sendMessage = asyncHandler(async (req, res) => {
    const result = await this.aiService.sendMessage(
      req.user.userId,
      req.params.id,
      req.body,
      req.files || []
    );

    return res.status(200).json({ success: true, data: result });
  });

  recommend = asyncHandler(async (req, res) => {
    const result = await this.aiService.recommend(req.user.userId, req.body);

    return res.status(200).json({ success: true, data: result });
  });

  getDashboardSummary = asyncHandler(async (req, res) => {
    const data = await this.aiService.getDashboardSummary(req.user.userId);

    return res.status(200).json({ success: true, data });
  });

  getPreferences = asyncHandler(async (req, res) => {
    const aiProvider = await this.aiService.getProviderPreference(
      req.user.userId
    );

    return res.status(200).json({
      success: true,
      data: { aiProvider },
    });
  });
}

module.exports = AIController;