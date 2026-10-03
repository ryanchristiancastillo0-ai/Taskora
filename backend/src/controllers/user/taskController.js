const asyncHandler = require("../../utils/asyncHandler.js");

class TaskController {
  constructor(taskService) {
    this.taskService = taskService;
  }

  list = asyncHandler(async (req, res) => {
    const data = await this.taskService.list(req.user.userId, req.query);

    return res.status(200).json({ success: true, data });
  });

  get = asyncHandler(async (req, res) => {
    const task = await this.taskService.get(req.user.userId, req.params.id);

    return res.status(200).json({ success: true, data: { task } });
  });

  create = asyncHandler(async (req, res) => {
    const task = await this.taskService.create(req.user.userId, req.body);

    return res.status(201).json({ success: true, data: { task } });
  });

  update = asyncHandler(async (req, res) => {
    const task = await this.taskService.update(
      req.user.userId,
      req.params.id,
      req.body
    );

    return res.status(200).json({ success: true, data: { task } });
  });

  remove = asyncHandler(async (req, res) => {
    await this.taskService.remove(req.user.userId, req.params.id);

    return res.status(200).json({ success: true, message: "Task deleted" });
  });
}

module.exports = TaskController;