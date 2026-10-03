const { z } = require("zod");
const { nullableText } = require("../../utils/validate.js");

// How many files a single chat message may carry. The upload middleware reads
// this so the HTTP layer and the service layer can never disagree.
const MAX_ATTACHMENTS_PER_MESSAGE = 10;

// Keep the picker allowlist and the server allowlist identical so an emoji
// outside this set is rejected at the API boundary rather than stored blindly.
const REACTION_EMOJIS = ["👍", "❤️", "😂", "🎉", "😮", "😢"];

const sendMessageSchema = z
  .object({
    content: nullableText(5000).nullable().optional(),
  })
  .strict();

const setReactionSchema = z
  .object({
    emoji: z
      .string()
      .trim()
      .min(1)
      .refine((value) => REACTION_EMOJIS.includes(value), {
        message: "Unsupported reaction",
      }),
  })
  .strict();

module.exports = {
  sendMessageSchema,
  setReactionSchema,
  REACTION_EMOJIS,
  MAX_ATTACHMENTS_PER_MESSAGE,
};
