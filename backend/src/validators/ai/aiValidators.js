const { z } = require("zod");
const { stringId } = require("../../utils/validate.js");

const createConversationSchema = z
  .object({
    title: z.string().trim().max(200).optional(),
  })
  .strict();

const sendMessageSchema = z
  .object({
    message: z
      .string()
      .trim()
      .min(1, "Message is required")
      .max(10000),
  })
  .strict();

const recommendSchema = z
  .object({
    request: z.string().trim().min(1, "Request is required").max(10000),
    projectId: stringId.nullable().optional(),
    scope: z.enum(["day", "week", "month", "all"]).optional(),
  })
  .strict();

const updateConversationSchema = z
  .object({
    title: z.string().trim().max(200).optional(),
    pinned: z.boolean().optional(),
    isSpeak: z.boolean().optional(),
    voiceId: stringId.nullable().optional(),
  })
  .strict()
  .refine(
    ({ title, pinned, isSpeak, voiceId }) =>
      title !== undefined ||
      pinned !== undefined ||
      isSpeak !== undefined ||
      voiceId !== undefined,
    { message: "Provide a title, pinned, isSpeak or voiceId to update" }
  );

const speakSchema = z
  .object({
    text: z
      .string()
      .trim()
      .min(1, "Text is required")
      .max(5000, "Text is too long to speak"),
    voiceId: stringId.nullable().optional(),
  })
  .strict();

module.exports = {
  createConversationSchema,
  sendMessageSchema,
  recommendSchema,
  updateConversationSchema,
  speakSchema,
};