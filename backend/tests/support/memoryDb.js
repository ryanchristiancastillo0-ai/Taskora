"use strict";

/**
 * An in-memory stand-in for the Prisma client.
 *
 * WHY THIS EXISTS
 * The alternative was to let Jest talk to Postgres, and the rules for this
 * project are that no test may ever touch the development database. So the
 * client is replaced wholesale (see tests/jest/setup/mocks.js) rather than
 * pointed at another database: nothing in this file opens a socket, so there is
 * no configuration in which a test can write to `taskora` by accident.
 *
 * WHAT IT IS
 * A partial implementation of the Prisma query API, covering the operations and
 * the filter operators that the Taskora services actually call: findUnique,
 * findFirst, findMany, create, update, updateMany, delete, deleteMany, count,
 * upsert and $transaction, with select/include shaping, relation filters,
 * skip/take and orderBy.
 *
 * WHAT IT IS NOT
 * It is a test double, not a database:
 *
 *   - No unique-constraint enforcement. Services check before writing (see
 *     AuthService.register), so a duplicate email is caught by the code under
 *     test rather than by the store, which is the behaviour worth testing.
 *   - No SQL, so nothing here proves the schema, the migrations or the indexes
 *     are right. Those stay a manual concern.
 *   - $transaction is not isolated or rolled back. It runs the callback and
 *     resolves. Enough for AdminService.updateUser, not a substitute for a real
 *     transaction test.
 *   - `contains` is case-insensitive, matching the MySQL collation the schema
 *     targets, not PostgreSQL's default.
 *
 * Unknown models get an empty table on first use so that adding a test for a
 * not-yet-modelled endpoint degrades to "no rows" instead of a crash.
 */

const crypto = require("crypto");

// Schema defaults, copied from prisma/schema.prisma. Keeping them here means a
// row created through the API looks to the service exactly like a row the
// database would have produced.
const MODEL_DEFAULTS = {
  // googleId: null mirrors the schema's nullable Google link. Without it, a user
  // row created by a test would simply lack the key, and GoogleAuthService's
  // "already linked?" lookup would compare against `undefined` instead of the
  // NULL a real database returns.
  user: { role: "USER", status: "ACTIVE", googleId: null },
  personalizationProfile: {
    aiProvider: "GEMINI",
    onboardingCompleted: false,
    onboardingStarted: false,
    onboardingSkipped: false,
  },
  task: { status: "TODO", priority: "MEDIUM" },
  auditLog: {},
  notification: {},
  project: { status: "ACTIVE", color: "#4D3EC8" },
  friendRequest: { status: "PENDING" },
  friendship: {},
  conversationMember: {},
};

/**
 * Relations the suite needs to traverse.
 *
 * `fk` is the foreign key column on the CHILD table, which is how every one of
 * these is stored in the real schema. `list` marks a one-to-many side.
 */
