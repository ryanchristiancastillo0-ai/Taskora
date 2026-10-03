const { Prisma } = require("@prisma/client");
const { parseSchema } = require("../../utils/validate.js");
const { getPagination, buildMeta } = require("../../utils/pagination.js");
const AppError = require("../../utils/AppError.js");
const {
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
} = require("../../validators/admin/adminValidators.js");

const DAY_MS = 24 * 60 * 60 * 1000;

// User has no lastSeen column, so "is this person still around" has to be
// inferred. RefreshToken.lastUsedAt is the honest signal available: it is
// stamped every time an access token is refreshed, so it tracks real usage
// rather than a login that may never have been followed by anything.
//
// This is the ACTIVITY status, and it is read-only. The account status an admin
// can change lives in User.status and is never derived.
const ACTIVE_WINDOW_DAYS = 30;

// How many buckets the charts default to. Matches the 12-month window the
// admin dashboard opens on.
const DEFAULT_MONTHS = 12;
const DEFAULT_LIMIT = 20;
// The header search is a preview that points at a table, so each group gets a
// handful of rows rather than a page. Kept in step with SEARCH_LIMIT in the
// admin mock; the validator refuses anything above SEARCH_MAX_LIMIT.
const SEARCH_LIMIT = 5;
const ACTIVITY_LIMIT = 9;

const ACTIVE = "ACTIVE";
const INVITED = "INVITED";
const INACTIVE = "INACTIVE";

function daysAgo(days) {
  return new Date(Date.now() - days * DAY_MS);
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date, count) {
  return new Date(date.getFullYear(), date.getMonth() + count, 1);
}

function monthKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${month}`;
}

function startOfWeek(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  // getDay() is 0 for Sunday; the dashboard week starts on Monday.
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

function fullName(user) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
}

/**
 * Classifies an account from its most recent refresh token. Returned alongside
 * the row rather than filtered in the query wherever the shape allows it, so
 * the table, the detail view and the counts can never disagree about a status.
 */
function deriveStatus(lastUsedAt) {
  if (!lastUsedAt) {
    return INVITED;
  }
  return Date.now() - lastUsedAt.getTime() <= ACTIVE_WINDOW_DAYS * DAY_MS
    ? ACTIVE
    : INACTIVE;
}

/**
 * Buckets a list of dates into one entry per month across a window.
 *
 * Shared by growth(), reports() and aiUsage() because all three chart the same
 * shape and three copies of this loop is how the axes end up disagreeing.
 * Deliberately JS-side: every caller caps its window (18 months for the
 * dashboard, 24 for reports), so the row count stays small and the module keeps
 * its promise of no raw SQL. Widening a window past that means moving the bucket
 * into the query as a DATE_FORMAT group by.
 */
function bucketByMonth(dates, months) {
  const first = addMonths(startOfMonth(new Date()), -(months - 1));
  const buckets = Array.from({ length: months }, (_, index) => ({
    date: addMonths(first, index),
    count: 0,
  }));
  const byKey = new Map(buckets.map((bucket) => [monthKey(bucket.date), bucket]));

  for (const date of dates) {
    if (!date) continue;
    const bucket = byKey.get(monthKey(date));
    if (bucket) bucket.count += 1;
  }

  return buckets;
}

// The year is only shown when the month is not in the current one, so a
// 12-month window that crosses New Year stays readable.
function monthLabels(buckets) {
  const currentYear = new Date().getFullYear();
  const shortMonth = new Intl.DateTimeFormat("en-US", { month: "short" });
  const shortMonthYear = new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "2-digit",
  });

  return buckets.map((bucket) =>
    bucket.date.getFullYear() === currentYear
      ? shortMonth.format(bucket.date)
      : shortMonthYear.format(bucket.date)
  );
}

// MySQL LIKE treats % and _ as wildcards, and a task literally titled "50% off"
// has to be searchable as that string rather than matching everything. Prisma
// escapes these itself inside its own queries, so the raw path has to as well or
// the two branches stop agreeing on what a search term means.
function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, (char) => `\\${char}`);
}

// Splits a search box term into the words every one of which has to match
// somewhere on the row. Empty input yields nothing, so callers keep their
// `if (parsed.q)` guard as the single "is this a search" decision.
function termTokens(q) {
  return String(q)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Renders the task list's Prisma `where` object as a SQL fragment.
 *
 * Scoped on purpose: it understands exactly the filters listTasks can produce
 * (title/owner-name search, status, priority, dueDate before now, userId) and
 * throws rather than silently dropping anything it does not recognise. A generic
 * where-to-SQL converter that quietly ignored an unknown key would be a filter
 * that appears to work and returns the wrong rows.
 */
function buildRawWhere(where) {
  const clauses = [];

  // The search, as a list of word-groups ANDed together: every word of the
  // term has to match the title or the owner's first or last name. Rendered as
  // one parenthesised group per word, joined by AND — without the parentheses
  // the OR inside a group would bind to the first following clause only, so
  // `q=dana` plus a status filter would return every task titled "dana"
  // regardless of status.
  if (Array.isArray(where.AND)) {
    const groups = where.AND.map((group) => {
      if (!Array.isArray(group.OR)) {
        throw new AppError("Unsupported task search clause", 500);
      }

      const alternatives = group.OR.map((clause) => {
        if (clause.title && clause.title.contains) {
          return Prisma.sql`t.\`title\` LIKE ${`%${escapeLike(clause.title.contains)}%`}`;
        }

        const firstName = clause.user?.is?.firstName;
        if (firstName && firstName.contains) {
          return Prisma.sql`u.\`firstName\` LIKE ${`%${escapeLike(firstName.contains)}%`}`;
        }

        const lastName = clause.user?.is?.lastName;
        if (lastName && lastName.contains) {
          return Prisma.sql`u.\`lastName\` LIKE ${`%${escapeLike(lastName.contains)}%`}`;
        }

        throw new AppError("Unsupported task search clause", 500);
      });

      return Prisma.sql`(${Prisma.join(alternatives, " OR ")})`;
    });

    clauses.push(Prisma.sql`(${Prisma.join(groups, " AND ")})`);
  }

  if (where.status) {
    // listTasks only ever sets status to a scalar or to an `in` list, from the
    // status filter and the overdue filter respectively.
    if (typeof where.status === "string") {
      clauses.push(Prisma.sql`t.\`status\` = ${where.status}`);
    } else if (Array.isArray(where.status.in)) {
      clauses.push(
        Prisma.sql`t.\`status\` IN (${Prisma.join(where.status.in.map((value) => Prisma.sql`${value}`))})`
      );
    } else {
      throw new AppError("Unsupported task status filter", 500);
    }
  }

  if (where.priority) {
    clauses.push(Prisma.sql`t.\`priority\` = ${where.priority}`);
  }

  if (where.dueDate && where.dueDate.lt) {
    clauses.push(Prisma.sql`t.\`dueDate\` < ${where.dueDate.lt}`);
  }

  if (where.userId) {
    clauses.push(Prisma.sql`t.\`userId\` = ${where.userId}`);
  }

  if (clauses.length === 0) {
    return Prisma.sql``;
  }

  return Prisma.sql`WHERE ${Prisma.join(clauses, " AND ")}`;
}

