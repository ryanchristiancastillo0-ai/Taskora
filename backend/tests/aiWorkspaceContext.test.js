// Covers the pieces the dashboard AI card depends on:
//   - timezone-correct "today" boundaries (the UTC-server trap)
//   - the deterministic summary and suggestion lines
//   - the static app help doc reaching the system prompt
//   - the workspace snapshot reaching the chat prompt
const assert = require("assert");

const {
  dayRangeUtc,
  startOfDayUtc,
  zoneOffsetMs,
  buildDateTimeContext,
} = require("../src/utils/dateTime");
const { APP_HELP } = require("../src/services/ai/appHelp.js");
const AIContextBuilder = require("../src/services/ai/aiContextBuilder.js");
const WorkspaceSnapshotService = require("../src/services/ai/workspaceSnapshotService.js");

async function run() {
  // --- day boundaries in an explicit zone ---------------------------------
  {
    const { start, end } = dayRangeUtc("2026-09-26", "Asia/Manila");

    // Manila is UTC+8, so local midnight is 16:00 UTC the previous day.
    assert.strictEqual(start.toISOString(), "2026-09-25T16:00:00.000Z");
    assert.strictEqual(end.toISOString(), "2026-09-26T16:00:00.000Z");

    // This is the whole point: a UTC server would have used 2026-09-26T00:00Z
    // and mis-bucketed every task due in the first 8 hours of the user's day.
    assert.notStrictEqual(start.toISOString(), "2026-09-26T00:00:00.000Z");
    assert.strictEqual(end - start, 86_400_000, "range is exactly 24h outside DST");
    console.log("ok  day range uses the user's zone, not UTC");
  }

  // --- a western zone rolls the other way ---------------------------------
  {
    const { start, end } = dayRangeUtc("2026-09-26", "America/New_York");
    assert.strictEqual(start.toISOString(), "2026-09-26T04:00:00.000Z");
    assert.strictEqual(end.toISOString(), "2026-09-27T04:00:00.000Z");
    console.log("ok  day range for a negative-offset zone");
  }

  // --- half-hour and 45-minute offset zones -------------------------------
  {
    assert.strictEqual(
      startOfDayUtc("2026-09-26", "Asia/Kolkata").toISOString(),
      "2026-09-25T18:30:00.000Z",
      "UTC+5:30"
    );
    assert.strictEqual(
      startOfDayUtc("2026-09-26", "Asia/Kathmandu").toISOString(),
      "2026-09-25T18:15:00.000Z",
      "UTC+5:45"
    );
    console.log("ok  fractional-hour offset zones");
  }

  // --- DST boundaries ------------------------------------------------------
  {
    // US DST ends 2026-11-01; Manila does not observe DST. Both must still give
    // a correct local midnight, and New York's day is 25h long.
    const manila = dayRangeUtc("2026-11-01", "Asia/Manila");
    assert.strictEqual(manila.start.toISOString(), "2026-10-31T16:00:00.000Z");
    assert.strictEqual(manila.end - manila.start, 86_400_000, "Manila is always 24h");

    const ny = dayRangeUtc("2026-11-01", "America/New_York");
    assert.strictEqual(ny.start.toISOString(), "2026-11-01T04:00:00.000Z");
    assert.strictEqual(
      ny.end - ny.start,
      25 * 3_600_000,
      "a DST fall-back day is 25 hours long"
    );

    // And the offset actually reported for that day is the standard one.
    assert.strictEqual(
      zoneOffsetMs(new Date("2026-11-01T12:00:00Z"), "America/New_York"),
      -5 * 3_600_000,
      "EST after the transition"
    );
    assert.strictEqual(
      zoneOffsetMs(new Date("2026-10-01T12:00:00Z"), "America/New_York"),
      -4 * 3_600_000,
      "EDT before the transition"
    );
    console.log("ok  DST transitions handled in both directions");
  }

  // --- month/year boundary ------------------------------------------------
  {
    const { start, end } = dayRangeUtc("2027-01-01", "Asia/Manila");
    assert.strictEqual(start.toISOString(), "2026-12-31T16:00:00.000Z");
    assert.strictEqual(end.toISOString(), "2027-01-01T16:00:00.000Z");
    console.log("ok  day range across a year boundary");
  }

  // --- summary lines are derived, not hardcoded ----------------------------
  const svc = new WorkspaceSnapshotService({});
  const base = {
    openTasks: 5, inProgress: 1, dueToday: 0, overdue: 0, completedToday: 0,
    totalTasks: 9, completedTotal: 4,
    goalTotal: 2, goalsActive: 1, goalTitles: ["Ship v2"], habitTotal: 3,
    habitsActive: 3, habitTitles: [], noteTotal: 4, projectTotal: 2,
    dueTodayList: [], overdueList: [], upcomingList: [],
  };

  {
    const text = svc.buildSummary({ ...base, dueToday: 3 });
    assert.ok(text.includes("3 tasks due today"), text);
    assert.ok(!text.includes("0 tasks"), "must not claim zero when tasks exist");
  }
  {
    const text = svc.buildSummary({ ...base, dueToday: 1 });
    assert.ok(text.includes("1 task due today"), "singular wording");
    assert.ok(!text.includes("1 tasks"), text);
  }
  {
    const text = svc.buildSummary({ ...base, overdue: 2, dueToday: 1 });
    assert.ok(text.includes("2 overdue tasks"), text);
    assert.ok(text.includes("1 due today"), text);
  }
  // An empty account and a fully-completed one read very differently, and
  // conflating them is what made the assistant say "0 tasks" misleadingly.
  {
    const empty = svc.buildSummary({ ...base, totalTasks: 0, openTasks: 0, completedTotal: 0 });
    assert.ok(empty.includes("haven't added any tasks"), empty);

    const allDone = svc.buildSummary({
      ...base, openTasks: 0, totalTasks: 9, completedTotal: 9, completedToday: 2,
    });
    assert.ok(allDone.includes("all 9"), allDone);
    assert.ok(allDone.includes("2 finished today"), allDone);
    assert.ok(!allDone.includes("haven't added"), "must not claim the account is empty");
  }
  console.log("ok  empty vs fully-completed accounts read differently");

  // "How many tasks do I have" needs the total, not just the open count.
  {
    const prompt = new AIContextBuilder().buildWorkspaceSummary({
      ...base, totalTasks: 9, completedTotal: 4,
    });
    assert.ok(prompt.includes("9 in total"), prompt);
    assert.ok(prompt.includes("4 completed all-time"), prompt);
    assert.ok(prompt.includes("5 still open"), prompt);

    const zero = new AIContextBuilder().buildWorkspaceSummary({
      ...base, totalTasks: 0, openTasks: 0, completedTotal: 0,
    });
    assert.ok(zero.includes("no tasks at all"), zero);
  }
  console.log("ok  prompt reports task totals, not just open counts");
  console.log("ok  summary line reflects live counts with correct pluralisation");

  // --- suggestions name real tasks ----------------------------------------
  {
    const overdue = svc.buildSuggestion({
      ...base,
      overdueList: [{ title: "Pay rent" }],
    });
    assert.ok(overdue.includes("Pay rent"), overdue);

    const quick = svc.buildSuggestion({
      ...base,
      dueTodayList: [
        { title: "Big report", estimatedMinutes: 240 },
        { title: "Reply to Ana", estimatedMinutes: 10 },
      ],
    });
    assert.ok(quick.includes("Reply to Ana"), "should pick the shortest task");
    assert.ok(!quick.includes("Big report"));
    assert.ok(quick.includes("10 min"), quick);

    const upcoming = svc.buildSuggestion({
      ...base,
      upcomingList: [{ title: "Tax filing" }],
    });
    assert.ok(upcoming.includes("Tax filing"), upcoming);

    const goal = svc.buildSuggestion({ ...base, goalTitles: ["Run a marathon"] });
    assert.ok(goal.includes("Run a marathon"), goal);

    // goalsActive is a count, not a list. A number has no .length, so this
    // guards against the goal branch silently never firing again.
    const countedOnly = svc.buildSuggestion({ ...base, goalTitles: [], goalsActive: 1 });
    assert.ok(
      !countedOnly.includes("undefined") && !countedOnly.includes("NaN"),
      countedOnly
    );

    const clear = svc.buildSuggestion({ ...base, openTasks: 0 });
    assert.ok(clear.toLowerCase().includes("inbox zero"), clear);
  }
  console.log("ok  suggestion names a real task / goal, never invented text");

  // --- context summary shape ----------------------------------------------
  {
    const snapshot = {
      ...base,
      dueToday: 1,
      timeZone: "Asia/Manila",
      dueTodayList: [{ id: "1", title: "Reply to Ana", priority: "HIGH", estimatedMinutes: 10, dueDate: new Date("2026-09-26T02:00:00Z") }],
      overdueList: [],
      upcomingList: [],
    };
    const summary = svc.contextSummary(snapshot);
    assert.strictEqual(summary.dueToday, 1);
    assert.strictEqual(summary.dueTodayList.length, 1);
    assert.ok(summary.dueTodayList[0].includes("Reply to Ana"));
    assert.ok(summary.dueTodayList[0].includes("2026-09-26"), "due date rendered in user zone");
    assert.ok(
      !("notes" in summary),
      "note bodies must not leak into the prompt"
    );
  }
  console.log("ok  prompt summary carries counts, not note contents");

  // --- app help reaches the system prompt ---------------------------------
  {
    const builder = new AIContextBuilder();
    const { prompt } = builder.buildSystemPrompt({ profileContext: null, timezone: "Asia/Manila" });

    assert.ok(prompt.includes("How this app works"), "help section missing");
    assert.ok(prompt.includes("Theme control"), "dark mode steps missing");
    assert.ok(prompt.includes("Forgot password"), "password steps missing");
    assert.ok(prompt.includes("/settings"), "page list missing");
    assert.ok(
      prompt.includes("answer using ONLY the steps"),
      "grounding rule missing — this is what stops invented instructions"
    );
    assert.ok(
      prompt.includes("If the reference does not cover"),
      "must be allowed to admit gaps"
    );
  }
  console.log("ok  static app help + grounding rules in the system prompt");

  // --- help doc is honest about what does not exist ------------------------
  {
    assert.ok(
      !/settings > security|security tab/i.test(APP_HELP),
      "must not invent a security page that does not exist"
    );
    assert.ok(
      /no 'change password' form/i.test(APP_HELP),
      "must state plainly that there is no in-app password form"
    );
  }
  console.log("ok  help doc does not invent a password-change page");

  // --- workspace summary reaches the chat prompt --------------------------
  {
    const builder = new AIContextBuilder();
    const summary = builder.buildWorkspaceSummary({
      openTasks: 7, totalTasks: 11, completedTotal: 4,
      dueToday: 2, overdue: 1, inProgress: 3, completedToday: 1,
      goalTotal: 4, goalsActive: 2, goalTitles: ["Ship v2", "Run a marathon"],
      habitTotal: 3, habitTitles: ["Morning run"], noteTotal: 9, projectTotal: 5,
      dueTodayList: ["Reply to Ana, high, ~10 min"],
      overdueList: ["Pay rent"],
      upcomingList: ["Tax filing, due 2026-10-02"],
    });

    assert.ok(summary.includes("7 open") || summary.includes("7 still open"), summary);
    assert.ok(summary.includes("Goals: 4 total, 2 still active"), summary);
    assert.ok(summary.includes("Pay rent"), summary);
    assert.ok(!summary.includes("undefined"), "no missing values may leak into the prompt");

    const content = builder.buildChatUserContent({
      request: "how many goals do I have?",
      taskContext: "- Reply to Ana status: TODO",
      projectNames: ["Taskora"],
      workspaceSummary: summary,
    });

    assert.ok(content.includes("Workspace snapshot"), "summary must reach the prompt");
    assert.ok(content.includes("Goals: 4 total, 2 still active"));
    assert.ok(content.includes("how many goals do I have?"), "user request preserved");
    assert.ok(content.indexOf("Workspace snapshot") < content.indexOf("User request"));
    console.log("ok  workspace snapshot reaches the chat prompt ahead of the request");
  }

  // --- chat still works with no snapshot at all ---------------------------
  {
    const builder = new AIContextBuilder();
    const content = builder.buildChatUserContent({
      request: "hello",
      taskContext: null,
      projectNames: [],
      workspaceSummary: null,
    });
    assert.strictEqual(content, "User request: hello");
  }
  console.log("ok  chat degrades cleanly when no snapshot is available");

  // --- timezone context still consistent ----------------------------------
  {
    const ctx = buildDateTimeContext({ timeZone: "Asia/Manila" });
    const { start } = dayRangeUtc(ctx.date, "Asia/Manila");
    assert.ok(start <= new Date(), "today's start must be in the past");
    assert.ok(start > new Date(Date.now() - 86_400_000), "and within the last day");
  }
  console.log("ok  live context date and day range agree");

  // --- live query wiring, against a stub prisma ---------------------------
  // The pure-function tests above can all pass while the Prisma `where` clauses
  // are wrong, which would silently mis-bucket every task. This exercises the
  // real build() path and inspects the queries it issues.
  {
    const calls = [];
    const record = (model, op) => (args) => {
      calls.push({ model, op, args });
      if (op === "count") {
        if (model === "task") return 0;
        return 0;
      }
      return [];
    };

    const prisma = {
      userSettings: {
        findUnique: async (args) => {
          calls.push({ model: "userSettings", op: "findUnique", args });
          return { timezone: "Asia/Manila" };
        },
      },
      task: {
        count: record("task", "count"),
        findMany: record("task", "findMany"),
      },
      goal: { findMany: record("goal", "findMany") },
      habit: { findMany: record("habit", "findMany") },
      note: { count: record("note", "count") },
      project: { count: record("project", "count") },
    };

    const live = new WorkspaceSnapshotService(prisma);
    const snap = await live.build("user-1");

    assert.strictEqual(snap.timeZone, "Asia/Manila", "must read the user's zone");
    assert.match(snap.today, /^\d{4}-\d{2}-\d{2}$/);
    assert.strictEqual(snap.openTasks, 0);

    // The user's stored timezone must be honoured, not the server default.
    const settingsCall = calls.find((c) => c.model === "userSettings");
    assert.ok(settingsCall, "must query user settings for the timezone");

    // Due-today, overdue and upcoming all key off dueDate but with different
    // shapes, so identify each explicitly rather than by "has an lt".
    const taskLists = calls.filter((c) => c.model === "task" && c.op === "findMany");
    const dueCall = taskLists.find(
      (c) => c.args.where?.dueDate?.gte instanceof Date && c.args.where?.dueDate?.lt instanceof Date
    );
    const overdueCall = taskLists.find(
      (c) => c.args.where?.dueDate?.lt instanceof Date && !(c.args.where?.dueDate?.gte instanceof Date)
    );
    const upcomingCall = taskLists.find(
      (c) => c.args.where?.dueDate?.gte instanceof Date && !c.args.where?.dueDate?.lt
    );

    assert.ok(dueCall, "due-today query must exist");
    assert.ok(overdueCall, "overdue query must exist");
    assert.ok(upcomingCall, "upcoming query must exist");

    assert.strictEqual(
      dueCall.args.where.dueDate.gte.toISOString(),
      "2026-09-25T16:00:00.000Z",
      "due-today must start at Manila midnight, not UTC midnight"
    );
    // Overdue must end where due-today begins, with no gap and no overlap.
    assert.strictEqual(
      overdueCall.args.where.dueDate.lt.toISOString(),
      dueCall.args.where.dueDate.gte.toISOString(),
      "overdue and due-today must not overlap"
    );
    assert.strictEqual(
      upcomingCall.args.where.dueDate.gte.toISOString(),
      dueCall.args.where.dueDate.lt.toISOString(),
      "upcoming must start where due-today ends"
    );
    assert.ok(
      taskLists.every(
        (c) =>
          c.args.where.status?.in?.includes("TODO") &&
          !c.args.where.status.in.includes("COMPLETED")
      ),
      "every task list query must cover only genuinely open work"
    );

    // Open-task counts must exclude COMPLETED, or "open" would include done
    // work. The completed-today count is the one that legitimately filters to
    // status === "COMPLETED" (a string, not a { in } list).
    for (const call of calls.filter((c) => c.model === "task" && c.op === "count")) {
      const status = call.args.where?.status;
      if (status && typeof status === "object") {
        assert.ok(!status.in.includes("COMPLETED"), "open counts must exclude completed");
        assert.ok(!status.in.includes("CANCELLED"), "open counts must exclude cancelled");
      }
    }

    // Completed-today is the one count that SHOULD filter to COMPLETED.
    const completed = calls.find(
      (c) => c.model === "task" && c.op === "count" && c.args.where?.status === "COMPLETED"
    );
    assert.ok(completed, "completed-today count must exist");
    assert.ok(completed.args.where.completedAt.gte instanceof Date);

    // Notes/habits/goals must be scoped to the user, never global.
    for (const model of ["goal", "habit"]) {
      const call = calls.find((c) => c.model === model);
      assert.strictEqual(call.args.where.userId, "user-1", `${model} must be scoped`);
    }
    for (const model of ["note", "project"]) {
      const call = calls.find((c) => c.model === model);
      assert.strictEqual(call.args.where.userId, "user-1", `${model} must be scoped`);
    }
  }
  console.log("ok  prisma queries scoped, timezone-bounded and status-correct");

  // --- bad stored timezone must not break the snapshot --------------------
  {
    const prisma = {
      userSettings: { findUnique: async () => ({ timezone: "Not/AZone" }) },
      task: { count: async () => 0, findMany: async () => [] },
      goal: { findMany: async () => [] },
      habit: { findMany: async () => [] },
      note: { count: async () => 0 },
      project: { count: async () => 0 },
    };
    const live = new WorkspaceSnapshotService(prisma);
    const snap = await live.build("user-1");
    assert.strictEqual(snap.timeZone, "Asia/Manila", "garbage zone falls back");
  }
  console.log("ok  a garbage stored timezone falls back instead of throwing");

  // --- selected fields must exist in the real schema ----------------------
  // Habit uses `name`, not `title`, and has no isActive flag. Guessing field
  // names makes Prisma throw at runtime, which surfaced as the card silently
  // reporting "live counts are unavailable". This walks the real schema file so
  // that class of bug cannot come back.
  {
    const fs = require("fs");
    const path = require("path");
    const schemaPath = path.join(__dirname, "..", "prisma", "schema.prisma");
    const schema = fs.readFileSync(schemaPath, "utf8");

    const modelFields = {};
    let current = null;
    for (const line of schema.split(/\r?\n/)) {
      const start = line.match(/^model\s+(\w+)\s*\{/);
      if (start) {
        current = start[1];
        modelFields[current] = new Set();
        continue;
      }
      if (current) {
        if (/^\}/.test(line)) {
          current = null;
          continue;
        }
        const field = line.match(/^\s+(\w+)\s+\w/);
        if (field) modelFields[current].add(field[1]);
      }
    }

    const selects = [];
    const rec = (model, op) => (args) => {
      if (args?.select) selects.push({ model, select: Object.keys(args.select) });
      return op === "count" ? 0 : [];
    };

    const prisma = {
      userSettings: { findUnique: async () => ({ timezone: "Asia/Manila" }) },
      task: { count: rec("task", "count"), findMany: rec("task", "findMany") },
      goal: { findMany: rec("goal", "findMany") },
      habit: { findMany: rec("habit", "findMany") },
      note: { count: rec("note", "count") },
      project: { count: rec("project", "count") },
    };

    await new WorkspaceSnapshotService(prisma).build("user-1");

    assert.ok(selects.length > 0, "expected the service to select fields");
    for (const { model, select } of selects) {
      const name = model.charAt(0).toUpperCase() + model.slice(1);
      const fields = modelFields[name];
      assert.ok(fields, `model ${name} not found in schema.prisma`);
      for (const field of select) {
        assert.ok(
          fields.has(field),
          `${name}.${field} does not exist in schema.prisma — this would throw at runtime`
        );
      }
    }

    // Specifically pin the two that were wrong.
    assert.ok(modelFields.Habit.has("name"), "Habit should expose name");
    assert.ok(!modelFields.Habit.has("title"), "Habit has no title field");
    assert.ok(!modelFields.Habit.has("isActive"), "Habit has no isActive flag");
    assert.ok(modelFields.Task.has("completedAt"));
    assert.ok(modelFields.Goal.has("targetDate"));
  }
  console.log("ok  every selected field exists in schema.prisma");

  // --- cancelled tasks must not count as open work ------------------------
  {
    const calls = [];
    const prisma = {
      userSettings: { findUnique: async () => ({ timezone: "Asia/Manila" }) },
      task: {
        count: async (args) => {
          calls.push(args);
          return 0;
        },
        findMany: async (args) => {
          calls.push(args);
          return [];
        },
      },
      goal: { findMany: async () => [] },
      habit: { findMany: async () => [] },
      note: { count: async () => 0 },
      project: { count: async () => 0 },
    };

    await new WorkspaceSnapshotService(prisma).build("user-1");

    const statusFilters = calls
      .map((c) => c.where?.status)
      .filter((s) => s && typeof s === "object" && s.in);

    assert.ok(statusFilters.length > 0, "open queries should filter by explicit status list");
    for (const s of statusFilters) {
      assert.deepStrictEqual(
        [...s.in].sort(),
        ["IN_PROGRESS", "TODO"],
        "open work must exclude COMPLETED and CANCELLED"
      );
      assert.ok(!s.in.includes("CANCELLED"), "cancelled tasks are not open work");
    }
  }
  console.log("ok  cancelled tasks excluded from open / due / overdue counts");

  console.log("\nAll dashboard AI assistant checks passed.");
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