const RELATIONS = {
  user: {
    personalizationProfile: { model: "personalizationProfile", fk: "userId", list: false },
    notificationSettings: { model: "notificationSettings", fk: "userId", list: false },
    adminProfile: { model: "adminProfile", fk: "userId", list: false },
    auditLogs: { model: "auditLog", fk: "userId", list: true },
    refreshTokens: { model: "refreshToken", fk: "userId", list: true },
    passwordResetCodes: { model: "passwordResetCode", fk: "userId", list: true },
    tasks: { model: "task", fk: "userId", list: true },
    projects: { model: "project", fk: "userId", list: true },
    notes: { model: "note", fk: "userId", list: true },
    goals: { model: "goal", fk: "userId", list: true },
    habits: { model: "habit", fk: "userId", list: true },
    tags: { model: "tag", fk: "userId", list: true },
  },
  task: {
    user: { model: "user", fk: "userId", list: false },
    project: { model: "project", fk: "projectId", list: false },
    subtasks: { model: "subtask", fk: "taskId", list: true },
    attachments: { model: "taskAttachment", fk: "taskId", list: true },
    tags: { model: "taskTag", fk: "taskId", list: true },
    notifications: { model: "notification", fk: "taskId", list: true },
  },
  taskTag: {
    task: { model: "task", fk: "taskId", list: false },
    tag: { model: "tag", fk: "tagId", list: false },
  },
  auditLog: {
    user: { model: "user", fk: "userId", list: false },
  },
  notification: {
    task: { model: "task", fk: "taskId", list: false },
    user: { model: "user", fk: "userId", list: false },
  },
  project: {
    user: { model: "user", fk: "userId", list: false },
    tasks: { model: "task", fk: "projectId", list: true },
  },
  subtask: { task: { model: "task", fk: "taskId", list: false } },
  refreshToken: { user: { model: "user", fk: "userId", list: false } },
  passwordResetCode: { user: { model: "user", fk: "userId", list: false } },
  personalizationProfile: { user: { model: "user", fk: "userId", list: false } },
  notificationSettings: { user: { model: "user", fk: "userId", list: false } },
  adminProfile: { user: { model: "user", fk: "userId", list: false } },
  tag: { user: { model: "user", fk: "userId", list: false } },
};

const TIMESTAMPED = new Set(["createdAt", "updatedAt"]);

