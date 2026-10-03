const { z } = require("zod");
const { nullableText, stringId } = require("../../utils/validate.js");

// Multipart form fields always arrive as strings, so when the client posts the
// group logo in the same request that creates the group, the member list shows
// up as a JSON string. Decode it back to an array and let the array validator
// below report any genuine shape problems.
const memberIdsField = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}, z.array(stringId).min(1).max(50).optional());

const createConversationSchema = z
  .object({
    type: z.enum(["DIRECT", "GROUP"]),
    // DIRECT: target user id. GROUP: name + memberIds (creator becomes admin).
    userId: stringId.optional(),
    name: nullableText(80).nullable().optional(),
    memberIds: memberIdsField,
    iconUrl: nullableText(255).nullable().optional(),
  })
  .strict();

const updateGroupSchema = z
  .object({
    name: nullableText(80).nullable().optional(),
    iconUrl: nullableText(255).nullable().optional(),
  })
  .strict();

const addMemberSchema = z
  .object({
    userId: stringId,
  })
  .strict();

module.exports = {
  createConversationSchema,
  updateGroupSchema,
  addMemberSchema,
};