const asyncHandler = require("../../utils/asyncHandler.js");

/**
 * Support triage for the admin console.
 *
 * Mounted behind authMiddleware *and* adminGuard — both, always. The guard needs
 * a userId to look up, which only authMiddleware provides, and on its own it has
 * no idea who the caller is. Every route here reads every user's tickets, so
 * there is no per-row ownership filter: the admin console is the one place in
 * the product where reading another account's support request is the point.
 *
 * Separate from adminController rather than added to it, because adminController
 * is constructed from adminService and adminCopilotService and a third
 * constructor argument for four routes would be a worse trade than one more
 * import here.
 */
class AdminSupportController {
  constructor(supportService) {
    this.supportService = supportService;
  }

  listRequests = asyncHandler(async (req, res) => {
    const data = await this.supportService.listAll(req.query);

    return res.status(200).json({ success: true, data });
  });

  getRequest = asyncHandler(async (req, res) => {
    const data = await this.supportService.getOne(req.params.id);

    return res.status(200).json({ success: true, data });
  });

  updateRequest = asyncHandler(async (req, res) => {
    const data = await this.supportService.updateOne(req.params.id, req.body);

    return res.status(200).json({ success: true, data });
  });

  // The rating summary sits on the support surface rather than the users one,
  // because "how are people rating the help centre" is a support question. Same
  // numbers the dashboard would show, just scoped to the desk.
  feedbackSummary = asyncHandler(async (req, res) => {
    const data = await this.supportService.getFeedbackSummary();

    return res.status(200).json({ success: true, data });
  });

  listFeedback = asyncHandler(async (req, res) => {
    const data = await this.supportService.listFeedback(req.query);

    return res.status(200).json({ success: true, data });
  });
}

module.exports = AdminSupportController;