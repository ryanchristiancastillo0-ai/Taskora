const { z } = require("zod");
const { nullableText } = require("../../utils/validate.js");

const createHabitSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(120),
    frequency: z.enum(["DAILY", "WEEKLY", "CUSTOM"]).optional(),
    color: nullableText(20).nullable().optional(),
  })
  .strict();

const updateHabitSchema = createHabitSchema.partial();

module.exports = { createHabitSchema, updateHabitSchema };