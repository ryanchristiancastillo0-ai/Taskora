const asyncHandler = require("../../utils/asyncHandler.js");

class TaskSuggestionController {
  constructor(taskSuggestionService) {
    this.taskSuggestionService = taskSuggestionService;
  }

  list = asyncHandler(async (req, res) => {
    const data = await this.taskSuggestionService.list(req.user.userId, req.query);

    return res.status(200).json({ success: true, data });
  });

  get = asyncHandler(async (req, res) => {
    const suggestion = await this.taskSuggestionService.get(
      req.user.userId,
      req.params.id
    );

    return res.status(200).json({ success: true, data: { suggestion } });
  });

  accept = asyncHandler(async (req, res) => {
    const { suggestion, task } = await this.taskSuggestionService.accept(
      req.user.userId,
      req.params.id
    );

    return res.status(201).json({ success: true, data: { suggestion, task } });
  });

  skip = asyncHandler(async (req, res) => {
    const suggestion = await this.taskSuggestionService.skip(
      req.user.userId,
      req.params.id
    );

    return res.status(200).json({ success: true, data: { suggestion } });
  });
}

module.exports = TaskSuggestionController;