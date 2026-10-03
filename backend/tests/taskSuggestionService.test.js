// TaskSuggestionService with a mock prisma: generation idempotency,
// accept/skip/ownership, and "user already handled it" suppression.
// Run with: node tests/taskSuggestionService.test.js
const assert = require("assert");
const AppError = require("../src/utils/AppError");
const TaskPatternService = require("../src/services/user/taskPatternService.js");
const TaskSuggestionService = require("../src/services/user/taskSuggestionService.js");

function buildMock() {
  const state = {
    idSeq: 1,
    patterns: [],
    suggestions: [],
    tasks: [],
    notifications: [],
    createdTasks: [],
  };

  // ---- naive in-memory matcher for the shapes this service uses ----
  function matchTaskPattern(p, where = {}) {
    if (where.active !== undefined && p.active !== where.active) return false;
    if (where.nextOccurrence && where.nextOccurrence.lte !== undefined) {
      if (!(p.nextOccurrence <= where.nextOccurrence.lte)) return false;
    }
    return true;
  }

  function matchSuggestion(s, where = {}) {
    if (where.id !== undefined && s.id !== where.id) return false;
    if (where.userId !== undefined && s.userId !== where.userId) return false;
    if (where.status !== undefined && s.status !== where.status) return false;
    if (where.patternId !== undefined && s.patternId !== where.patternId) return false;
    if (where.suggestedDate !== undefined && s.suggestedDate !== where.suggestedDate) {
      return false;
    }
    return true;
  }

  function matchTask(t, where = {}) {
    if (where.userId !== undefined && t.userId !== where.userId) return false;
    if (where.OR) {
      return where.OR.some((branch) => {
        return Object.entries(branch).every(([field, cond]) => {
          if (cond && typeof cond === "object" && ("gte" in cond || "lte" in cond || "lt" in cond || "gt" in cond)) {
            const v = new Date(t[field]).getTime();
            if (cond.gte !== undefined && v < new Date(cond.gte).getTime()) return false;
            if (cond.lte !== undefined && v > new Date(cond.lte).getTime()) return false;
            return true;
          }
          return t[field] === cond;
        });
      });
    }
    return true;
  }

  function withPattern(s) {
    return {
      ...s,
      pattern: state.patterns.find((p) => p.id === s.patternId) || null,
    };
  }

  const prisma = {
    taskPattern: {
      findMany: async ({ where = {} } = {}) =>
        state.patterns.filter((p) => matchTaskPattern(p, where)),
      findUnique: async ({ where }) =>
        state.patterns.find(
          (p) =>
            where.userId_normalizedTitle.userId === p.userId &&
            where.userId_normalizedTitle.normalizedTitle === p.normalizedTitle
        ) || null,
      update: async ({ where, data }) => {
        const p = state.patterns.find((x) => x.id === where.id);
        Object.assign(p, data);
        return p;
      },
    },
    taskSuggestion: {
      findMany: async ({ where = {}, skip = 0, take = 25, include } = {}) => {
        let rows = state.suggestions
          .filter((s) => matchSuggestion(s, where))
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        rows = rows.slice(skip, skip + take);
        return include && include.pattern ? rows.map(withPattern) : rows;
      },
      count: async ({ where = {} } = {}) =>
        state.suggestions.filter((s) => matchSuggestion(s, where)).length,
      findFirst: async ({ where, include }) => {
        const s = state.suggestions.find((x) => matchSuggestion(x, where)) || null;
        return include && include.pattern ? (s ? withPattern(s) : null) : s;
      },
      create: async ({ data }) => {
        const rec = {
          id: `sg${state.idSeq++}`,
          createdAt: new Date("2026-10-28T10:00:00.000Z"),
          status: "PENDING",
          ...data,
        };
        state.suggestions.push(rec);
        return { ...rec };
      },
      update: async ({ where, data }) => {
        const s = state.suggestions.find((x) => x.id === where.id);
        Object.assign(s, data);
        return { ...s };
      },
      updateMany: async ({ where, data }) => {
        const matches = state.suggestions.filter((s) => matchSuggestion(s, where));
        matches.forEach((s) => Object.assign(s, data));
        return { count: matches.length };
      },
    },
    task: {
      findMany: async ({ where = {}, select, take }) => {
        let rows = state.tasks.filter((t) => matchTask(t, where)).slice(0, take || 100);
        if (select) {
          rows = rows.map((t) =>
            Object.fromEntries(Object.keys(select).map((k) => [k, t[k]]))
          );
        }
        return rows;
      },
      findUnique: async ({ where }) =>
        state.tasks.find((t) => t.id === where.id) || null,
    },
  };

  // ---- collaborators ----
  const notificationService = {
    creates: [],
    async create(userId, data) {
      const n = { id: `n${state.idSeq++}`, userId, ...data };
      notificationService.creates.push(n);
      return n;
    },
  };

  const taskService = {
    createCalls: [],
    async create(userId, data) {
      const t = { id: `t${state.idSeq++}`, userId, ...data };
      state.createdTasks.push(t);
      taskService.createCalls.push({ userId, data });
      return { ...t, dueDate: data.dueDate };
    },
  };

  const taskPatternService = new TaskPatternService(prisma);
  const suggestionService = new TaskSuggestionService(
    prisma,
    notificationService,
    taskPatternService,
    taskService
  );

  return { state, prisma, notificationService, taskService, suggestionService };
}

