const asyncHandler = require("../../utils/asyncHandler.js");

class TagController {
  constructor(tagService) {
    this.tagService = tagService;
  }

  list = asyncHandler(async (req, res) => {
    const data = await this.tagService.list(req.user.userId, req.query);

    return res.status(200).json({ success: true, data });
  });

  get = asyncHandler(async (req, res) => {
    const tag = await this.tagService.get(req.user.userId, req.params.id);

    return res.status(200).json({ success: true, data: { tag } });
  });

  create = asyncHandler(async (req, res) => {
    const tag = await this.tagService.create(req.user.userId, req.body);

    return res.status(201).json({ success: true, data: { tag } });
  });

  update = asyncHandler(async (req, res) => {
    const tag = await this.tagService.update(
      req.user.userId,
      req.params.id,
      req.body
    );

    return res.status(200).json({ success: true, data: { tag } });
  });

  remove = asyncHandler(async (req, res) => {
    await this.tagService.remove(req.user.userId, req.params.id);

    return res.status(200).json({ success: true, message: "Tag deleted" });
  });
}

module.exports = TagController;