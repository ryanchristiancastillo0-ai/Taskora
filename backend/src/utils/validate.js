const { z } = require("zod");
const AppError = require("./AppError");

function parseSchema(schema, data) {
  const result = schema.safeParse(data ?? {});

  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));

    throw new AppError("Validation failed", 400, issues);
  }

  return result.data;
}

const stringId = z.string().min(1).max(100);

const emailSchema = z.string().email().max(320);

const passwordSchema = z.string().min(8).max(200);

// Trimmed text that normalizes empty strings to null.
const nullableText = (max = 2000) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? null : value));

// Nullable text that cannot become null once provided.
const optionalText = (min = 1, max = 2000) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? null : value));

const timeString = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be in HH:MM (24-hour) format");

// ISO-8601 datetime. Accepts date-only strings ("YYYY-MM-DD") as well and
// normalizes them to midnight UTC so they can be written to DateTime fields.
const dateSchema = z.preprocess(
  (value) => {
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return `${value}T00:00:00.000Z`;
    }
    return value;
  },
  z.string().datetime({ offset: true }).or(z.string().datetime({ offset: false }))
);

// Removes undefined keys so they are not written to Prisma.
function definedOnly(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined)
  );
}

module.exports = {
  parseSchema,
  stringId,
  emailSchema,
  passwordSchema,
  nullableText,
  optionalText,
  timeString,
  dateSchema,
  definedOnly,
};