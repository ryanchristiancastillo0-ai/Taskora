const asyncHandler = require("../../utils/asyncHandler.js");

class HabitController {
  constructor(habitService) {
    this.habitService = habitService;
  }

  list = asyncHandler(async (req, res) => {
    const data = await this.habitService.list(req.user.userId, req.query);

    return res.status(200).json({ success: true, data });
  });

  get = asyncHandler(async (req, res) => {
    const habit = await this.habitService.get(req.user.userId, req.params.id);

    return res.status(200).json({ success: true, data: { habit } });
  });

  create = asyncHandler(async (req, res) => {
    const habit = await this.habitService.create(req.user.userId, req.body);

    return res.status(201).json({ success: true, data: { habit } });
  });

  update = asyncHandler(async (req, res) => {
    const habit = await this.habitService.update(
      req.user.userId,
      req.params.id,
      req.body
    );

    return res.status(200).json({ success: true, data: { habit } });
  });

  remove = asyncHandler(async (req, res) => {
    await this.habitService.remove(req.user.userId, req.params.id);

    return res.status(200).json({ success: true, message: "Habit deleted" });
  });

  toggle = asyncHandler(async (req, res) => {
    const habit = await this.habitService.toggle(req.user.userId, req.params.id);

    return res.status(200).json({ success: true, data: { habit } });
  });
}

module.exports = HabitController;