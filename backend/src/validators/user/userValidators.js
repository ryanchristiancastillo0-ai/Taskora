const { z } = require("zod");
const {
  emailSchema,
  passwordSchema,
  nullableText,
} = require("../../utils/validate.js");

// `email` is deliberately absent. The address is the account identity and the
// only way it may change is the verified two-step flow below, so a plain profile
// save can never move it.
const updateUserSchema = z
  .object({
    firstName: z.string().trim().min(1, "First name is required").max(100).optional(),
    lastName: nullableText(100).nullable().optional(),
    bio: nullableText(1000).nullable().optional(),
    // Only ever written by the avatar picker: an upload sends the file to
    // POST /users/me/avatar and comes back with the stored URL, and "Remove
    // photo" clears it here. Listed because the schema is strict — without it
    // the picker has no way to take a photo back off an account.
    avatarUrl: nullableText(2048).nullable().optional(),
  })
  .strict();

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required").max(200),
    newPassword: passwordSchema,
  })
  .strict();

const changePasswordWithCodeSchema = z
  .object({
    code: z.string().trim().regex(/^\d{6}$/, "Code must be 6 digits"),
    newPassword: passwordSchema,
  })
  .strict();

// Step 1 of the email change: name the address to move to. The current
// password is required so a borrowed session cannot start the flow.
const requestEmailChangeSchema = z
  .object({
    newEmail: emailSchema,
    currentPassword: z.string().min(1, "Current password is required").max(200),
  })
  .strict();

// Step 2: spend the code. newEmail is echoed back so a mismatched pending
// request cannot be confirmed with a code issued for a different address.
const verifyEmailChangeSchema = z
  .object({
    newEmail: emailSchema,
    code: z.string().trim().regex(/^\d{6}$/, "Code must be 6 digits"),
  })
  .strict();

module.exports = {
  updateUserSchema,
  changePasswordSchema,
  changePasswordWithCodeSchema,
  requestEmailChangeSchema,
  verifyEmailChangeSchema,
};
