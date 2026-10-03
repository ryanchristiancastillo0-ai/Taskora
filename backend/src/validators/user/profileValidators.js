const { z } = require("zod");
const { nullableText, timeString } = require("../../utils/validate.js");

const workStyleEnum = ["LONG_FOCUSED_SESSIONS", "SHORT_FOCUSED_SESSIONS", "FLEXIBLE", "VARIED"];
const planningStyleEnum = ["DAILY", "WEEKLY", "MONTHLY", "MINIMALIST", "DETAILED"];
const taskOrganizationEnum = ["BY_PRIORITY", "BY_PROJECT", "BY_DEADLINE", "BY_ENERGY"];
const timeOfDayEnum = ["MORNING", "AFTERNOON", "EVENING", "NIGHT", "VARIES"];
const breakPreferenceEnum = ["FREQUENT_SHORT_BREAKS", "LONG_BREAKS", "NO_BREAKS"];
const reminderPreferenceEnum = ["NONE", "MINIMAL", "MODERATE", "FREQUENT"];
const difficultyLevelEnum = ["NONE", "LOW", "MODERATE", "HIGH"];
const taskDetailLevelEnum = ["HIGH_LEVEL", "MEDIUM", "GRANULAR"];
const aiResponseStyleEnum = ["CONCISE", "DETAILED", "FRIENDLY", "DIRECT"];
const aiProviderEnum = ["GEMINI", "OPENROUTER"];

// Accepts a valid enum value, an empty string (-> null), or null.
function nullableEnum(values) {
  return z
    .enum(values)
    .nullable()
    .or(z.literal(""))
    .transform((value) => (value === "" ? null : value));
}

const profileFields = {
  occupationOrRole: nullableText(120),
  productivityGoal: nullableText(1000),
  workStyle: nullableEnum(workStyleEnum),
  planningStyle: nullableEnum(planningStyleEnum),
  preferredTaskOrganization: nullableEnum(taskOrganizationEnum),
  mostProductiveTime: nullableEnum(timeOfDayEnum),
  usualStartTime: timeString.nullable(),
  usualEndTime: timeString.nullable(),
  averageFocusDuration: z.number().int().min(5).max(720).nullable(),
  breakPreference: nullableEnum(breakPreferenceEnum),
  reminderPreference: nullableEnum(reminderPreferenceEnum),
  difficultyStartingTasks: nullableEnum(difficultyLevelEnum),
  difficultyFinishingTasks: nullableEnum(difficultyLevelEnum),
  preferredTaskDetailLevel: nullableEnum(taskDetailLevelEnum),
  preferredAIResponseStyle: nullableEnum(aiResponseStyleEnum),
  aiProvider: nullableEnum(aiProviderEnum),
};

const optionalProfileFields = Object.fromEntries(
  Object.entries(profileFields).map(([key, schema]) => [key, schema.optional()])
);

const onboardingSchema = z
  .object({
    preferredName: z
      .string()
      .trim()
      .min(1, "A preferred name is required")
      .max(80),
    skipped: z.boolean().optional(),
    ...optionalProfileFields,
  })
  .strict();

const updateProfileSchema = z
  .object({
    preferredName: z
      .string()
      .trim()
      .min(1, "A preferred name is required")
      .max(80)
      .optional(),
    ...optionalProfileFields,
  })
  .strict();

module.exports = {
  profileFields,
  onboardingSchema,
  updateProfileSchema,
  aiProviderEnum,
};