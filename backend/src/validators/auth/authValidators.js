const { z } = require("zod");
const { emailSchema, passwordSchema, nullableText } = require("../../utils/validate.js");

const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: nullableText(100).nullable().optional(),
});

const loginSchema = z.object({
  email: z.string().trim().min(1, "Email is required").max(320),
  password: z.string().min(1, "Password is required").max(200),
  // Undeclared keys are stripped by Zod, so this must be here to reach login().
  rememberMe: z.boolean().optional().default(false),
});

const forgotPasswordSchema = z.object({
  email: emailSchema,
});

const resetPasswordSchema = z.object({
  email: emailSchema,
  code: z.string().trim().min(1, "Code is required").max(10),
  newPassword: passwordSchema,
});

const verifyResetCodeSchema = z.object({
  email: emailSchema,
  code: z.string().trim().min(1, "Code is required").max(10),
});

module.exports = {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyResetCodeSchema,
};