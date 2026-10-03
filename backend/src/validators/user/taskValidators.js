const { z } = require("zod");
const { nullableText, stringId, dateSchema } = require("../../utils/validate.js");

const dateOrNull = dateSchema
  .nullable()
  .or(z.literal(""))
  .transform((value) => (value === "" ? null : value));

const createTaskSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(500),
    description: nullableText(5000).nullable().optional(),
    projectId: stringId.nullable().optional(),
    status: z.enum(["TODO", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).optional(),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
    dueDate: dateOrNull.optional(),
    estimatedMinutes: z.number().int().min(1).max(100000).nullable().optional(),
    tagIds: z.array(stringId).max(50).optional(),
  })
  .strict();

const updateTaskSchema = createTaskSchema.partial();

module.exports = { createTaskSchema, updateTaskSchema };