const asyncHandler = require("../../utils/asyncHandler.js");

class SubtaskController {
  constructor(subtaskService) {
    this.subtaskService = subtaskService;
  }

  listByTask = asyncHandler(async (req, res) => {
    const subtasks = await this.subtaskService.listByTask(
      req.user.userId,
      req.params.taskId
    );

    return res.status(200).json({ success: true, data: { subtasks } });
  });

  create = asyncHandler(async (req, res) => {
    const subtask = await this.subtaskService.create(
      req.user.userId,
      req.params.taskId,
      req.body
    );

    return res.status(201).json({ success: true, data: { subtask } });
  });

  update = asyncHandler(async (req, res) => {
    const subtask = await this.subtaskService.update(
      req.user.userId,
      req.params.id,
      req.body
    );

    return res.status(200).json({ success: true, data: { subtask } });
  });

  remove = asyncHandler(async (req, res) => {
    await this.subtaskService.remove(req.user.userId, req.params.id);

    return res.status(200).json({ success: true, message: "Subtask deleted" });
  });
}

module.exports = SubtaskController;