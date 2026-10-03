const { z } = require("zod");

// Query parameters are validated here rather than left to the router because
// two of them are whitelists that end up inside a Prisma `where` and
// `orderBy`. Handing a raw string to `orderBy` would let a caller name any
// column the client happens to know about, so these go through the same
// parseSchema path the body validators use.
//
// Unlike the body schemas these are not `.strict()`. A query string is allowed
// to carry things a cache-buster or an analytics tag added, and rejecting the
// whole request over an unexpected key is hostile; unknown keys are stripped
// instead.

const adminUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  q: z.string().trim().max(200).optional(),
  // `status` is the account state an admin can change (User.status). The
  // activity state — still around or gone quiet — is derived, not filterable,
  // because it is a function of RefreshToken.lastUsedAt rather than a column.
  status: z.enum(["ALL", "ACTIVE", "SUSPENDED"]).optional(),
  role: z.enum(["ALL", "USER", "ADMIN"]).optional(),
  sort: z
    .enum([
      "joinedAt_desc",
      "joinedAt_asc",
      "name_asc",
      "name_desc",
      "tasks_desc",
    ])
    .optional(),
});

// A year and a half of months is the most a dashboard chart can usefully draw.
const adminGrowthQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(18).optional(),
});

const adminRangeQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(31).optional(),
});

// A window long enough for a reports page to be worth opening. 365 is the cap
// rather than 31 because the reports charts are monthly, unlike the dashboard's
// daily ones.
const adminReportRangeQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(24).optional(),
});

const adminTasksQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  q: z.string().trim().max(200).optional(),
  // `overdue` is a computed bucket rather than a column, so it is a boolean
  // switch instead of a member of the status enum.
  status: z.enum(["ALL", "TODO", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).optional(),
  priority: z.enum(["ALL", "LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  overdue: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  userId: z.string().trim().max(100).optional(),
  sort: z
    .enum(["createdAt_desc", "createdAt_asc", "dueDate_asc", "priority_desc"])
    .optional(),
});

const adminProjectsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  q: z.string().trim().max(200).optional(),
  status: z.enum(["ALL", "ACTIVE", "COMPLETED", "ARCHIVED"]).optional(),
  userId: z.string().trim().max(100).optional(),
  sort: z
    .enum(["updatedAt_desc", "createdAt_desc", "name_asc", "tasks_desc"])
    .optional(),
});

const adminAiUsageQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).optional(),
  provider: z.enum(["ALL", "GEMINI", "OPENROUTER"]).optional(),
  userId: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const adminNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  // Written out rather than pulled from the Prisma client: the validators layer
  // takes no Prisma import anywhere else. The cost of repeating the list is that
  // adding a NotificationType now means touching schema.prisma and this file,
  // which is noted here so the next person does not assume it is generated.
  //
  // "ALL" is accepted alongside the real types so the table's "All types" filter
  // is a real request rather than a 400. The service treats it as no filter,
  // the same as an omitted value.
  type: z
    .enum([
      "ALL",
      "TASK_DUE",
      "TASK_REMINDER",
      "PROJECT_UPDATE",
      "AI_SUGGESTION",
      "SYSTEM",
      "FRIEND_REQUEST",
      "NEW_MESSAGE",
      "TASK_PATTERN_SUGGESTION",
      // Admin-directed and support-lifecycle types, added with the support desk.
      // NEW_USER and NEW_SUPPORT_REQUEST are the ones that make an admin's bell
      // ring for someone else's action, so they are the reason an admin needs to
      // be able to filter by them here.
      "NEW_USER",
      "NEW_SUPPORT_REQUEST",
      "SUPPORT_STATUS_CHANGED",
    ])
    .optional(),
  // `status` here is read state, not the recipient's account status.
  status: z.enum(["ALL", "READ", "UNREAD"]).optional(),
  days: z.coerce.number().int().min(1).max(90).optional(),
  q: z.string().trim().max(200).optional(),
});

