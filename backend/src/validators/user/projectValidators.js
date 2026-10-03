const { z } = require("zod");
const { nullableText } = require("../../utils/validate.js");

const createProjectSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(200),
    description: nullableText(2000).nullable().optional(),
    color: nullableText(20).nullable().optional(),
    status: z.enum(["ACTIVE", "COMPLETED", "ARCHIVED"]).optional(),
  })
  .strict();

const updateProjectSchema = createProjectSchema.partial();

module.exports = { createProjectSchema, updateProjectSchema };