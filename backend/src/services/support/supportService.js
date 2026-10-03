const { parseSchema } = require("../../utils/validate.js");
const { getPagination, buildMeta } = require("../../utils/pagination.js");
const AppError = require("../../utils/AppError.js");
const {
  SUPPORT_STATUSES,
  createSupportRequestSchema,
  supportRequestParamsSchema,
  supportRequestsQuerySchema,
  createSupportFeedbackSchema,
  adminSupportQuerySchema,
  adminSupportUpdateSchema,
} = require("../../validators/support/supportValidators.js");

/**
 * The support desk.
 *
 * One service for both audiences rather than a user half and an admin half,
 * following the same reasoning as services/audit/auditService.js: support is
 * genuinely cross-cutting — the same row is written by the person who has the
 * problem and read by the administrator who answers it, and the ownership rule
 * that separates those two views is the part most worth expressing once. The
 * controllers stay split because the two sides authenticate differently.
 *
 * Ownership is enforced by scoping the query, never by fetching and comparing:
 * `findFirst({ where: { id, userId } })` makes another user's ticket id
 * indistinguishable from one that does not exist, which is the only answer that
 * does not confirm it is real. Every caller-facing read and update goes through
 * it.
 */

const DEFAULT_LIMIT = 20;

// The one row SupportCounter ever addresses. Fixed so the lazy upsert in
// createRequest can create it and every later ticket can increment the same row.
const COUNTER_ID = "support";

// Statuses that count as "an admin has picked this up". Used to stamp
// firstRespondedAt exactly once, so the queue can show real handling time
// instead of the original submission date.
const HANDLED_STATUSES = ["IN_PROGRESS", "RESOLVED", "CLOSED"];

// Mirrors adminService's helper. MySQL LIKE treats % and _ as wildcards, so a
// ticket numbered or described with one has to be searchable as that literal
// rather than matching everything. Prisma escapes these inside its own queries,
// so the raw path has to as well or the two branches disagree on what a search
// term means.
function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, (char) => `\\${char}`);
}

// Splits a search term into words that all have to match somewhere on the row.
// Empty input yields nothing, so callers keep their `if (parsed.q)` guard as the
// single "is this a search" decision.
function termTokens(q) {
  return String(q)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

// Recognises the reference the UI shows a user — TK-1042, or the bare 1042 a
// person might type after copying only the digits. Returns the number, or null
// when the token is not a reference at all.
//
// Needed because `ticketNumber` is an Int column: "TK-2" is not a number, so
// without this a user who copies the reference they were just shown gets zero
// results, and the search box silently becomes useless for the one identifier
// they are actually told to quote.
const REFERENCE_PATTERN = /^TK-?(\d+)$/i;

function ticketNumberFromToken(token) {
  const direct = Number(token);
  if (Number.isInteger(direct) && /^\d+$/.test(token)) {
    return direct;
  }

  const match = REFERENCE_PATTERN.exec(token);
  return match ? Number(match[1]) : null;
}

function fullName(user) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
}

class SupportService {
  constructor(prisma, notificationService = null) {
    this.prisma = prisma;
    // Optional and guarded rather than required. Registration is the one caller
    // that must not be able to fail because of a support feature, and the
    // pattern the other services already use for side-effect dependencies.
    this.notificationService = notificationService;
  }

  // ====================
  // CALLER SIDE
  // ====================

  async createRequest(userId, payload) {
    const parsed = parseSchema(createSupportRequestSchema, payload);

    // The counter draw and the insert share one transaction so a failure after
    // the increment cannot burn a number. Deriving the number as
    // MAX(ticketNumber) + 1 instead would be a race: two simultaneous tickets
    // would read the same maximum and the loser would fail on the unique index
    // with a 500 the user cannot act on.
    const created = await this.prisma.$transaction(async (tx) => {
      const counter = await tx.supportCounter.upsert({
        where: { id: COUNTER_ID },
        create: { id: COUNTER_ID, value: 1 },
        update: { value: { increment: 1 } },
        select: { value: true },
      });

      return tx.supportRequest.create({
        data: {
          ticketNumber: counter.value,
          userId,
          category: parsed.category,
          issue: parsed.issue,
          problem: parsed.problem,
          // The guided flow already recorded what the user clicked through, so an
          // empty description is a complete ticket rather than an invalid one.
          description: parsed.description ?? null,
        },
      });
    });

    await this.notifyAdminsNewRequest(created, userId);

    return { request: this.toWire(created) };
  }

