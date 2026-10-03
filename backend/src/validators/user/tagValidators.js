const { z } = require("zod");
const { nullableText } = require("../../utils/validate.js");

const createTagSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(100),
    color: nullableText(20).nullable(),
  })
  .strict();

const updateTagSchema = createTagSchema.partial();

module.exports = { createTagSchema, updateTagSchema };