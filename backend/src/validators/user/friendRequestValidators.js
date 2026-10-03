const { z } = require("zod");
const { stringId } = require("../../utils/validate.js");

const friendRequestSchema = z
  .object({
    receiverId: stringId,
  })
  .strict();

const respondSchema = z
  .object({
    action: z.enum(["accept", "decline"]),
  })
  .strict();

module.exports = { friendRequestSchema, respondSchema };