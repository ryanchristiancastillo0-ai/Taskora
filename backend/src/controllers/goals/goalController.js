const asyncHandler = require("../../utils/asyncHandler.js");

class GoalController {
  constructor(goalService) {
    this.goalService = goalService;
  }

  list = asyncHandler(async (req, res) => {
    const data = await this.goalService.list(req.user.userId, req.query);

    return res.status(200).json({ success: true, data });
  });

  get = asyncHandler(async (req, res) => {
    const goal = await this.goalService.get(req.user.userId, req.params.id);

    return res.status(200).json({ success: true, data: { goal } });
  });

  create = asyncHandler(async (req, res) => {
    const goal = await this.goalService.create(req.user.userId, req.body);

    return res.status(201).json({ success: true, data: { goal } });
  });

  update = asyncHandler(async (req, res) => {
    const goal = await this.goalService.update(
      req.user.userId,
      req.params.id,
      req.body
    );

    return res.status(200).json({ success: true, data: { goal } });
  });

  remove = asyncHandler(async (req, res) => {
    await this.goalService.remove(req.user.userId, req.params.id);

    return res.status(200).json({ success: true, message: "Goal deleted" });
  });
}

module.exports = GoalController;