const AppError = require("../../utils/AppError.js");
const { parseSchema, definedOnly } = require("../../utils/validate.js");
const { getPagination, buildMeta } = require("../../utils/pagination.js");
const {
  createHabitSchema,
  updateHabitSchema,
} = require("../../validators/user/habitValidators.js");

function localDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date, offset) {
  const parsed = new Date(`${date}T00:00:00`);
  parsed.setDate(parsed.getDate() + offset);
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function calculateStreak(dates, today) {
  const set = new Set(dates);
  let streak = 0;
  let cursor = set.has(today) ? today : addDays(today, -1);

  while (set.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return streak;
}

function withStatus(habit, completions, today) {
  const dates = completions.map((completion) => completion.date);
  return {
    ...habit,
    doneToday: dates.includes(today),
    streak: calculateStreak(dates, today),
  };
}

class HabitService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async list(userId, query = {}) {
    const { page, limit, skip, take } = getPagination(query);
    const where = { userId };

    const [items, total] = await Promise.all([
      this.prisma.habit.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        include: { completions: { select: { date: true } } },
      }),
      this.prisma.habit.count({ where }),
    ]);

    const today = localDateString();
    const habits = items.map((habit) =>
      withStatus(habit, habit.completions, today)
    );

    return { items: habits, pagination: buildMeta(page, limit, total) };
  }

  async get(userId, id) {
    const habit = await this.prisma.habit.findFirst({
      where: { id, userId },
      include: { completions: { select: { date: true } } },
    });

    if (!habit) {
      throw new AppError("Habit not found", 404);
    }

    return withStatus(habit, habit.completions, localDateString());
  }

  async create(userId, data) {
    const parsed = parseSchema(createHabitSchema, data);

    const habit = await this.prisma.habit.create({
      data: { userId, ...parsed },
    });

    return { ...habit, doneToday: false, streak: 0 };
  }

  async update(userId, id, data) {
    await this.get(userId, id);

    const parsed = parseSchema(updateHabitSchema, data);

    const habit = await this.prisma.habit.update({
      where: { id },
      data: definedOnly(parsed),
      include: { completions: { select: { date: true } } },
    });

    return withStatus(habit, habit.completions, localDateString());
  }

  async remove(userId, id) {
    await this.get(userId, id);

    await this.prisma.habit.delete({ where: { id } });
  }

  async toggle(userId, id) {
    const habit = await this.prisma.habit.findFirst({
      where: { id, userId },
      include: { completions: { select: { date: true } } },
    });

    if (!habit) {
      throw new AppError("Habit not found", 404);
    }

    const today = localDateString();
    const completedToday = habit.completions.some(
      (completion) => completion.date === today
    );

    if (completedToday) {
      await this.prisma.habitCompletion.deleteMany({
        where: { habitId: id, date: today },
      });
    } else {
      await this.prisma.habitCompletion.create({
        data: { habitId: id, date: today },
      });
    }

    const completions = await this.prisma.habitCompletion.findMany({
      where: { habitId: id },
      select: { date: true },
    });

    const dates = completions.map((completion) => completion.date);
    const streak = calculateStreak(dates, today);

    const updated = await this.prisma.habit.update({
      where: { id },
      data: { streak },
    });

    return {
      ...updated,
      doneToday: !completedToday,
      streak,
    };
  }
}

module.exports = HabitService;