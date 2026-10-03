const { z } = require("zod");
const { stringId, nullableText } = require("../../utils/validate.js");

/**
 * Boundary schemas for the support desk.
 *
 * Lives at `validators/support/` rather than under `user/` because both the
 * caller-facing routes and the admin triage routes validate through the same
 * shapes, and duplicating them would let the two sides drift on what a status or
 * a category is allowed to be.
 *
 * Parsed from the service, not the router, like every other schema in the
 * project — see utils/validate.js.
 */

// The seven top-level buckets of the help centre, mirrored from the frontend's
// SUPPORT_CATEGORIES in shared/constants. This is the one place the two halves
// of the product have to agree by hand, so it is worth naming explicitly: the
// detailed issue/problem tree behind each bucket lives only in the frontend and
// is extended without a migration, but the bucket itself is checked here so an
// unknown value is refused at the boundary instead of being stored as a row the
// admin console then has to filter out.
//
// Kept as a z.enum rather than a free string because an unknown category is
// never legitimate input — there is no "other" catch-all outside GENERAL.
const SUPPORT_CATEGORIES = [
  "ACCOUNT_SECURITY",
  "TASKS_PROJECTS",
  "AI_ASSISTANT",
  "NOTIFICATIONS",
  "SETTINGS_PREFERENCES",
  "REPORT_BUG",
  "GENERAL",
];

const SUPPORT_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];

// Issue and problem are slugs, not prose. The frontend owns the tree and sends
// the stable key it already had to look up to render the label, so the backend
// never has to trust or store user-typed text for these two fields. Constraining
// the charset rejects a client that has fallen out of sync with the constants
// instead of quietly writing "forgot password?" as a category path.
const slug = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9_-]+$/, "Must be a slug");

const createSupportRequestSchema = z
  .object({
    category: z.enum(SUPPORT_CATEGORIES, {
      errorMap: () => ({ message: "Unknown support category" }),
    }),
    issue: slug,
    problem: slug,
    // Optional by design. The guided flow has already recorded what the user
    // clicked through, so requiring prose here would force every ticket to
    // contain a redundant retype of the three fields above. nullableText turns
    // an empty box into null rather than rejecting the submission.
    description: nullableText(5000).nullable().optional(),
  })
  .strict();

const supportRequestParamsSchema = z.object({
  id: stringId,
});

// Caller-side history. Page/limit only: a user has no business filtering their
// own tickets by category from the UI, and every extra query parameter is
// another value that has to be whitelisted before it reaches a Prisma where.
const supportRequestsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const createSupportFeedbackSchema = z
  .object({
    // Integer 1-5, not a float: a 4.5-star average would need a different column
    // type and the UI only ever collects whole stars.
    rating: z
      .number({ errorMap: () => ({ message: "Choose a rating from 1 to 5" }) })
      .int("Choose a rating from 1 to 5")
      .min(1, "Choose a rating from 1 to 5")
      .max(5, "Choose a rating from 1 to 5"),
    comment: nullableText(2000).nullable().optional(),
  })
  .strict();

// Admin triage list. Not `.strict()` — a query string is allowed to carry things
// a cache-buster added, and rejecting the whole request over an unexpected key is
// hostile. Unknown keys are stripped instead.
//
// "ALL" is a UI sentinel rather than a filter value. Sending it through would ask
// the API for rows whose status is literally the word ALL, so callers convert it
// to undefined before dispatch; the service ignores it defensively too.
const adminSupportQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  q: z.string().trim().max(200).optional(),
  status: z.enum(["ALL", ...SUPPORT_STATUSES]).optional(),
  category: z.enum(["ALL", ...SUPPORT_CATEGORIES]).optional(),
  sort: z
    .enum([
      "createdAt_desc",
      "createdAt_asc",
      "ticketNumber_desc",
      "ticketNumber_asc",
      "status_asc",
    ])
    .optional(),
});

// Status and resolution note are the only two things an admin may change about a
// ticket. The refine exists so an accidental empty PATCH is a clear 400 rather
// than a silent no-op that looks like it saved.
const adminSupportUpdateSchema = z
  .object({
    status: z.enum(SUPPORT_STATUSES).optional(),
    resolutionNote: nullableText(5000).nullable().optional(),
  })
  .strict()
  .refine(
    (value) => value.status !== undefined || value.resolutionNote !== undefined,
    { message: "Provide a status or a resolution note to update" }
  );

module.exports = {
  SUPPORT_CATEGORIES,
  SUPPORT_STATUSES,
  createSupportRequestSchema,
  supportRequestParamsSchema,
  supportRequestsQuerySchema,
  createSupportFeedbackSchema,
  adminSupportQuerySchema,
  adminSupportUpdateSchema,
};