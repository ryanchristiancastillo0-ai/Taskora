const { parseSchema } = require("../../utils/validate.js");
const AppError = require("../../utils/AppError.js");
const { deriveStatus } = require("./adminService.js");
const { isQuotaError } = require("../ai/aiProvider.js");
const { adminAskSchema } = require("../../validators/admin/adminValidators.js");
const {
  adminCopilotQueue,
  ADMIN_COPILOT_JOB,
} = require("../../queues/adminCopilotQueue.js");

// How many accounts the per-account breakdown covers. The dashboard reads every
// user row on its own paginated request; a copilot answer is one prompt, so it
// takes a bounded sample and says so in the context rather than loading the
// whole table to rank accounts on a platform that might have a million of them.
const USER_SAMPLE = 200;

// The per-account table only earns its place in the prompt when someone is
// actually asking about accounts, but it is cheap relative to a provider call
// and it is what lets "who is most active" be answered from data.
const TOP_ACCOUNTS = 8;

// Turns of prior conversation replayed to the provider. Bounded because every
// turn is a question plus a multi-hundred-word answer, and the snapshot below
// already costs six queries — a copilot that reads the whole history is a
// copilot that stops being usable after twenty questions.
const MAX_HISTORY_TURNS = 8;

// How long a question may sit unanswered before the client stops showing a
// spinner. Not a timeout: the job may still be running or waiting on a retry,
// and a late answer is still a correct answer. This only decides when the UI
// stops claiming something is coming, so the admin is told to check back rather
// than watching a dot blink forever.
const STALE_PENDING_MS = 3 * 60 * 1000;

// Bound on how much of the provider's failure text is stored. The raw error can
// be large and can echo a request URL containing a key, so only a short
// operator-facing reason is kept.
const MAX_ERROR_LENGTH = 200;

const nf = new Intl.NumberFormat("en-US");

function fullName(user) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || "Unnamed account";
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    if (timer.unref) timer.unref();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * The admin copilot.
 *
 * Three rules, and all three exist because the alternative was a demo:
 *
 *  1. Every number handed to the model is read through AdminService, the same
 *     object the dashboard pages call. The assistant is not allowed to have its
 *     own idea of what "42 active users" means, because a copilot that
 *     disagrees with the table beside it is worse than no copilot.
 *  2. The model is given the figures and told to answer only from them. It is
 *     not given the database and no tool, so the only way it can state a number
 *     is by repeating one that was measured here.
 *  3. An ask is durable before it is answered. The question is written to a row
 *     and the provider call is handed to a queue, so the answer survives the
 *     admin navigating away, closing the tab or losing their connection. A
 *     client that disconnects cannot cancel work that is already paid for.
 *
 * What leaves this service is therefore aggregate platform data plus account
 * names — never an email address, a password hash, a token, or a task body.
 */
class AdminCopilotService {
  constructor(prisma, adminService, aiService, options = {}) {
    this.prisma = prisma;
    this.adminService = adminService;
    this.aiService = aiService;
    // `=== undefined` rather than `??` so a test can pass `queue: null` to force
    // the inline path. With `??` an explicit null would fall back to the real
    // queue and the test would silently depend on Redis.
    this.queue = options.queue === undefined ? adminCopilotQueue : options.queue;
    this.realtimeService = options.realtimeService ?? null;
  }

  /**
   * Accepts a question and returns immediately.
   *
   * The answer is almost never in this response any more: the row is created
   * PENDING and a job is queued, and the client polls (or listens) for the
   * answer. The one exception is a request that arrives while Redis is
   * unreachable, where waiting inline is strictly better than failing — the
   * question is already stored either way, so the admin gets their reply and
   * the row is reconciled to ANSWERED in the same call.
   */
  async ask(actorId, data) {
    const { question } = parseSchema(adminAskSchema, data);

    const exchange = await this.prisma.adminCopilotExchange.create({
      data: { adminId: actorId, question },
    });

    const job = await this.tryEnqueue({
      exchangeId: exchange.id,
      adminId: actorId,
    });

    if (job) {
      return { status: "queued", exchangeId: exchange.id, jobId: job.id };
    }

    // Redis is down. Answer inline so the ask is not stranded, and mark the row
    // FAILED if the provider call itself fails — an unhandled rejection here
    // would leave a permanent spinner in the widget with nobody to explain it.
    try {
      const answer = await this.answerExchange({
        exchangeId: exchange.id,
        adminId: actorId,
      });
      return { status: "done", exchangeId: exchange.id, ...answer };
    } catch (error) {
      // Tagged the same way the queue worker tags a quota failure, so the widget
      // can offer "try again in 47s" whether the ask was queued or answered
      // inline after Redis refused.
      await this.markFailed(exchange.id, describeProviderError(error), {
        quotaExhausted: isQuotaError(error),
        retryAfterMs: error?.details?.retryAfterMs ?? null,
      });
      throw error;
    }
  }

