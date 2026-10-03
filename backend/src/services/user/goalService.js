const AppError = require("../../utils/AppError.js");
const { parseSchema, definedOnly } = require("../../utils/validate.js");
const { getPagination, buildMeta } = require("../../utils/pagination.js");
const { createGoalSchema, updateGoalSchema } = require("../../validators/user/goalValidators.js");

// Where a goal lands when it is un-completed without an explicit progress.
// See withConsistentProgress below.
const REOPENED_PROGRESS = 90;

class GoalService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async list(userId, query = {}) {
    const { page, limit, skip, take } = getPagination(query);
    const where = { userId };

    if (query.status) where.status = query.status;

    const [items, total] = await Promise.all([
      this.prisma.goal.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      this.prisma.goal.count({ where }),
    ]);

    return { items, pagination: buildMeta(page, limit, total) };
  }

  async get(userId, id) {
    const goal = await this.prisma.goal.findFirst({
      where: { id, userId },
    });

    if (!goal) {
      throw new AppError("Goal not found", 404);
    }

    return goal;
  }

  async create(userId, data) {
    const parsed = parseSchema(createGoalSchema, data);

    return this.prisma.goal.create({
      data: { userId, ...this.withConsistentProgress(parsed) },
    });
  }

  async update(userId, id, data) {
    const existing = await this.get(userId, id);

    const parsed = parseSchema(updateGoalSchema, data);

    return this.prisma.goal.update({
      where: { id },
      data: this.withConsistentProgress(parsed, existing),
    });
  }

  /**
   * Keeps `status` and `progress` from contradicting each other, so a goal can
   * never render as "complete" at 40% or sit at 100% while still active.
   *
   * The two fields are separate columns, so this is the one place the rule is
   * enforced; every caller (card toggle, progress modal, direct API) inherits
   * it instead of each re-implementing it.
   *
   * Completion wins over an explicit progress, because a completed goal showing
   * a partial bar is the confusing state. Un-completing has no honest value to
   * restore, since the real number was overwritten with 100, so it falls back
   * to REOPENED_PROGRESS — visibly "nearly done" rather than pretending the
   * work never happened. Passing progress explicitly overrides both.
   */
  withConsistentProgress(data, existing = null) {
    const patch = definedOnly({ ...data });

    if (patch.status === "COMPLETED") {
      patch.progress = 100;
      return patch;
    }

    const reopening =
      existing?.status === "COMPLETED" &&
      (patch.status === "ACTIVE" || patch.status === "ARCHIVED");

    if (reopening && patch.progress === undefined) {
      patch.progress = REOPENED_PROGRESS;
    }

    return patch;
  }

  async remove(userId, id) {
    await this.get(userId, id);

    await this.prisma.goal.delete({ where: { id } });
  }
}

module.exports = GoalService;