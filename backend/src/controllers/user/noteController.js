const asyncHandler = require("../../utils/asyncHandler.js");

class NoteController {
  constructor(noteService) {
    this.noteService = noteService;
  }

  list = asyncHandler(async (req, res) => {
    const data = await this.noteService.list(req.user.userId, req.query);

    return res.status(200).json({ success: true, data });
  });

  get = asyncHandler(async (req, res) => {
    const note = await this.noteService.get(req.user.userId, req.params.id);

    return res.status(200).json({ success: true, data: { note } });
  });

  create = asyncHandler(async (req, res) => {
    const note = await this.noteService.create(req.user.userId, req.body);

    return res.status(201).json({ success: true, data: { note } });
  });

  update = asyncHandler(async (req, res) => {
    const note = await this.noteService.update(
      req.user.userId,
      req.params.id,
      req.body
    );

    return res.status(200).json({ success: true, data: { note } });
  });

  remove = asyncHandler(async (req, res) => {
    await this.noteService.remove(req.user.userId, req.params.id);

    return res.status(200).json({ success: true, message: "Note deleted" });
  });
}

module.exports = NoteController;