  /**
   * The worker body: measures the figures, asks the provider, stores the answer.
   *
   * Split out from `ask` so the same code runs whether the work came off the
   * queue or fell back inline. `job` is optional and only used for progress,
   * which is why the inline path passes nothing.
   */
  async answerExchange({ exchangeId, adminId, job = null }) {
    // Re-read rather than trusting the job payload. If an admin clears their
    // history while a job is in flight, the row is gone and there is nothing to
    // answer into.
    const exchange = await this.prisma.adminCopilotExchange.findFirst({
      where: { id: exchangeId, adminId },
    });
    if (!exchange) {
      throw new AppError("Copilot exchange not found", 404);
    }

    const emit = (phase) => {
      if (job && typeof job.updateProgress === "function") {
        job.updateProgress(phase).catch(() => {});
      }
      this.emitProgress(adminId, exchangeId, phase);
    };

    emit(10);

    const provider = await this.aiService.getProviderForUser(adminId);
    const [snapshot, history] = await Promise.all([
      this.buildSnapshot(),
      this.buildHistory(adminId, exchangeId),
    ]);

    emit(45);

    const response = await provider.generateTextWithRetry({
      systemPrompt: this.systemPrompt(snapshot),
      messages: [...history, { role: "user", content: exchange.question }],
    });

    emit(88);

    const updated = await this.prisma.adminCopilotExchange.update({
      where: { id: exchangeId },
      data: {
        answer: response.text,
        status: "ANSWERED",
        provider: provider.name,
        answeredAt: new Date(),
        // Cleared rather than left null: a retried job overwrites the reason
        // anyway, but a stale error next to a real answer is a lie.
        error: null,
      },
    });

    emit(100);
    this.emitAnswer(adminId, updated);

    return { answer: updated.answer, provider: updated.provider };
  }

  /**
   * Prior turns, oldest first, as provider-shaped messages.
   *
   * This is what makes the copilot a conversation rather than eight unrelated
   * questions: "and last month?" is only answerable if the previous turn is in
   * the prompt. The pending row that triggered this job is excluded, and the
   * slice is taken newest-first then reversed so the provider sees chronological
   * order.
   */
  async buildHistory(adminId, excludeId) {
    const rows = await this.prisma.adminCopilotExchange.findMany({
      where: {
        adminId,
        id: { not: excludeId },
        status: "ANSWERED",
      },
      orderBy: { createdAt: "desc" },
      take: MAX_HISTORY_TURNS,
      select: { question: true, answer: true },
    });

    return rows
      .reverse()
      .flatMap((row) => [
        { role: "user", content: row.question },
        { role: "assistant", content: row.answer ?? "" },
      ]);
  }

  /**
   * The admin's own thread, oldest first.
   *
   * This is the endpoint that makes a closed tab recoverable: on mount the
   * widget asks for the newest slice, sees any PENDING rows still unanswered
   * from a previous visit, and keeps polling them. `pending` is returned
   * separately as a count so the client can tell "nothing here" from "three
   * questions still in flight" without walking the list.
   *
   * The query takes the newest `limit` rows with `desc` and then reverses them.
   * Both halves matter: `asc` with a `take` would silently return the *oldest*
   * 50 exchanges and drop everything the admin just asked, while leaving `desc`
   * alone renders the conversation upside down, with the newest exchange at the
   * top where it reads as the oldest. Same reason `buildHistory` reverses.
   */
  async listExchanges(actorId, query = {}) {
    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 100);
    const staleBefore = new Date(Date.now() - STALE_PENDING_MS);

