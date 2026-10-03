const { z } = require("zod");

const createSubtaskSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(500),
    completed: z.boolean().optional(),
    position: z.number().int().min(0).max(100000).optional(),
  })
  .strict();

const updateSubtaskSchema = createSubtaskSchema.partial();

module.exports = { createSubtaskSchema, updateSubtaskSchema };