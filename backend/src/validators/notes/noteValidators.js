const { z } = require("zod");
const { stringId } = require("../../utils/validate.js");

const createNoteSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(300),
    content: z.string().max(100000),
    projectId: stringId.nullable().optional(),
    pinned: z.boolean().optional(),
  })
  .strict();

const updateNoteSchema = createNoteSchema.partial();

module.exports = { createNoteSchema, updateNoteSchema };