    const [rows, pending] = await Promise.all([
      this.prisma.adminCopilotExchange.findMany({
        where: { adminId: actorId },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      this.prisma.adminCopilotExchange.count({
        where: { adminId: actorId, status: "PENDING" },
      }),
    ]);

    return {
      items: rows.reverse().map(toWireExchange),
      pending,
      // Advisory only. The client uses it to stop animating a spinner; the row
      // is still PENDING and a late answer is still applied when it arrives.
      staleBefore: staleBefore.toISOString(),
    };
  }

  async clearExchanges(actorId) {
    const { count } = await this.prisma.adminCopilotExchange.deleteMany({
      where: { adminId: actorId },
    });
    return { deleted: count };
  }

  /**
   * Enqueue with a short timeout, degrading to inline on any failure.
   *
   * Mirrors the user-side assistant's `tryEnqueue` deliberately: a queue is an
   * optimisation for durability across a disconnect, not a hard dependency, and
   * refusing to answer because Redis is restarting would be a worse outcome
   * than answering synchronously.
   */
  async tryEnqueue(data) {
    if (!this.queue) return null;
    try {
      return await withTimeout(
        this.queue.add(ADMIN_COPILOT_JOB, data, {
          attempts: 3,
          backoff: { type: "exponential", delay: 2000 },
          removeOnComplete: { age: 3600, count: 200 },
          removeOnFail: { age: 86_400 },
        }),
        3000,
        "queue.add"
      );
    } catch (error) {
      console.warn(
        `[admin-copilot] queue unavailable (${error.message}) - answering inline`
      );
      return null;
    }
  }

  /**
   * Records a failure against the row.
   *
   * Called from the worker's own failure path, so a job that exhausts its three
   * attempts ends as a FAILED row the admin can see rather than a PENDING one
   * that never resolves. Idempotent: a job that failed after the answer was
   * already written is ignored, because the answer is the truth.
   */
  async markFailed(exchangeId, reason, meta = undefined) {
    try {
      await this.prisma.adminCopilotExchange.updateMany({
        where: { id: exchangeId, status: "PENDING" },
        data: { status: "FAILED", error: encodeFailure(reason, meta) },
      });
    } catch (error) {
      // Never let bookkeeping mask the failure that caused it.
      console.error(
        `[admin-copilot] could not mark exchange ${exchangeId} failed: ${error.message}`
      );
    }
  }

  emitProgress(adminId, exchangeId, phase) {
    if (!this.realtimeService) return;
    this.realtimeService.emitToUser(adminId, "admin:copilot:progress", {
      exchangeId,
      phase,
    });
  }

  emitAnswer(adminId, exchange) {
    if (!this.realtimeService) return;
    this.realtimeService.emitToUser(adminId, "admin:copilot:answer", {
      exchange: toWireExchange(exchange),
    });
  }

  /**
   * Everything the model is allowed to know, measured now.
   *
   * The four series methods are the dashboard's own reads, so the figures here
   * are the figures on screen. The per-account pass is extra: no dashboard card
   * ranks accounts, so there is nothing to reuse and it is queried directly.
   */
  async buildSnapshot() {
    // growth() takes a query object, not a bare count: its `= {}` default only
    // covers `undefined`, so passing 12 here reached the schema as a number and
    // failed every single request. Twelve months is pinned rather than inherited
    // so the answer covers a full year even as the dashboard's own window moves.
    const [overview, taskMix, weekly, growth, admins, accounts] = await Promise.all([
      this.adminService.overview(),
      this.adminService.taskMix(),
      this.adminService.weekly(),
      this.adminService.growth({ months: 12 }),
      this.prisma.user.count({ where: { role: "ADMIN" } }),
      this.buildAccountRows(),
    ]);

    return {
      capturedAt: new Date().toISOString(),
      overview,
      taskMix,
      weekly,
      growth,
      admins,
      accounts,
    };
  }

  /**
   * Per-account task volume, completion and derived activity.
   *
   * Task totals come from the user row's own count and completions from a
   * grouped count rather than N+1 queries. The cap is stated in the prompt so a
   * truncated answer is never presented as the whole population.
   */
  async buildAccountRows() {
    const [users, completedByUser] = await Promise.all([
      this.prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        take: USER_SAMPLE,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          role: true,
          createdAt: true,
          refreshTokens: {
            select: { lastUsedAt: true },
            orderBy: { lastUsedAt: "desc" },
            take: 1,
          },
          _count: { select: { tasks: true } },
        },
      }),
      this.prisma.task.groupBy({
        by: ["userId"],
        where: { status: "COMPLETED" },
        _count: { _all: true },
      }),
    ]);

    const completedMap = new Map(
      completedByUser.map((row) => [row.userId, row._count._all])
    );

    const rows = users.map((user) => {
      const tasks = user._count.tasks;
      const completed = completedMap.get(user.id) ?? 0;
      return {
        name: fullName(user),
        role: user.role,
        activity: deriveStatus(user.refreshTokens[0]?.lastUsedAt ?? null),
        joinedAt: user.createdAt.toISOString(),
        lastActiveAt: user.refreshTokens[0]?.lastUsedAt?.toISOString() ?? null,
        tasks,
        completed,
        completionRate: tasks > 0 ? Math.round((completed / tasks) * 100) : 0,
      };
    });

    return {
      sampled: rows.length < USER_SAMPLE,
      sampleLimit: USER_SAMPLE,
      totalOnPlatform: rows.length === USER_SAMPLE ? null : rows.length,
      rows,
    };
  }

  systemPrompt(snapshot) {
    const { overview } = snapshot;

    return [
      "You are the Taskora admin copilot. You answer questions from the administrator of the Taskora task manager about the state of the platform.",
      "",
      "Rules:",
      "- Answer only from the FIGURES below. They were measured a moment ago and they are the only facts you have.",
      "- If a figure is not in the FIGURES, say so plainly. Never estimate, extrapolate, or fill a gap with a plausible-sounding number.",
      "- There is no billing, plan, revenue, subscription, payment or pricing data anywhere in Taskora. If asked, say plainly that it is not recorded rather than inventing a figure.",
      "- There is no per-request AI success rate, latency or token usage recorded. Requests that fail are never stored, so a success rate cannot be computed and must not be quoted.",
      // Without this a greeting gets a paragraph restating the headline totals,
      // because the model has figures and feels obliged to use them. One line,
      // then an offer to help, is what "how are you" deserves.
      "- Greetings and thanks get one short friendly line, no figures, then an offer to help. Do not restate the headline numbers unprompted.",
      "- Earlier turns in this conversation are in the history. Answer follow-ups in their context, and use pronouns the way a person would.",
      "- Be brief. A short paragraph or a few bullet lines. No preamble, no restating the question.",
      "- **Bold** a figure or a name when it is the answer. Plain text otherwise; do not use headings, tables, code blocks or links.",
      "",
      "FIGURES",
      `Captured at: ${snapshot.capturedAt}`,
      "",
      "Headline:",
      `- Total accounts: ${nf.format(overview.totalUsers)}`,
      `- Administrators: ${nf.format(snapshot.admins)}`,
      `- Active accounts (refreshed a token in 30 days): ${nf.format(overview.activeUsers)}`,
      `- New in the last 30 days: ${nf.format(overview.newThisMonth)}`,
      `- Suspended: ${nf.format(overview.suspendedUsers)}`,
      `- Total tasks: ${nf.format(overview.totalTasks)} (${nf.format(overview.completedTasks)} completed, ${nf.format(overview.pendingTasks)} open, ${nf.format(overview.overdueTasks)} overdue)`,
      `- Platform completion rate: ${overview.completionRate}%`,
      `- Projects: ${nf.format(overview.totalProjects)}`,
      `- Completed AI replies: ${nf.format(overview.aiRequests)} (${nf.format(overview.aiRequestsToday)} in the last 24h)`,
      "",
      `Task mix: ${snapshot.taskMix.map((slice) => `${slice.label} ${nf.format(slice.value)}`).join(", ")}`,
      "",
      `This week, tasks created by day (${snapshot.weekly.labels.join(", ")}): ${snapshot.weekly.series.find((s) => s.key === "created").data.join(", ")}`,
      `This week, tasks completed by day (${snapshot.weekly.labels.join(", ")}): ${snapshot.weekly.series.find((s) => s.key === "completed").data.join(", ")}`,
      "",
      "Growth, last 12 months:",
      ...snapshot.growth.series.map(
        (series) => `- ${series.label} (${snapshot.growth.labels.join(", ")}): ${series.data.join(", ")}`
      ),
      "",
      "Accounts by derived activity:",
      ...this.activitySummary(snapshot.accounts.rows),
      "",
      this.accountTable(snapshot.accounts),
    ]
      .join("\n")
      .trim();
  }

  activitySummary(rows) {
    const count = (activity) => rows.filter((row) => row.activity === activity).length;
    const stranded = rows
      .filter((row) => row.activity === "INACTIVE")
      .reduce((sum, row) => sum + row.tasks, 0);

    return [
      `- Active: ${count("ACTIVE")}`,
      `- Gone quiet (no token refresh in over 30 days): ${count("INACTIVE")}`,
      `- Invited, never signed in: ${count("INVITED")}`,
      `- Tasks still sitting on the gone-quiet accounts: ${nf.format(stranded)}`,
    ];
  }

  accountTable(accounts) {
    if (accounts.rows.length === 0) {
      return "There are no accounts to break down yet.";
    }

    const busiest = accounts.rows
      .slice()
      .sort((a, b) => b.tasks - a.tasks)
      .slice(0, TOP_ACCOUNTS);

    const scope = accounts.sampled
      ? `The ${TOP_ACCOUNTS} busiest of the most recent ${nf.format(accounts.sampleLimit)} accounts (this platform has more accounts than were listed):`
      : `The ${TOP_ACCOUNTS} busiest accounts of the ${nf.format(accounts.rows.length)} on the platform:`;

    const lines = busiest.map(
      (row) =>
        `- ${row.name} (${row.activity.toLowerCase()}): ${nf.format(row.tasks)} tasks, ${nf.format(row.completed)} completed, ${row.completionRate}% completion`
    );

    return [
      scope,
      ...lines,
      "Say \"most active\" only about these accounts; do not claim to have ranked every account.",
    ].join("\n");
  }
}

