const { z } = require("zod");
const { nullableText, dateSchema } = require("../../utils/validate.js");

const dateOrNull = dateSchema
  .nullable()
  .or(z.literal(""))
  .transform((value) => (value === "" ? null : value));

const createGoalSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(300),
    description: nullableText(5000).nullable().optional(),
    category: z
      .enum(["CAREER", "HEALTH", "LEARNING", "PERSONAL"])
      .optional(),
    targetDate: dateOrNull.optional(),
    progress: z.number().int().min(0).max(100).optional(),
    status: z.enum(["ACTIVE", "COMPLETED", "ARCHIVED"]).optional(),
  })
  .strict();

const updateGoalSchema = createGoalSchema.partial();

module.exports = { createGoalSchema, updateGoalSchema };