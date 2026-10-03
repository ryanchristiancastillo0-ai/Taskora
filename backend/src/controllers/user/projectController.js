const asyncHandler = require("../../utils/asyncHandler.js");

class ProjectController {
  constructor(projectService) {
    this.projectService = projectService;
  }

  list = asyncHandler(async (req, res) => {
    const data = await this.projectService.list(req.user.userId, req.query);

    return res.status(200).json({ success: true, data });
  });

  get = asyncHandler(async (req, res) => {
    const project = await this.projectService.get(req.user.userId, req.params.id);

    return res.status(200).json({ success: true, data: { project } });
  });

  create = asyncHandler(async (req, res) => {
    const project = await this.projectService.create(req.user.userId, req.body);

    return res.status(201).json({ success: true, data: { project } });
  });

  update = asyncHandler(async (req, res) => {
    const project = await this.projectService.update(
      req.user.userId,
      req.params.id,
      req.body
    );

    return res.status(200).json({ success: true, data: { project } });
  });

  remove = asyncHandler(async (req, res) => {
    await this.projectService.remove(req.user.userId, req.params.id);

    return res.status(200).json({ success: true, message: "Project deleted" });
  });
}

module.exports = ProjectController;