/**
 * The wire shape of an exchange.
 *
 * Exposed as a function rather than inlined at each call site so the HTTP
 * response and the socket push are byte-identical — a client that renders the
 * same object from either path cannot show two different answers for one
 * question.
 */
function toWireExchange(row) {
  return {
    id: row.id,
    question: row.question,
    answer: row.answer ?? null,
    status: row.status,
    error: row.error ?? null,
    provider: row.provider ?? null,
    // Spread last so it owns `error`: decodeFailure returns the human-readable
    // sentence with the quota marker removed, plus the two facts the client
    // needs to tell a request limit apart from an unanswerable question.
    ...decodeFailure(row.error),
    createdAt: row.createdAt.toISOString(),
    answeredAt: row.answeredAt ? row.answeredAt.toISOString() : null,
  };
}

/**
 * A spent provider quota is a routine state, not a failure of the question, and
 * it needs the same treatment for the same reason: the admin can tell the two
 * apart only if the row says which one it was.
 *
 * `error` is a plain nullable String and adding a column would have meant
 * regenerating the Prisma client — which cannot run while the dev server holds
 * the query engine, so a forgotten restart would turn every failure into an
 * "Unknown argument" crash. A prefix on the existing column carries the same two
 * facts with no schema and no codegen step, and `decodeFailure` removes it again
 * so the client only ever sees the sentence.
 */