function newId(model) {
  return `${model.slice(0, 3)}_${crypto.randomBytes(12).toString("hex")}`;
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDate(value) {
  return value instanceof Date;
}

function compareValues(a, b) {
  if (isDate(a) && isDate(b)) return a.getTime() - b.getTime();
  if (typeof a === "string" && typeof b === "string") {
    // Case-insensitive, like the MySQL collation this schema is written for.
    return a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0;
  }
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  return a < b ? -1 : 1;
}

/** One scalar field against one Prisma filter. */
function matchField(value, condition) {
  if (condition === null) return value === null || value === undefined;
  if (!isPlainObject(condition)) return compareValues(value, condition) === 0;

  if ("equals" in condition) return matchField(value, condition.equals);
  if ("not" in condition) return !matchField(value, condition.not);
  if ("in" in condition) return condition.in.some((entry) => matchField(value, entry));
  if ("notIn" in condition) return !condition.notIn.some((entry) => matchField(value, entry));
  if ("contains" in condition) {
    const needle = String(condition.contains).toLowerCase();
    return String(value ?? "").toLowerCase().includes(needle);
  }
  if ("startsWith" in condition) {
    return String(value ?? "").toLowerCase().startsWith(String(condition.startsWith).toLowerCase());
  }
  if ("endsWith" in condition) {
    return String(value ?? "").toLowerCase().endsWith(String(condition.endsWith).toLowerCase());
  }
  if ("gte" in condition) return compareValues(value, condition.gte) >= 0;
  if ("gt" in condition) return compareValues(value, condition.gt) > 0;
  if ("lte" in condition) return compareValues(value, condition.lte) <= 0;
  if ("lt" in condition) return compareValues(value, condition.lt) < 0;

  throw new Error(`[memoryDb] unsupported filter on a scalar: ${JSON.stringify(condition)}`);
}

function isRelation(model, key) {
  return Boolean(RELATIONS[model] && RELATIONS[model][key]);
}

class MemoryDb {
  constructor() {
    this.tables = Object.create(null);
  }

  // ---------------------------------------------------------------- lifecycle

  /** Empties every table. Called from globalSetup/beforeEach so files are independent. */
  reset() {
    this.tables = Object.create(null);
  }

  table(model) {
    if (!this.tables[model]) this.tables[model] = [];
    return this.tables[model];
  }

  /** Insert a row without going through a delegate. For test fixtures only. */
  seed(model, data = {}) {
    return this.insertRow(model, data);
  }

  /** Raw rows, unprojected. For assertions. */
  rows(model) {
    return this.table(model);
  }

  findRow(model, id) {
    return this.table(model).find((row) => row.id === id) ?? null;
  }

  // ------------------------------------------------------------- filter / where

  matches(row, where, model) {
    if (!where) return true;

    for (const [key, condition] of Object.entries(where)) {
      if (key === "AND") {
        if (!condition.every((entry) => this.matches(row, entry, model))) return false;
        continue;
      }
      if (key === "OR") {
        if (!condition.some((entry) => this.matches(row, entry, model))) return false;
        continue;
      }
      if (key === "NOT") {
        if (condition.some((entry) => this.matches(row, entry, model))) return false;
        continue;
      }

      if (isRelation(model, key)) {
        if (!this.matchRelation(row, key, condition, model)) return false;
        continue;
      }

      if (!matchField(row[key], condition)) return false;
    }

    return true;
  }

  matchRelation(row, key, condition, model) {
    const relation = RELATIONS[model][key];
    const related = this.table(relation.model).filter((entry) => entry[relation.fk] === row.id);
    const first = related[0] ?? null;

    if (condition === null) return related.length === 0;
    if (!isPlainObject(condition)) throw new Error(`[memoryDb] unsupported relation filter: ${key}`);

    if ("is" in condition) {
      if (condition.is === null) return first === null;
      return first !== null && this.matches(first, condition.is, relation.model);
    }
    if ("isNot" in condition) {
      if (condition.isNot === null) return first !== null;
      return first === null || !this.matches(first, condition.isNot, relation.model);
    }
    if ("some" in condition) {
      return related.some((entry) => this.matches(entry, condition.some, relation.model));
    }
    if ("every" in condition) {
      return related.every((entry) => this.matches(entry, condition.every, relation.model));
    }
    if ("none" in condition) {
      return !related.some((entry) => this.matches(entry, condition.none, relation.model));
    }

    // A nested relation filter written without an `is` wrapper, e.g.
    // `{ conversation: { user: { personalizationProfile: { is: { ... } } } } }`.
    // Prisma reads a bare object of relation keys as "the related row must match
    // all of these", which is the same as an implicit `is`.
    if (Object.keys(condition).some((key) => isRelation(relation.model, key))) {
      return first !== null && this.matches(first, condition, relation.model);
    }

    throw new Error(`[memoryDb] unsupported relation filter: ${key}`);
  }

  // ------------------------------------------------------------------ ordering

  sort(rows, orderBy, model) {
    if (!orderBy) return rows;
    const clauses = Array.isArray(orderBy) ? orderBy : [orderBy];

    return [...rows].sort((a, b) => {
      for (const clause of clauses) {
        for (const [key, direction] of Object.entries(clause)) {
          if (isPlainObject(direction) && direction._count) {
            const left = this.relationRows(a, key, model).length;
            const right = this.relationRows(b, key, model).length;
            if (left !== right) return direction._count === "desc" ? right - left : left - right;
            continue;
          }
          const result = compareValues(a[key], b[key]);
          if (result !== 0) return direction === "desc" ? -result : result;
        }
      }
      return 0;
    });
  }

  relationRows(row, key, model) {
    const relation = RELATIONS[model]?.[key];
    if (!relation) return [];

    // The two directions are stored differently, so they have to be resolved
    // differently. To-many: the children hold the foreign key, so look for rows
    // whose fk points back at this row. To-one: the foreign key is on this row,
    // so look for the single row it names.
    if (relation.list) {
      return this.table(relation.model).filter((entry) => entry[relation.fk] === row.id);
    }
    return this.table(relation.model).filter((entry) => entry.id === row[relation.fk]);
  }

  // ------------------------------------------------------------------- shaping

  /** Applies select / include / _count, the way the Prisma client shapes rows. */
  project(model, row, args = {}) {
    const select = args.select;
    const include = args.include;
    const out = {};

    // Every scalar column the store knows about for this model. Relation names
    // are excluded: those are resolved separately, and a foreign key such as
    // userId stays a scalar here, exactly as it is in Prisma.
    const scalarKeys = () => {
      const keys = new Set(Object.keys(MODEL_DEFAULTS[model] ?? {}));
      for (const entry of this.table(model)) {
        for (const key of Object.keys(entry)) keys.add(key);
      }
      return [...keys].filter((key) => !isRelation(model, key));
    };

    if (select) {
      for (const [key, flag] of Object.entries(select)) {
        if (key === "_count") continue;
        if (isRelation(model, key)) {
          if (flag) out[key] = this.shapeRelation(model, row, key, flag);
        } else {
          out[key] = row[key];
        }
      }
    } else {
      for (const key of scalarKeys()) out[key] = row[key];
    }

    const includes = { ...(select ?? {}), ...(include ?? {}) };

    for (const [key, flag] of Object.entries(includes)) {
      if (key === "_count") continue;
      if (!isRelation(model, key) || !flag) continue;
      if (out[key] === undefined) out[key] = this.shapeRelation(model, row, key, flag);
    }

    const countSpec = select?._count ?? include?._count;
    if (countSpec) {
      const counts = {};
      for (const key of Object.keys(countSpec.select ?? {})) {
        counts[key] = this.relationRows(row, key, model).length;
      }
      out._count = counts;
    }

    return out;
  }

  shapeRelation(model, row, key, spec) {
    const relation = RELATIONS[model][key];
    const related = this.relationRows(row, key, model);
    const list = relation.list ? related : related.slice(0, 1);
    const ordered = this.sort(list, spec.orderBy, relation.model);

    const limited = spec.take !== undefined ? ordered.slice(0, spec.take) : ordered;

    if (relation.list) {
      return limited.map((entry) => this.project(relation.model, entry, spec));
    }
    return limited[0] ? this.project(relation.model, limited[0], spec) : null;
  }

  // ------------------------------------------------------------------- writing

  insertRow(model, data) {
    const row = { id: newId(model), ...(MODEL_DEFAULTS[model] ?? {}) };
    this.applyData(model, row, data);
    // Every Taskora model carries createdAt (most also carry updatedAt), so the
    // store fills both in rather than transcribing twenty schema defaults. No
    // query in the suite reads updatedAt; tests that care about time set the
    // value explicitly.
    row.createdAt = row.createdAt ?? new Date();
    row.updatedAt = row.updatedAt ?? new Date();
    this.table(model).push(row);
    return row;
  }

  applyData(model, row, data = {}) {
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue;

      if (!isRelation(model, key)) {
        row[key] = value;
        continue;
      }

      const relation = RELATIONS[model][key];

      // Nested writes are limited to what Taskora actually issues: join rows are
      // created with `connect`, and a task's tag list is replaced wholesale.
      if (isPlainObject(value) && value.connect) {
        row[relation.fk] = typeof value.connect === "object" ? value.connect.id : value.connect;
        continue;
      }
      if (isPlainObject(value) && Array.isArray(value.create)) {
        for (const childData of value.create) {
          this.insertRow(relation.model, { [relation.fk]: row.id, ...childData });
        }
        continue;
      }
      if (isPlainObject(value) && isPlainObject(value.create)) {
        this.insertRow(relation.model, { [relation.fk]: row.id, ...value.create });
        continue;
      }
      if (isPlainObject(value) && value.deleteMany) {
        const doomed = this.table(relation.model).filter((entry) => entry[relation.fk] === row.id);
        for (const entry of doomed) {
          this.table(relation.model).splice(this.table(relation.model).indexOf(entry), 1);
        }
        continue;
      }
      if (isPlainObject(value) && isPlainObject(value.set)) {
        row[relation.fk] = value.set.id;
        continue;
      }
    }
  }

  findRowOrThrow(model, where) {
    const row = this.table(model).find((entry) => this.matches(entry, where, model)) ?? null;
    if (!row) {
      // Mirrors Prisma's P2025 shape closely enough for errorMiddleware, which
      // answers an unrecognised error with a generic 500.
      const error = new Error(
        `An operation failed because it depends on one or more records that were required but not found. Model: ${model}`
      );
      error.code = "P2025";
      throw error;
    }
    return row;
  }

  // ----------------------------------------------------------------- delegates

  delegate(model) {
    const db = this;

    return {
      async findUnique(args = {}) {
        const row = db.table(model).find((entry) => db.matches(entry, args.where, model)) ?? null;
        return row ? db.project(model, row, args) : null;
      },

      async findFirst(args = {}) {
        const rows = await this.findMany({ ...args, take: undefined, skip: undefined });
        return rows[0] ?? null;
      },

      async findMany(args = {}) {
        let rows = db.table(model).filter((entry) => db.matches(entry, args.where, model));
        rows = db.sort(rows, args.orderBy, model);
        if (args.skip) rows = rows.slice(args.skip);
        if (args.take !== undefined) rows = rows.slice(0, args.take);
        return rows.map((entry) => db.project(model, entry, args));
      },

      async create(args = {}) {
        const row = db.insertRow(model, args.data);
        return db.project(model, row, args);
      },

      async update(args = {}) {
        const row = db.findRowOrThrow(model, args.where);
        db.applyData(model, row, args.data);
        row.updatedAt = new Date();
        return db.project(model, row, args);
      },

      async updateMany(args = {}) {
        const rows = db.table(model).filter((entry) => db.matches(entry, args.where, model));
        for (const row of rows) {
          db.applyData(model, row, args.data);
          row.updatedAt = new Date();
        }
        return { count: rows.length };
      },

      async upsert(args = {}) {
        const row = db.table(model).find((entry) => db.matches(entry, args.where, model));
        if (row) {
          db.applyData(model, row, args.update);
          return db.project(model, row, args);
        }
        const created = db.insertRow(model, args.create);
        return db.project(model, created, args);
      },

      async delete(args = {}) {
        const row = db.findRowOrThrow(model, args.where);
        db.table(model).splice(db.table(model).indexOf(row), 1);
        return db.project(model, row, args);
      },

      async deleteMany(args = {}) {
        const doomed = db.table(model).filter((entry) => db.matches(entry, args.where, model));
        for (const row of doomed) {
          db.table(model).splice(db.table(model).indexOf(row), 1);
        }
        return { count: doomed.length };
      },

      async count(args = {}) {
        return db.table(model).filter((entry) => db.matches(entry, args.where, model)).length;
      },

      // Covers the one shape Taskora uses: `by: ["type"], _count: { _all: true }`,
      // which adminService.notifications reads as per-type volumes.
      async groupBy(args = {}) {
        const by = Array.isArray(args.by) ? args.by : [args.by];
        const grouped = new Map();

        for (const row of db.table(model)) {
          if (!db.matches(row, args.where, model)) continue;
          const key = by.map((field) => String(row[field])).join(" ");
          if (!grouped.has(key)) {
            const entry = {};
            for (const field of by) entry[field] = row[field];
            entry._count = { _all: 0 };
            grouped.set(key, entry);
          }
          grouped.get(key)._count._all += 1;
        }

        return [...grouped.values()].map((entry) => db.sort([entry], args.orderBy, model)[0]);
      },
    };
  }
}

const db = new MemoryDb();

const prisma = new Proxy(
  { $connect: async () => {}, $disconnect: async () => {} },
  {
    get(target, prop) {
      if (prop === "$transaction") {
        return async (arg) => {
          // Array form: real Prisma runs these atomically. Sequential await keeps
          // the ordering; rollback is not simulated (see the header).
          if (Array.isArray(arg)) {
            const results = [];
            for (const entry of arg) results.push(await entry);
            return results;
          }
          // Interactive form: the callback gets a client, not a snapshot.
          return arg(prisma);
        };
      }
      if (typeof prop !== "string" || prop in target) return target[prop];
      return db.delegate(prop);
    },
  }
);

module.exports = { db, prisma, MemoryDb, MODEL_DEFAULTS, RELATIONS };