// The audit trail reader.
//
// `action` and `entity` are bounded free strings rather than the enums the other
// query schemas use, which is a deliberate exception. The trail is append-only
// over time: a strict enum would mean every newly audited action needs a backend
// deploy before its events are queryable at all, and an event that cannot be
// filtered is worse than one filtered by a string. Both values are only ever
// compared for equality inside a parameterized Prisma `where`, so there is no
// injection surface here — the reason the other schemas use enums is `orderBy`,
// which takes a column name, and this schema's sort is the enum below.
//
// Date bounds are full ISO instants, not bare "YYYY-MM-DD". The console's date
// inputs are local calendar days, and the browser is the only thing that knows
// the admin's timezone — so the client converts local midnight and local 23:59
// to UTC and sends those. Reinterpreting a bare date in server time here would
// silently drop or duplicate a day at either end of the range.
const auditInstant = z
  .string()
  .datetime({ offset: true })
  .or(z.string().datetime({ offset: false }))
  .transform((value) => new Date(value));

const adminAuditLogsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    // Searches the action, the entity, the entity id and the actor's name or
    // address, word by word, like every other list in the console.
    q: z.string().trim().max(200).optional(),
    action: z.string().trim().max(191).optional(),
    entity: z.string().trim().max(191).optional(),
    userId: z.string().trim().max(100).optional(),
    from: auditInstant.optional(),
    to: auditInstant.optional(),
    sort: z.enum(["createdAt_desc", "createdAt_asc"]).optional(),
  })
  // An inverted range would otherwise reach Prisma as a `where` that matches
  // nothing, which reads as "no events" rather than as the mistake it is.
  .refine(
    (value) => !value.from || !value.to || value.from <= value.to,
    {
      message: "'from' must not be after 'to'",
      path: ["from"],
    }
  );

// Route params are validated too: a cuid is a fixed shape, and an unvalidated
// id would otherwise travel straight into a Prisma where clause.
const adminUserParamsSchema = z.object({
  id: z.string().trim().min(1).max(100),
});

// Role and status are the only two things an admin may change about an account.
// Names, email and password stay out on purpose: those have their own
// verification flows (email change codes, password reset codes) and letting the
// console bypass them would quietly remove account recovery.
const adminUserUpdateSchema = z
  .object({
    role: z.enum(["USER", "ADMIN"]).optional(),
    status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  })
  .refine((value) => value.role !== undefined || value.status !== undefined, {
    message: "Provide a role or a status to update",
  });

// The header's single search box. It is a *preview* of three tables, not a
// fourth one, so it takes a term and a per-group cap rather than the page/limit
// and the status/role/priority filters each table has.
//
// There is no `status` or `sort` here on purpose: a dropdown that silently hid
// suspended accounts, or ordered tasks by priority instead of by date, would
// send someone to a table that disagrees with the list they clicked through.
// The term is passed straight to the three list queries unchanged, so the
// matches are exactly the rows the destination table would show for it.
const adminSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  // Capped low and hard: this runs three queries on every keystroke behind a
  // debounce, and the client only ever renders the first handful. The cap also
  // stops one request from asking for a thousand rows of each type.
  limit: z.coerce.number().int().min(1).max(10).optional(),
});

// The admin copilot's question. Bounded like every other free-text field in the
// codebase: it is stored nowhere, but it goes into a provider prompt, so an
// unbounded string is a way to spend someone else's tokens in one request.
const adminAskSchema = z.object({
  question: z.string().trim().min(1, "Ask a question").max(500),
});

module.exports = {
  adminUsersQuerySchema,
  adminGrowthQuerySchema,
  adminRangeQuerySchema,
  adminSearchQuerySchema,
  adminReportRangeQuerySchema,
  adminTasksQuerySchema,
  adminProjectsQuerySchema,
  adminAiUsageQuerySchema,
  adminNotificationsQuerySchema,
  adminAuditLogsQuerySchema,
  adminUserParamsSchema,
  adminUserUpdateSchema,
  adminAskSchema,
};