  async listRequests(userId, query = {}) {
    const parsed = parseSchema(supportRequestsQuerySchema, query);
    const { page, limit, skip, take } = getPagination(parsed, DEFAULT_LIMIT);

    const where = { userId };

    const [rows, total] = await Promise.all([
      this.prisma.supportRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      this.prisma.supportRequest.count({ where }),
    ]);

    return {
      items: rows.map((row) => this.toWire(row)),
      pagination: buildMeta(page, limit, total),
    };
  }

  async getRequest(userId, id) {
    const parsed = parseSchema(supportRequestParamsSchema, { id });

    // Scoped, not fetched-then-compared: a wrong id must be indistinguishable
    // from a missing one.
    const request = await this.prisma.supportRequest.findFirst({
      where: { id: parsed.id, userId },
    });

    if (!request) {
      throw new AppError("Support request not found", 404);
    }

    return { request: this.toWire(request) };
  }

  async submitFeedback(userId, payload) {
    const parsed = parseSchema(createSupportFeedbackSchema, payload);

    // A new row every time rather than an upsert. This is a time series — a user
    // whose first rating was a 2 and whose second was a 5 is the signal that
    // something changed, and overwriting would make it unanswerable.
    const feedback = await this.prisma.supportFeedback.create({
      data: {
        userId,
        rating: parsed.rating,
        comment: parsed.comment ?? null,
      },
    });

    return { feedback: this.toFeedbackWire(feedback) };
  }

  async getMyFeedback(userId, query = {}) {
    const { limit } = getPagination(query, 5);

    const rows = await this.prisma.supportFeedback.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return { items: rows.map((row) => this.toFeedbackWire(row)) };
  }

  // ====================
  // ADMIN SIDE
  // ====================