class AdminService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  /**
   * Headline counters. Every number is a separate count() fanned out in one
   * Promise.all, which is the pattern the rest of the codebase uses for
   * aggregate reads — no groupBy, no raw SQL.
   */
  async overview(query = {}) {
    parseSchema(adminRangeQuerySchema, query);
    const windowDays = Number(query.days) || 30;
    const activeSince = daysAgo(ACTIVE_WINDOW_DAYS);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [
      totalUsers,
      newInWindow,
      suspendedUsers,
      totalTasks,
      completedTasks,
      pendingTasks,
      overdueTasks,
      totalProjects,
      aiReplies,
      aiRepliesToday,
      activeTokens,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { createdAt: { gte: daysAgo(windowDays) } } }),
      this.prisma.user.count({ where: { status: "SUSPENDED" } }),
      this.prisma.task.count(),
      this.prisma.task.count({ where: { status: "COMPLETED" } }),
      this.prisma.task.count({ where: { status: { in: ["TODO", "IN_PROGRESS"] } } }),
      this.prisma.task.count({
        where: {
          status: { in: ["TODO", "IN_PROGRESS"] },
          dueDate: { lt: new Date() },
        },
      }),
      this.prisma.project.count(),
      // One assistant reply is one completed AI request. AIMessage has no
      // latency, token or status column, so nothing here is estimated.
      this.prisma.aIMessage.count({ where: { role: "ASSISTANT" } }),
      this.prisma.aIMessage.count({
        where: { role: "ASSISTANT", createdAt: { gte: startOfToday } },
      }),
      // Counted per user, not per token: a refresh token is per device, so a
      // phone and a laptop would otherwise report one person as two.
      this.prisma.refreshToken.findMany({
        where: { revokedAt: null, lastUsedAt: { gte: activeSince } },
        distinct: ["userId"],
        select: { userId: true },
      }),
    ]);

    return {
      totalUsers,
      activeUsers: activeTokens.length,
      newThisMonth: newInWindow,
      suspendedUsers,
      totalTasks,
      completedTasks,
      pendingTasks,
      overdueTasks,
      totalProjects,
      aiRequests: aiReplies,
      aiRequestsToday: aiRepliesToday,
      completionRate:
        totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
    };
  }

  /**
   * Paginated, searchable, sortable user list.
   *
   * Filters on the stored account status and role. The activity state is still
   * returned per row (derived from refresh tokens) but is deliberately not
   * filterable, because expressing "gone quiet" as a `where` clause means a NOT
   * on the same relation and the active/inactive sets would overlap.
   */
  async listUsers(query = {}) {
    const parsed = parseSchema(adminUsersQuerySchema, query);
    const { page, limit, skip, take } = getPagination(parsed, DEFAULT_LIMIT);
    const where = {};

    if (parsed.q) {
      // No `mode: "insensitive"` here: that option is PostgreSQL/SQLite only,
      // and this schema is MySQL, where the default collation is already
      // case-insensitive. Passing the option would be rejected by the client.
      //
      // Word-by-word for the same reason as the other lists: the row's "Name"
      // column is firstName and lastName joined, so requiring the whole term
      // against a single field could never match the name on screen.
      where.AND = termTokens(parsed.q).map((token) => ({
        OR: [
          { firstName: { contains: token } },
          { lastName: { contains: token } },
          { email: { contains: token } },
        ],
      }));
    }

    if (parsed.status && parsed.status !== "ALL") {
      where.status = parsed.status;
    }

    if (parsed.role && parsed.role !== "ALL") {
      where.role = parsed.role;
    }

    const orderBy = {
      joinedAt_desc: { createdAt: "desc" },
      joinedAt_asc: { createdAt: "asc" },
      name_asc: [{ firstName: "asc" }, {lastName: "asc" }],
      name_desc: [{ firstName: "desc" }, { lastName: "desc" }],
      tasks_desc: { tasks: { _count: "desc" } },
    }[parsed.sort || "joinedAt_desc"];

    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy,
        skip,
        take,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
          role: true,
          status: true,
          createdAt: true,
          refreshTokens: {
            select: { lastUsedAt: true },
            orderBy: { lastUsedAt: "desc" },
            take: 1,
          },
          _count: { select: { tasks: true, projects: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    const items = rows.map((row) => {
      const lastActiveAt = row.refreshTokens[0]?.lastUsedAt ?? null;

      return {
        id: row.id,
        name: fullName(row),
        email: row.email,
        avatarUrl: row.avatarUrl,
        role: row.role,
        status: row.status,
        activity: deriveStatus(lastActiveAt),
        tasks: row._count.tasks,
        projects: row._count.projects,
        joinedAt: row.createdAt,
        lastActiveAt,
      };
    });

    return { items, pagination: buildMeta(page, limit, total) };
  }

  /** One account in full, for the users detail view. */
  async getUser(params) {
    const { id } = parseSchema(adminUserParamsSchema, params);

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        bio: true,
        role: true,
        status: true,
        createdAt: true,
        personalizationProfile: {
          select: { aiProvider: true, onboardingCompleted: true },
        },
        _count: {
          select: { tasks: true, projects: true, notes: true, goals: true, habits: true },
        },
      },
    });

    if (!user) {
      throw new AppError("User not found", 404);
    }

    const lastUsedAt = await this.prisma.refreshToken.findFirst({
      where: { userId: id },
      orderBy: { lastUsedAt: "desc" },
      select: { lastUsedAt: true },
    });

    return {
      ...user,
      name: fullName(user),
      activity: deriveStatus(lastUsedAt?.lastUsedAt),
      lastActiveAt: lastUsedAt?.lastUsedAt ?? null,
    };
  }

  /**
   * Role and status changes only.
   *
   * Two rules are enforced here rather than in the controller because they are
   * about data integrity, not about HTTP:
   *
   *  1. An admin cannot remove their own admin role. Without this, one click
   *     locks the last administrator out of the console permanently.
   *  2. Suspending revokes every refresh token in the same transaction. A
   *     "suspended" account that can still mint a new access token is not
   *     suspended, and access tokens outlive the request that created them.
   */
  async updateUser(actorId, params, body) {
    const { id } = parseSchema(adminUserParamsSchema, params);
    const changes = parseSchema(adminUserUpdateSchema, body);

    const target = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, status: true },
    });

    if (!target) {
      throw new AppError("User not found", 404);
    }

    if (id === actorId && changes.role === "USER") {
      throw new AppError(
        "You cannot remove your own admin access. Ask another administrator to do it.",
        400
      );
    }

    if (id === actorId && changes.status === "SUSPENDED") {
      throw new AppError("You cannot suspend your own account", 400);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (changes.status === "SUSPENDED") {
        await tx.refreshToken.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      return tx.user.update({
        where: { id },
        data: changes,
        select: { id: true, email: true, firstName: true, lastName: true, role: true, status: true },
      });
    });

    return { ...updated, name: fullName(updated) };
  }

  /**
   * Signups and task volume per month, for the growth chart.
   */
  async growth(query = {}) {
    const parsed = parseSchema(adminGrowthQuerySchema, query);
    const months = parsed.months || DEFAULT_MONTHS;

    const [users, tasks] = await Promise.all([
      this.prisma.user.findMany({
        where: { createdAt: { gte: addMonths(startOfMonth(new Date()), -(months - 1)) } },
        select: { createdAt: true },
      }),
      this.prisma.task.findMany({
        where: { createdAt: { gte: addMonths(startOfMonth(new Date()), -(months - 1)) } },
        select: { createdAt: true },
      }),
    ]);

    const userBuckets = bucketByMonth(users.map((row) => row.createdAt), months);
    const taskBuckets = bucketByMonth(tasks.map((row) => row.createdAt), months);

    return {
      labels: monthLabels(userBuckets),
      keys: userBuckets.map((bucket) => monthKey(bucket.date)),
      series: [
        { key: "signups", label: "New signups", data: userBuckets.map((b) => b.count) },
        { key: "tasks", label: "Tasks created", data: taskBuckets.map((b) => b.count) },
      ],
    };
  }

  /** Task counts per status, for the donut. */
  async taskMix() {
    const now = new Date();
    const openWhere = { status: { in: ["TODO", "IN_PROGRESS"] } };

    const [completed, inProgress, todo, cancelled, overdue] = await Promise.all([
      this.prisma.task.count({ where: { status: "COMPLETED" } }),
      this.prisma.task.count({ where: { status: "IN_PROGRESS" } }),
      this.prisma.task.count({ where: { status: "TODO" } }),
      this.prisma.task.count({ where: { status: "CANCELLED" } }),
      this.prisma.task.count({ where: { ...openWhere, dueDate: { lt: now } } }),
    ]);

    return [
      { label: "Completed", value: completed },
      { label: "In progress", value: inProgress },
      { label: "To do", value: todo },
      { label: "Overdue", value: overdue },
      { label: "Cancelled", value: cancelled },
    ];
  }

  /** Tasks created and completed per weekday, for the weekly bar chart. */
  async weekly(query = {}) {
    parseSchema(adminRangeQuerySchema, query);
    const first = startOfWeek(new Date());
    const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

    const [created, completed] = await Promise.all([
      this.prisma.task.findMany({
        where: { createdAt: { gte: first } },
        select: { createdAt: true },
      }),
      this.prisma.task.findMany({
        where: { completedAt: { gte: first } },
        select: { completedAt: true },
      }),
    ]);

    // getDay() is 0 for Sunday, so shift it to match the Monday-first buckets.
    const indexFor = (date) => (date.getDay() + 6) % 7;
    const createdPerDay = new Array(7).fill(0);
    const completedPerDay = new Array(7).fill(0);

    for (const task of created) createdPerDay[indexFor(task.createdAt)] += 1;
    for (const task of completed) completedPerDay[indexFor(task.completedAt)] += 1;

    return {
      labels: weekdays,
      series: [
        { key: "created", label: "Tasks created", data: createdPerDay },
        { key: "completed", label: "Tasks completed", data: completedPerDay },
      ],
    };
  }

  /**
   * The admin header's single search box: one term, three result sets.
   *
   * Composed from the three list methods above rather than written as a fourth
   * query. That is the whole point of it. Each of those already knows what a
   * term means for its own table, already validates it, already escapes it for
   * the raw branch, and already pages and counts. A hand-written search would be
   * a fourth definition of "what counts as a match" that nothing else tests, and
   * the first time a list filter changed, search would quietly disagree with the
   * table it links to. Here they cannot drift: it *is* those queries.
   *
   * The term is passed through untouched, and no status/role/priority/sort is
   * applied, so a result is always a row the destination table would also show
   * for the same term. The three run concurrently because nothing here depends
   * on anything else - this is three independent reads, not a join.
   *
   * The mock composes the same three calls (adminApi.getSearch), which is what
   * keeps the console usable before this endpoint is switched on.
   */
  async search(query = {}) {
    const parsed = parseSchema(adminSearchQuerySchema, query);
    const limit = parsed.limit || SEARCH_LIMIT;

    const [users, tasks, projects] = await Promise.all([
      this.listUsers({ q: parsed.q, page: 1, limit }),
      this.listTasks({ q: parsed.q, page: 1, limit }),
      this.listProjects({ q: parsed.q, page: 1, limit }),
    ]);

    return { q: parsed.q, users, tasks, projects };
  }

  /** System-wide task list, paginated and filterable. */
  async listTasks(query = {}) {
    const parsed = parseSchema(adminTasksQuerySchema, query);
    const { page, limit, skip, take } = getPagination(parsed, DEFAULT_LIMIT);

    const where = {};

    if (parsed.q) {
      // Title OR the owner's name, so the "Search task or owner…" placeholder on
      // the page is true. The header search composes this same method, so
      // searching a person's name finds their tasks there too.
      //
      // Split on whitespace and require EVERY word to match somewhere. The users
      // table shows one column reading "user1 wla", which is firstName and
      // lastName joined — so a single `contains` across either field on its own
      // finds nothing for the very name the UI displays. Matching each word
      // against the group lets the words land on different fields, which is what
      // makes the displayed name searchable.
      where.AND = termTokens(parsed.q).map((token) => ({
        OR: [
          { title: { contains: token } },
          { user: { is: { firstName: { contains: token } } } },
          { user: { is: { lastName: { contains: token } } } },
        ],
      }));
    }

    if (parsed.status && parsed.status !== "ALL") {
      where.status = parsed.status;
    }

    if (parsed.priority && parsed.priority !== "ALL") {
      where.priority = parsed.priority;
    }

    if (parsed.overdue) {
      where.status = { in: ["TODO", "IN_PROGRESS"] };
      where.dueDate = { lt: new Date() };
    }

    if (parsed.userId) {
      where.userId = parsed.userId;
    }

    // Two of the sorts cannot be expressed through Prisma's orderBy on MySQL:
    //
    //   nulls: "last"  - Prisma only supports explicit null placement on
    //                     PostgreSQL and SQLite. On MySQL it throws, so an
    //                     ORDER BY that mentions it is a 500, not a wrong page.
    //   priority       - Task.priority is an enum, and Prisma sorts the raw
    //                     column, so "desc" is alphabetical: URGENT, MEDIUM,
    //                     LOW, HIGH. HIGH has to come second, not last.
    //
    // Both are ordering-only concerns, so they are pushed into a CASE
    // expression over the same filters. The alternative - sorting in JS after
    // fetch - would reorder only the page that came back, which is a quieter and
    // worse bug than the one it fixes.
    const customOrder =
      parsed.sort === "dueDate_asc"
        ? "ORDER BY (`dueDate` IS NULL) ASC, `dueDate` ASC, `id` ASC"
        : parsed.sort === "priority_desc"
          ? "ORDER BY FIELD(`priority`, 'URGENT', 'HIGH', 'MEDIUM', 'LOW'), `createdAt` DESC"
          : null;

    const orderBy = {
      createdAt_desc: { createdAt: "desc" },
      createdAt_asc: { createdAt: "asc" },
    }[parsed.sort || "createdAt_desc"];

    const [rows, total] = await Promise.all([
      customOrder
        ? this.prisma.$queryRaw`
            SELECT t.\`id\`, t.\`title\`, t.\`status\`, t.\`priority\`, t.\`dueDate\`,
                   t.\`completedAt\`, t.\`createdAt\`,
                   u.\`id\` AS \`userId\`, u.\`firstName\`, u.\`lastName\`, u.\`avatarUrl\`,
                   p.\`id\` AS \`projectId\`, p.\`name\` AS \`projectName\`
              FROM \`Task\` t
              JOIN \`User\` u ON u.\`id\` = t.\`userId\`
         LEFT JOIN \`Project\` p ON p.\`id\` = t.\`projectId\`
             ${buildRawWhere(where)}
             ${Prisma.raw(customOrder)}
             LIMIT ${take} OFFSET ${skip}`
        : this.prisma.task.findMany({
            where,
            orderBy,
            skip,
            take,
            select: {
              id: true,
              title: true,
              status: true,
              priority: true,
              dueDate: true,
              completedAt: true,
              createdAt: true,
              user: {
                select: { id: true, firstName: true, lastName: true, avatarUrl: true },
              },
              project: { select: { id: true, name: true } },
            },
          }),
      this.prisma.task.count({ where }),
    ]);

    // The raw branch joins the owner and the project in, so it has to be folded
    // into the same shape the Prisma branch produces. The console and the mock
    // only ever see one task shape regardless of which path served it.
    const items = customOrder
      ? rows.map((row) => ({
          id: row.id,
          title: row.title,
          status: row.status,
          priority: row.priority,
          dueDate: row.dueDate,
          completedAt: row.completedAt,
          createdAt: row.createdAt,
          owner: {
            id: row.userId,
            name: fullName({ firstName: row.firstName, lastName: row.lastName }),
            avatarUrl: row.avatarUrl,
          },
          project: row.projectId ? { id: row.projectId, name: row.projectName } : null,
        }))
      : rows.map((row) => ({
          id: row.id,
          title: row.title,
          status: row.status,
          priority: row.priority,
          dueDate: row.dueDate,
          completedAt: row.completedAt,
          createdAt: row.createdAt,
          owner: { id: row.user.id, name: fullName(row.user), avatarUrl: row.user.avatarUrl },
          project: row.project ? { id: row.project.id, name: row.project.name } : null,
        }));

    return {
      items,
      pagination: buildMeta(page, limit, total),
    };
  }

  /** System-wide project list with a task count per row. */
  async listProjects(query = {}) {
    const parsed = parseSchema(adminProjectsQuerySchema, query);
    const { page, limit, skip, take } = getPagination(parsed, DEFAULT_LIMIT);

    const where = {};

    if (parsed.q) {
      // Project name OR the owner's name, matching the placeholder on the page.
      // Word-by-word like listTasks, so "user1 wla" matches the name the table
      // displays rather than needing the two fields searched separately.
      where.AND = termTokens(parsed.q).map((token) => ({
        OR: [
          { name: { contains: token } },
          { user: { is: { firstName: { contains: token } } } },
          { user: { is: { lastName: { contains: token } } } },
        ],
      }));
    }

    if (parsed.status && parsed.status !== "ALL") {
      where.status = parsed.status;
    }

    if (parsed.userId) {
      where.userId = parsed.userId;
    }

    const orderBy = {
      updatedAt_desc: { updatedAt: "desc" },
      createdAt_desc: { createdAt: "desc" },
      name_asc: { name: "asc" },
      tasks_desc: { tasks: { _count: "desc" } },
    }[parsed.sort || "updatedAt_desc"];

    const [rows, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        orderBy,
        skip,
        take,
        select: {
          id: true,
          name: true,
          color: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          user: {
            select: { id: true, firstName: true, lastName: true, avatarUrl: true },
          },
          _count: { select: { tasks: true } },
        },
      }),
      this.prisma.project.count({ where }),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        color: row.color,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        owner: { id: row.user.id, name: fullName(row.user), avatarUrl: row.user.avatarUrl },
        tasks: row._count.tasks,
      })),
      pagination: buildMeta(page, limit, total),
    };
  }

  /**
   * AI usage.
   *
   * Everything here is counted off AIMessage rows with role = "ASSISTANT": one
   * assistant message is one completed request. There is no success/failure
   * split, no latency and no token count to report, because AIMessage stores
   * none of those — a failed generation is never persisted at all, so any
   * "failed requests" figure would be a permanent zero and would read as "all
   * requests succeed". The fields that can be answered honestly are returned
   * instead: volume over time, per-user usage and the provider each user is
   * configured for.
   *
   * AIMessage.role is a plain String column, not the AIMessageRole enum, so it
   * is compared as a literal.
   */
  async aiUsage(query = {}) {
    const parsed = parseSchema(adminAiUsageQuerySchema, query);
    const { page, limit, skip, take } = getPagination(parsed, DEFAULT_LIMIT);
    const days = parsed.days || 30;
    const since = daysAgo(days);

    // The provider filter narrows the TABLE only. The summary cards describe the
    // whole window, so that "total requests" does not silently change meaning
    // when someone filters the list underneath it. Two counts, therefore: one
    // over the whole window for the cards, one over the filtered set for the
    // pager. Reusing the filtered count for both is what made the "Requests in
    // window" card shrink while "This month" and the provider donut did not.
    const windowWhere = { role: "ASSISTANT", createdAt: { gte: since } };
    const listWhere = { ...windowWhere };

    if (parsed.provider && parsed.provider !== "ALL") {
      listWhere.conversation = {
        user: { personalizationProfile: { is: { aiProvider: parsed.provider } } },
      };
    }

    if (parsed.userId) {
      listWhere.conversation = {
        ...(listWhere.conversation || {}),
        userId: parsed.userId,
      };
    }

    const [windowReplies, listTotal, rows] = await Promise.all([
      this.prisma.aIMessage.count({ where: windowWhere }),
      this.prisma.aIMessage.count({ where: listWhere }),
      this.prisma.aIMessage.findMany({
        where: listWhere,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        select: {
          // Deliberately NOT selected: id, and the conversation's id and title.
          //
          // A conversation title is not a label a user chose — AIConversation
          // auto-sets it from the user's own first message
          // (aiService: `title: firstUserText.slice(0, 60)`). Selecting it here
          // shipped that text verbatim into an admin endpoint, which is why this
          // table showed rows labelled "hi". Leaving the column out of the
          // SELECT is the point at which the content stops being readable, so
          // there is nothing to redact downstream and nothing to leak if a new
          // field is added to this object later.
          //
          // The ids are dropped for the same reason: a message id and a
          // conversation id are handles into someone's private chat, and a
          // volume table has no use for either.
          createdAt: true,
          conversation: {
            select: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  personalizationProfile: { select: { aiProvider: true } },
                },
              },
            },
          },
        },
      }),
    ]);

    // The provider lives on the user's personalization profile, not the message,
    // so one extra query maps the page of users rather than one per message.
    const userIds = [...new Set(rows.map((row) => row.conversation.user.id))];
    const profiles = userIds.length
      ? await this.prisma.personalizationProfile.findMany({
          where: { userId: { in: userIds } },
          select: { userId: true, aiProvider: true },
        })
      : [];
    const providerByUser = new Map(profiles.map((profile) => [profile.userId, profile.aiProvider]));

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const [repliesToday, repliesThisMonth, conversations, distinctUsers, geminiRows, openrouterRows, noProfileRows] =
      await Promise.all([
        this.prisma.aIMessage.count({ where: { role: "ASSISTANT", createdAt: { gte: today } } }),
        this.prisma.aIMessage.count({ where: { role: "ASSISTANT", createdAt: { gte: startOfMonth } } }),
        this.prisma.aIConversation.count({
          where: { messages: { some: { role: "ASSISTANT", createdAt: { gte: since } } } },
        }),
        this.prisma.aIMessage.findMany({
          where: { role: "ASSISTANT", createdAt: { gte: since } },
          distinct: ["conversationId"],
          select: { conversation: { select: { userId: true } } },
        }),
        // The provider lives on the user's personalization profile, so the split
        // has to be counted through the relation rather than grouped on a column
        // AIMessage does not have. Three counts instead of one groupBy.
        this.prisma.aIMessage.count({
          where: {
            role: "ASSISTANT",
            createdAt: { gte: since },
            conversation: {
              user: { personalizationProfile: { is: { aiProvider: "GEMINI" } } },
            },
          },
        }),
        this.prisma.aIMessage.count({
          where: {
            role: "ASSISTANT",
            createdAt: { gte: since },
            conversation: {
              user: { personalizationProfile: { is: { aiProvider: "OPENROUTER" } } },
            },
          },
        }),
        // An account that has never opened onboarding has no profile at all.
        // PersonalizationProfile.aiProvider defaults to GEMINI, so these are
        // counted as Gemini rather than left in a bucket that does not add up.
        this.prisma.aIMessage.count({
          where: {
            role: "ASSISTANT",
            createdAt: { gte: since },
            conversation: { user: { personalizationProfile: { is: null } } },
          },
        }),
      ]);

    const items = rows.map((row) => {
      const user = row.conversation.user;
      return {
        at: row.createdAt,
        // No id, no conversationId, no title: see the select above. The row is
        // identified by the pair the table already displays, which is enough to
        // key a list and to correlate nothing.
        user: { id: user.id, name: fullName(user) },
        provider: providerByUser.get(user.id) || "GEMINI",
      };
    });

    return {
      summary: {
        totalReplies: windowReplies,
        repliesToday,
        repliesThisMonth,
        conversations,
        activeUsers: distinctUsers.length,
        byProvider: { GEMINI: geminiRows + noProfileRows, OPENROUTER: openrouterRows },
      },
      items,
      pagination: buildMeta(page, limit, listTotal),
    };
  }

  /**
   * Notification volume for the admin system page.
   *
   * Read-only by design. This page reports on notifications; it does not send
   * them, because sending goes through NotificationService and the email queue,
   * and an admin-triggered broadcast belongs on its own endpoint rather than
   * being a side effect of a GET.
   */
  async notifications(query = {}) {
    const parsed = parseSchema(adminNotificationsQuerySchema, query);
    const { page, limit, skip, take } = getPagination(parsed, DEFAULT_LIMIT);
    const days = parsed.days || 30;
    const since = daysAgo(days);

    const where = { createdAt: { gte: since } };

    if (parsed.type && parsed.type !== "ALL") {
      where.type = parsed.type;
    }

    if (parsed.status === "READ") {
      where.readAt = { not: null };
    } else if (parsed.status === "UNREAD") {
      where.readAt = null;
    }

    if (parsed.q) {
      // Title or body OR the recipient's name, so the page's "Search
      // notification or recipient…" placeholder is true. Word-by-word like the
      // other two lists, so the recipient name the table displays is searchable.
      where.AND = termTokens(parsed.q).map((token) => ({
        OR: [
          { title: { contains: token } },
          { message: { contains: token } },
          { user: { is: { firstName: { contains: token } } } },
          { user: { is: { lastName: { contains: token } } } },
        ],
      }));
    }

    const [rows, total, totalInWindow, unreadInWindow] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        select: {
          id: true,
          title: true,
          message: true,
          type: true,
          readAt: true,
          createdAt: true,
          user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        },
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { createdAt: { gte: since } } }),
      this.prisma.notification.count({ where: { createdAt: { gte: since }, readAt: null } }),
    ]);

    const byTypeRows = await this.prisma.notification.groupBy({
      by: ["type"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    });

    return {
      items: rows.map((row) => ({
        id: row.id,
        title: row.title,
        message: row.message,
        type: row.type,
        read: row.readAt !== null,
        readAt: row.readAt,
        at: row.createdAt,
        recipient: {
          id: row.user.id,
          name: fullName(row.user),
          avatarUrl: row.user.avatarUrl,
        },
      })),
      summary: {
        total: totalInWindow,
        unread: unreadInWindow,
        readRate:
          totalInWindow > 0
            ? Math.round(((totalInWindow - unreadInWindow) / totalInWindow) * 100)
            : 0,
        byType: byTypeRows
          .map((row) => ({ type: row.type, count: row._count._all }))
          .sort((a, b) => b.count - a.count),
      },
      pagination: buildMeta(page, limit, total),
    };
  }

  /**
   * The audit trail, newest first.
   *
   * Read-only, and deliberately the only read surface for AuditLog: nothing on
   * the user side can reach these rows, and no write path exists outside
   * AuditService.record(). The rows themselves are the record, so there is
   * deliberately no delete, no edit and no "clear" — an admin console that can
   * erase its own trail is not an audit log, and the table is append-only for
   * that reason.
   *
   * A row can have no actor. That is not a broken join: it is either a failed
   * sign-in, which matched no account, or an account that has since been
   * deleted, which the `SetNull` relation preserves. The row is returned either
   * way with `actor: null` and the attempted address read out of `details`, so
   * neither case is silently invisible.
   */
  async listAuditLogs(query = {}) {
    const parsed = parseSchema(adminAuditLogsQuerySchema, query);
    const { page, limit, skip, take } = getPagination(parsed, DEFAULT_LIMIT);

    const where = {};

    if (parsed.action) {
      where.action = parsed.action;
    }

    if (parsed.entity) {
      where.entity = parsed.entity;
    }

    if (parsed.userId) {
      where.userId = parsed.userId;
    }

    if (parsed.from || parsed.to) {
      where.createdAt = {};
      if (parsed.from) where.createdAt.gte = parsed.from;
      if (parsed.to) where.createdAt.lte = parsed.to;
    }

    if (parsed.q) {
      // Word by word, and over the actor's name as well as the event's own
      // fields, so "deleted" and a person's name can be combined into the one
      // question an admin actually asks: what did this person delete. The
      // relation is matched with `is` because AuditLog.user is optional.
      where.AND = termTokens(parsed.q).map((token) => ({
        OR: [
          { action: { contains: token } },
          { entity: { contains: token } },
          { entityId: { contains: token } },
          { user: { is: { firstName: { contains: token } } } },
          { user: { is: { lastName: { contains: token } } } },
          { user: { is: { email: { contains: token } } } },
        ],
      }));
    }

    const orderBy = {
      createdAt: parsed.sort === "createdAt_asc" ? "asc" : "desc",
    };

    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy,
        skip,
        take,
        select: {
          id: true,
          action: true,
          entity: true,
          entityId: true,
          details: true,
          oldValue: true,
          newValue: true,
          ipAddress: true,
          userAgent: true,
          createdAt: true,
          user: {
            select: { id: true, email: true, firstName: true, lastName: true, avatarUrl: true },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const items = rows.map((row) => ({
      id: row.id,
      action: row.action,
      entity: row.entity,
      entityId: row.entityId,
      details: row.details,
      oldValue: row.oldValue,
      newValue: row.newValue,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      at: row.createdAt,
      // Null for a failed sign-in and for a deleted account. Full name with the
      // address as the fallback, so an account registered with only a first name
      // is not rendered as a blank cell.
      actor: row.user
        ? {
            id: row.user.id,
            name: fullName(row.user) || row.user.email,
            email: row.user.email,
            avatarUrl: row.user.avatarUrl,
          }
        : null,
    }));

    return { items, pagination: buildMeta(page, limit, total) };
  }

  /**
   * Analytics for the reports page: four series over one monthly window, all
   * from models that already exist. No new tables and no estimated numbers —
   * anything that cannot be derived is simply not reported.
   */
  async reports(query = {}) {
    const parsed = parseSchema(adminReportRangeQuerySchema, query);
    const months = parsed.months || DEFAULT_MONTHS;
    const first = addMonths(startOfMonth(new Date()), -(months - 1));

    const [users, tasksCreated, tasksCompleted, projects, aiReplies] = await Promise.all([
      this.prisma.user.findMany({ where: { createdAt: { gte: first } }, select: { createdAt: true } }),
      this.prisma.task.findMany({ where: { createdAt: { gte: first } }, select: { createdAt: true } }),
      this.prisma.task.findMany({ where: { completedAt: { gte: first } }, select: { completedAt: true } }),
      this.prisma.project.findMany({ where: { createdAt: { gte: first } }, select: { createdAt: true } }),
      this.prisma.aIMessage.findMany({
        where: { role: "ASSISTANT", createdAt: { gte: first } },
        select: { createdAt: true },
      }),
    ]);

    const userBuckets = bucketByMonth(users.map((row) => row.createdAt), months);
    const projectBuckets = bucketByMonth(projects.map((row) => row.createdAt), months);
    const createdBuckets = bucketByMonth(tasksCreated.map((row) => row.createdAt), months);
    const completedBuckets = bucketByMonth(tasksCompleted.map((row) => row.completedAt), months);
    const aiBuckets = bucketByMonth(aiReplies.map((row) => row.createdAt), months);

    // Completion rate per month, dividing two independently bucketed counts:
    // tasks COMPLETED in the month over tasks CREATED in it. The two are
    // different populations - a task made in March and finished in April is
    // April's completion and March's creation - so a month that clears a
    // backlog reads above 100. That is real information about the month, so
    // the value is not clamped here; the reports page explains it.
    const completionRate = createdBuckets.map((bucket, index) => {
      if (bucket.count === 0) return 0;
      return Math.round((completedBuckets[index].count / bucket.count) * 100);
    });

    return {
      labels: monthLabels(userBuckets),
      series: [
        { key: "signups", label: "New signups", data: userBuckets.map((b) => b.count) },
        { key: "tasksCreated", label: "Tasks created", data: createdBuckets.map((b) => b.count) },
        { key: "tasksCompleted", label: "Tasks completed", data: completedBuckets.map((b) => b.count) },
        { key: "projects", label: "Projects created", data: projectBuckets.map((b) => b.count) },
        { key: "aiRequests", label: "AI requests", data: aiBuckets.map((b) => b.count) },
      ],
      rates: [{ key: "completionRate", label: "Completion rate", data: completionRate }],
    };
  }

  /**
   * Recent platform activity, newest first.
   *
   * There is no single events table, so the feed is assembled from the streams
   * an admin actually acts on and merged. Adding a source means adding a branch
   * here, not a new model.
   */
  async activity() {
    const [newUsers, finishedTasks] = await Promise.all([
      this.prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        take: ACTIVITY_LIMIT,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
          createdAt: true,
        },
      }),
      this.prisma.task.findMany({
        where: { completedAt: { not: null } },
        orderBy: { completedAt: "desc" },
        take: ACTIVITY_LIMIT,
        select: {
          id: true,
          completedAt: true,
          user: {
            select: { id: true, firstName: true, lastName: true, avatarUrl: true },
          },
        },
      }),
    ]);

    const events = [
      ...newUsers.map((user) => ({
        id: `signup_${user.id}`,
        kind: "USER_REGISTERED",
        userId: user.id,
        name: fullName(user),
        avatarUrl: user.avatarUrl,
        verb: "joined Taskora",
        tone: "amber",
        at: user.createdAt,
      })),
      ...finishedTasks.map((task) => ({
        id: `task_${task.id}`,
        kind: "TASK_COMPLETED",
        userId: task.user.id,
        name: fullName(task.user),
        avatarUrl: task.user.avatarUrl,
        verb: "completed a task",
        tone: "green",
        at: task.completedAt,
      })),
    ];

    return events.sort((a, b) => b.at - a.at).slice(0, ACTIVITY_LIMIT);
  }
}

// `deriveStatus` is exported alongside the class because the copilot needs it:
// the 30-day refresh-token rule is the single definition of "is this account
// still around", and a second copy of it is how the assistant and the users
// table end up disagreeing about the same person.
module.exports = { AdminService, deriveStatus };

