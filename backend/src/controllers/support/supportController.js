const asyncHandler = require("../../utils/asyncHandler.js");

/**
 * The caller's side of the support desk.
 *
 * Every handler is mounted behind authMiddleware alone, so by the time one runs
 * req.user is a signed-in account; adminGuard is deliberately not used here,
 * because the whole point of these routes is that an ordinary user can reach
 * them.
 *
 * Note the single-resource reads wrap their result in a named key
 * (`{ request }`) rather than returning it bare. That is the user-side
 * convention — see taskController.js — and admin's list endpoints return bare
 * because the admin convention is to hand the service's object straight through.
 */
class SupportController {
  constructor(supportService) {
    this.supportService = supportService;
  }

  createRequest = asyncHandler(async (req, res) => {
    const data = await this.supportService.createRequest(req.user.userId, req.body);

    return res.status(201).json({ success: true, data });
  });

  listRequests = asyncHandler(async (req, res) => {
    const data = await this.supportService.listRequests(req.user.userId, req.query);

    return res.status(200).json({ success: true, data });
  });

  getRequest = asyncHandler(async (req, res) => {
    const data = await this.supportService.getRequest(
      req.user.userId,
      req.params.id
    );

    return res.status(200).json({ success: true, data });
  });

  submitFeedback = asyncHandler(async (req, res) => {
    const data = await this.supportService.submitFeedback(req.user.userId, req.body);

    return res.status(201).json({ success: true, data });
  });

  getMyFeedback = asyncHandler(async (req, res) => {
    const data = await this.supportService.getMyFeedback(req.user.userId, req.query);

    return res.status(200).json({ success: true, data });
  });
}

module.exports = SupportController;