  async listAll(query = {}) {
    const parsed = parseSchema(adminSupportQuerySchema, query);
    const { page, limit, skip, take } = getPagination(parsed, DEFAULT_LIMIT);
    const where = {};

    if (parsed.q) {
      // No `mode: "insensitive"`: that option is PostgreSQL/SQLite only and this
      // schema is MySQL, whose default collation is already case-insensitive.
      // Word-by-word because the ticket number, the user's name, the slug path
      // and the description are four different columns, so requiring the whole
      // term against any single one could never match.
      where.AND = termTokens(parsed.q).map((token) => {
        const escaped = escapeLike(token);

        const clauses = [
          { category: { contains: escaped } },
          { issue: { contains: escaped } },
          { problem: { contains: escaped } },
          { description: { contains: escaped } },
          { user: { firstName: { contains: escaped } } },
          { user: { lastName: { contains: escaped } } },
          { user: { email: { contains: escaped } } },
        ];

        // "TK-1042" and a bare "1042" both have to find the ticket. Prisma
        // would reject a non-numeric string against an Int column, so the
        // comparison is only offered when the token really does name one.
        const ticketNumber = ticketNumberFromToken(token);
        if (ticketNumber !== null) {
          clauses.push({ ticketNumber });
        }

        return { OR: clauses };
      });
    }

    if (parsed.status && parsed.status !== "ALL") {
      where.status = parsed.status;
    }

    if (parsed.category && parsed.category !== "ALL") {
      where.category = parsed.category;
    }

    // Object-literal lookup keyed on a validated enum, with a default, so a
    // caller can never hand a raw string to orderBy and name any column.
    const orderBy = {
      createdAt_desc: { createdAt: "desc" },
      createdAt_asc: { createdAt: "asc" },
      ticketNumber_desc: { ticketNumber: "desc" },
      ticketNumber_asc: { ticketNumber: "asc" },
      status_asc: [{ status: "asc" }, { createdAt: "asc" }],
    }[parsed.sort || "createdAt_desc"];

    const [rows, total] = await Promise.all([
      this.prisma.supportRequest.findMany({
        where,
        orderBy,
        skip,
        take,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              avatarUrl: true,
              status: true,
              createdAt: true,
            },
          },
        },
      }),
      this.prisma.supportRequest.count({ where }),
    ]);

    return {
      items: rows.map((row) => this.toAdminWire(row)),
      pagination: buildMeta(page, limit, total),
    };
  }

  async getOne(id) {
    const parsed = parseSchema(supportRequestParamsSchema, { id });

    const request = await this.prisma.supportRequest.findUnique({
      where: { id: parsed.id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            status: true,
            createdAt: true,
            // There is no lastActiveAt column; the most recent token use is the
            // same signal adminService reads for the users table, so the two
            // consoles cannot disagree about whether an account is dormant.
            refreshTokens: {
              select: { lastUsedAt: true },
              orderBy: { lastUsedAt: "desc" },
              take: 1,
            },
          },
        },
      },
    });

    if (!request) {
      throw new AppError("Support request not found", 404);
    }

    return { request: this.toAdminWire(request) };
  }

  async updateOne(id, payload) {
    const parsedParams = parseSchema(supportRequestParamsSchema, { id });
    const parsed = parseSchema(adminSupportUpdateSchema, payload);

    const existing = await this.prisma.supportRequest.findUnique({
      where: { id: parsedParams.id },
      select: { id: true, userId: true, status: true, firstRespondedAt: true },
    });

    if (!existing) {
      throw new AppError("Support request not found", 404);
    }

    const changes = {};

    if (parsed.status !== undefined) {
      changes.status = parsed.status;
    }

    if (parsed.resolutionNote !== undefined) {
      changes.resolutionNote = parsed.resolutionNote;
    }

    // Stamped once, on the first transition into a handled state, and only if an
    // admin has not already stamped it. Without the null check a second status
    // change would overwrite the original handling time with a later one.
    if (
      parsed.status &&
      HANDLED_STATUSES.includes(parsed.status) &&
      !existing.firstRespondedAt
    ) {
      changes.firstRespondedAt = new Date();
    }

    const updated = await this.prisma.supportRequest.update({
      where: { id: existing.id },
      data: changes,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    // Only when the status actually moved. Saving a resolution note on a ticket
    // that was already RESOLVED is not news to the person waiting on it.
    if (parsed.status && parsed.status !== existing.status) {
      await this.notifyUserStatusChanged(updated, existing.status);
    }

    return { request: this.toAdminWire(updated) };
  }

  /**
   * Aggregate view of how users are rating the help centre.
   *
   * Three independent reads in one round trip rather than a groupBy plus a
   * separate count, matching the fan-out adminService uses for its own
   * dashboard figures.
   *
   * The average is computed here rather than in SQL on purpose: `rating` is a
   * plain Int column with no aggregate index, so a MySQL AVG over the whole table
   * is a full scan either way, and doing it in the service keeps the exact
   * rounding rule in one place instead of splitting it between a query and a
   * formatter.
   */
  async getFeedbackSummary() {
    const [rows, total, open, inProgress, resolved, closed] = await Promise.all([
      this.prisma.supportFeedback.findMany({ select: { rating: true } }),
      this.prisma.supportRequest.count(),
      this.prisma.supportRequest.count({ where: { status: "OPEN" } }),
      this.prisma.supportRequest.count({ where: { status: "IN_PROGRESS" } }),
      this.prisma.supportRequest.count({ where: { status: "RESOLVED" } }),
      this.prisma.supportRequest.count({ where: { status: "CLOSED" } }),
    ]);

    const ratingCount = rows.length;
    const average = ratingCount
      ? rows.reduce((sum, row) => sum + row.rating, 0) / ratingCount
      : 0;

    // Counts per star, so the admin page can render a real distribution instead
    // of an average alone. Built from the same rows rather than a second query
    // for the same data.
    const distribution = [1, 2, 3, 4, 5].map((star) => ({
      rating: star,
      count: rows.filter((row) => row.rating === star).length,
    }));

    return {
      requests: {
        total,
        open,
        inProgress,
        resolved,
        closed,
      },
      rating: {
        // Rounded to one decimal: a support average shown to six figures implies
        // a precision five-star sampling cannot produce.
        average: Math.round(average * 10) / 10,
        count: ratingCount,
        distribution,
      },
    };
  }

  async listFeedback(query = {}) {
    const parsed = parseSchema(supportRequestsQuerySchema, query);
    const { page, limit, skip, take } = getPagination(parsed, DEFAULT_LIMIT);

    const where = {};

    const [rows, total] = await Promise.all([
      this.prisma.supportFeedback.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              avatarUrl: true,
            },
          },
        },
      }),
      this.prisma.supportFeedback.count({ where }),
    ]);

    return {
      items: rows.map((row) => ({
        ...this.toFeedbackWire(row),
        user: row.user
          ? {
              id: row.user.id,
              name: fullName(row.user),
              email: row.user.email,
              avatarUrl: row.user.avatarUrl,
            }
          : null,
      })),
      pagination: buildMeta(page, limit, total),
    };
  }

  // ====================
  // ADMIN NOTIFICATIONS
  // ====================

  /**
   * Tells every active admin that an account was created.
   *
   * Called from authService.register. Deliberately resolves its own recipients
   * rather than taking them: there is no admin socket room in this app, so the
   * only way an admin's bell lights up is a per-user Notification row, and the
   * same loop covers the database row and the realtime push because
   * notificationService.create does both.
   *
   * Swallows its own failures. Registration has already committed the account
   * by this point, and turning a successful sign-up into a 500 because an
   * admin-facing notification could not be written would be a far worse outcome
   * than a missed bell.
   */
  async notifyAdminsNewUser(user) {
    if (!this.notificationService) return;

    try {
      const name = fullName(user);

      await this.forEachActiveAdmin(
        (adminId) =>
          this.notificationService.create(adminId, {
            title: "New user registered",
            message: `${name || user.email} just created an account.`,
            type: "NEW_USER",
          })
      );
    } catch (error) {
      console.error(
        `[SupportService] could not notify admins of new user: ${error.message}`
      );
    }
  }

  async notifyAdminsNewRequest(request, userId) {
    if (!this.notificationService) return;

    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true, email: true },
      });

      const who = user ? fullName(user) || user.email : "A user";

      await this.forEachActiveAdmin(
        (adminId) =>
          this.notificationService.create(adminId, {
            title: `New support request TK-${request.ticketNumber}`,
            message: `${who} opened a ${request.category
              .split("_")
              .join(" ")
              .toLowerCase()} request.`,
            type: "NEW_SUPPORT_REQUEST",
          })
      );
    } catch (error) {
      console.error(
        `[SupportService] could not notify admins of new request: ${error.message}`
      );
    }
  }

  // Notifies one user that their ticket moved. Also swallows failures: the
  // status change is already committed, and the user can always read their own
  // ticket to see where it got to.
  async notifyUserStatusChanged(request, previousStatus) {
    if (!this.notificationService) return;

    try {
      await this.notificationService.create(request.userId, {
        title: `Request TK-${request.ticketNumber} is now ${this.statusLabel(
          request.status
        )}`,
        message:
          request.status === "RESOLVED" || request.status === "CLOSED"
            ? request.resolutionNote || "Our team has finished with this request."
            : `Moved from ${this.statusLabel(
                previousStatus
              )} to ${this.statusLabel(request.status)}.`,
        type: "SUPPORT_STATUS_CHANGED",
      });
    } catch (error) {
      console.error(
        `[SupportService] could not notify user of status change: ${error.message}`
      );
    }
  }

  // Suspended admins are excluded: they cannot open the console, so a ticket
  // waiting for them is worse than one waiting for an admin who can act. The
  // lookup happens per notification rather than being cached because the admin
  // set is small and can change between calls.
  async forEachActiveAdmin(fn) {
    const admins = await this.prisma.user.findMany({
      where: { role: "ADMIN", status: "ACTIVE" },
      select: { id: true },
    });

    for (const admin of admins) {
      await fn(admin.id);
    }
  }

  // ====================
  // WIRE SHAPES
  // ====================

  // The caller's own view. Deliberately narrower than the admin one: it omits
  // the account snapshot, which is admin context and nothing to do with the
  // person who filed the ticket.
  toWire(row) {
    return {
      id: row.id,
      ticketNumber: row.ticketNumber,
      reference: `TK-${row.ticketNumber}`,
      category: row.category,
      issue: row.issue,
      problem: row.problem,
      description: row.description,
      status: row.status,
      statusLabel: this.statusLabel(row.status),
      resolutionNote: row.resolutionNote,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      firstRespondedAt: row.firstRespondedAt,
    };
  }

  // The admin view. Carries the filing account inline from the include rather
  // than a duplicated userId the caller would have to resolve.
  toAdminWire(row) {
    const wire = this.toWire(row);
    const user = row.user;

    return {
      ...wire,
      user: user
        ? {
            id: user.id,
            name: fullName(user),
            email: user.email,
            avatarUrl: user.avatarUrl,
            status: user.status,
            joinedAt: user.createdAt,
            // Only present on the single-request shape, where the refresh-token
            // lookup was included. The list shape has no such select, so this
            // falls back to null rather than being undefined on the wire.
            lastActiveAt: user.refreshTokens?.[0]?.lastUsedAt ?? null,
          }
        : null,
    };
  }

  toFeedbackWire(row) {
    return {
      id: row.id,
      rating: row.rating,
      comment: row.comment,
      createdAt: row.createdAt,
    };
  }

  // Guards against a status reaching the UI as an untranslated enum member. The
  // validator already restricts this set; the fallback exists so an unexpected
  // value degrades to something readable rather than to undefined.
  statusLabel(status) {
    const labels = {
      OPEN: "Open",
      IN_PROGRESS: "In progress",
      RESOLVED: "Resolved",
      CLOSED: "Closed",
    };

    return labels[status] || status;
  }
}

module.exports = { SupportService, SUPPORT_STATUSES };