function seedPattern(state, overrides = {}) {
  const p = {
    id: "p1",
    userId: "u1",
    normalizedTitle: "clean room",
    taskTitle: "Clean room",
    frequencyType: "BIWEEKLY",
    intervalDays: 14,
    nextOccurrence: "2026-10-28",
    confidence: 0.88,
    active: true,
    ...overrides,
  };
  state.patterns.push(p);
  return p;
}

async function run() {
  // ---------- generation creates exactly one suggestion + one notification ----------
  {
    const m = buildMock();
    seedPattern(m.state);

    const created = await m.suggestionService.generateDueSuggestions({
      todayKey: "2026-10-28",
    });

    assert.strictEqual(created.length, 1);
    assert.strictEqual(created[0].suggestedDate, "2026-10-28");
    assert.strictEqual(created[0].status, "PENDING");
    assert.strictEqual(m.notificationService.creates.length, 1);
    assert.strictEqual(
      m.notificationService.creates[0].taskSuggestionId,
      created[0].id
    );
    assert.strictEqual(m.notificationService.creates[0].type, "TASK_PATTERN_SUGGESTION");

    // Second run must not duplicate.
    const again = await m.suggestionService.generateDueSuggestions({
      todayKey: "2026-10-28",
    });
    assert.strictEqual(again.length, 0);
    assert.strictEqual(m.state.suggestions.length, 1);
    assert.strictEqual(m.notificationService.creates.length, 1);
    console.log("generation + idempotency + notification: OK");
  }

  // ---------- outside the window: no suggestion ----------
  {
    const m = buildMock();
    seedPattern(m.state, { nextOccurrence: "2026-12-01" });

    const created = await m.suggestionService.generateDueSuggestions({
      todayKey: "2026-10-28",
    });
    assert.strictEqual(created.length, 0);
    assert.strictEqual(m.state.suggestions.length, 0);
    console.log("out-of-window ignored: OK");
  }

  // ---------- slipped cycle: skip the overdue one, suggest the next one ----------
  {
    const m = buildMock();
    // Pattern expected 2026-10-07 but the user last completed on 10-21, so the
    // 10-07 cycle is already more than 2 days stale and must not nag.
    seedPattern(m.state, {
      normalizedTitle: "pay rent",
      taskTitle: "Pay rent",
      frequencyType: "MONTHLY",
      intervalDays: 31,
      lastOccurrence: "2026-10-21",
      nextOccurrence: "2026-10-07",
    });

    const created = await m.suggestionService.generateDueSuggestions({
      todayKey: "2026-10-28",
    });
    assert.strictEqual(created.length, 0, "stale cycle must not suggest");
    assert.strictEqual(m.state.patterns[0].nextOccurrence, "2026-11-07");

    // The next cycle (11-07) approaches: now it is in-window and fires.
    const created2 = await m.suggestionService.generateDueSuggestions({
      todayKey: "2026-11-05",
    });
    assert.strictEqual(created2.length, 1);
    assert.strictEqual(created2[0].suggestedDate, "2026-11-07");
    console.log("slipped-cycle roll-forward: OK");
  }

  // ---------- already-handled task suppresses the suggestion ----------
  {
    const m = buildMock();
    seedPattern(m.state);
    // User already created the same-title task exactly on the expected date.
    m.state.tasks.push({
      id: "t0",
      userId: "u1",
      title: "Clean room",
      createdAt: new Date("2026-10-28T08:00:00.000Z"),
      completedAt: null,
      dueDate: new Date("2026-10-28T08:00:00.000Z"),
    });

    const created = await m.suggestionService.generateDueSuggestions({
      todayKey: "2026-10-28",
    });
    assert.strictEqual(created.length, 0);
    assert.strictEqual(m.state.suggestions.length, 0);
    console.log("already-handled suppression: OK");
  }

  // ---------- accept creates the task with a full ISO dueDate ----------
  {
    const m = buildMock();
    seedPattern(m.state);
    const [sugg] = await m.suggestionService.generateDueSuggestions({
      todayKey: "2026-10-28",
    });

    const { task } = await m.suggestionService.accept("u1", sugg.id);

    assert.strictEqual(m.taskService.createCalls.length, 1);
    const call = m.taskService.createCalls[0];
    assert.strictEqual(call.userId, "u1");
    assert.strictEqual(call.data.title, "Clean room");
    assert.strictEqual(call.data.dueDate, "2026-10-28T00:00:00.000Z");
    assert.strictEqual(task.id, call.data.dueDate ? m.state.createdTasks[0].id : task.id);

    const stored = m.state.suggestions[0];
    assert.strictEqual(stored.status, "ACCEPTED");
    assert.strictEqual(stored.createdTaskId, task.id);
    console.log("accept creates task + ISO dueDate + marks ACCEPTED: OK");
  }

  // ---------- re-accept is idempotent (returns same task, no duplicate) ----------
  {
    const m = buildMock();
    seedPattern(m.state);
    const [sugg] = await m.suggestionService.generateDueSuggestions({
      todayKey: "2026-10-28",
    });

    const first = await m.suggestionService.accept("u1", sugg.id);
    m.state.tasks.push(first.task);
    const second = await m.suggestionService.accept("u1", sugg.id);

    assert.strictEqual(m.taskService.createCalls.length, 1);
    assert.strictEqual(second.task.id, first.task.id);
    console.log("idempotent re-accept: OK");
  }

  // ---------- ownership: a different user cannot accept = 404 ----------
  {
    const m = buildMock();
    seedPattern(m.state);
    const [sugg] = await m.suggestionService.generateDueSuggestions({
      todayKey: "2026-10-28",
    });

    await assert.rejects(
      () => m.suggestionService.accept("u2", sugg.id),
      (err) => err instanceof AppError && err.statusCode === 404
    );
    console.log("ownership check (404): OK");
  }

  // ---------- skip records the decision ----------
  {
    const m = buildMock();
    seedPattern(m.state);
    const [sugg] = await m.suggestionService.generateDueSuggestions({
      todayKey: "2026-10-28",
    });

    const skipped = await m.suggestionService.skip("u1", sugg.id);
    assert.strictEqual(skipped.status, "SKIPPED");
    assert.ok(skipped.respondedAt instanceof Date);

    // Skipping a second time is a conflict.
    await assert.rejects(
      () => m.suggestionService.skip("u1", sugg.id),
      (err) => err instanceof AppError && err.statusCode === 409
    );
    console.log("skip + non-pending conflict: OK");
  }

  // ---------- listing only returns the user's own suggestions ----------
  {
    const m = buildMock();
    seedPattern(m.state);
    const [s1] = await m.suggestionService.generateDueSuggestions({
      todayKey: "2026-10-28",
    });
    // Someone else's suggestion from another pattern.
    m.state.suggestions.push({
      id: "sg-x",
      userId: "u2",
      patternId: "p9",
      suggestedDate: "2026-11-01",
      status: "PENDING",
      createdAt: new Date("2026-10-28T09:00:00.000Z"),
    });
    assert.ok(s1.id);

    const list = await m.suggestionService.list("u1", { page: 1, limit: 10 });
    assert.ok(list.items.every((s) => s.userId === "u1"), "only own suggestions");
    assert.ok(
      list.items.some((s) => s.pattern && s.pattern.taskTitle === "Clean room")
    );
    console.log("list scoped to owner: OK");
  }

  console.log("All task suggestion service tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});