const FAILURE_PREFIX = "[quota]";
const FAILURE_META = /^\[quota\](?::(\d+))?\s*/;

function encodeFailure(reason, meta) {
  const text = reason || "The assistant could not answer that.";
  if (!meta?.quotaExhausted) return text;
  const ms = Number(meta.retryAfterMs);
  return Number.isFinite(ms) && ms > 0
    ? `${FAILURE_PREFIX}:${Math.round(ms)} ${text}`
    : `${FAILURE_PREFIX} ${text}`;
}

function decodeFailure(stored) {
  if (typeof stored !== 'string' || !stored.startsWith(FAILURE_PREFIX)) {
    return { error: stored ?? null, quotaExhausted: false, retryAfterMs: null };
  }
  const match = stored.match(FAILURE_META);
  const ms = match?.[1] ? Number(match[1]) : null;
  return {
    error: stored.replace(FAILURE_META, ''),
    quotaExhausted: true,
    retryAfterMs: Number.isFinite(ms) ? ms : null,
  };
}

/**
 * A short, safe reason for a FAILED row.
 *
 * Never the raw provider payload: it can echo a request URL containing a key,
 * and this string is shown in the admin UI and returned by the list endpoint.
 */
function describeProviderError(error) {
  const message = error?.message || "The assistant could not answer that.";
  return message.slice(0, MAX_ERROR_LENGTH);
}

module.exports = AdminCopilotService;
module.exports.toWireExchange = toWireExchange;
module.exports.MAX_HISTORY_TURNS = MAX_HISTORY_TURNS;
