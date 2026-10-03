const { buildDateTimeContext, dayRangeUtc, resolveTimeZone } = require("../../utils/dateTime.js");

/**
 * Live aggregate view of one user's workspace.
 *
 * Serves two callers that must agree with each other: the chat prompt (so the
 * model can answer "how many goals do I have") and the dashboard endpoint (so the
 * card's numbers match what the assistant says). Building it once here is what
 * keeps those from drifting apart.
 *
 * Every date boundary is computed in the user's own timezone. A UTC server would
 * otherwise call a task "due tomorrow" when the user's clock says it is due
 * today, which is exactly the class of bug that makes an assistant feel broken.
 */
class WorkspaceSnapshotService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async getTimeZone(userId) {
    const settings = await this.prisma.userSettings.findUnique({
      where: { userId },
      select: { timezone: true },
    });

    return resolveTimeZone(settings?.timezone || process.env.APP_TIMEZONE);
  }

  async build(userId) {
    const timeZone = await this.getTimeZone(userId);
    const { date: today, weekday } = buildDateTimeContext({ timeZone });
    const { start, end } = dayRangeUtc(today, timeZone);

    // CANCELLED is a real TaskStatus, so "not COMPLETED" would sweep cancelled
    // work into the open/due/overdue counts. Only genuinely active work counts.
    const openWhere = {
      userId,
      status: { in: ["TODO", "IN_PROGRESS"] },
    };

    const [
      openTasks,
      dueTodayTasks,
      overdueTasks,
      completedToday,
      goals,
      habits,
      noteCount,
      projectCount,
    ] = await Promise.all([
      this.prisma.task.count({ where: openWhere }),
      this.prisma.task.findMany({
        where: { ...openWhere, dueDate: { gte: start, lt: end } },
        orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
        take: 15,
        select: { id: true, title: true, dueDate: true, priority: true, estimatedMinutes: true },
      }),
      this.prisma.task.findMany({
        where: { ...openWhere, dueDate: { lt: start } },
        orderBy: { dueDate: "asc" },
        take: 15,
        select: { id: true, title: true, dueDate: true, priority: true },
      }),
      this.prisma.task.count({
        where: {
          userId,
          status: "COMPLETED",
          completedAt: { gte: start, lt: end },
        },
      }),
      this.prisma.goal.findMany({
        where: { userId },
        select: { id: true, title: true, status: true, progress: true, targetDate: true },
      }),
      this.prisma.habit.findMany({
        where: { userId },
        // Habit has `name`, not `title`, and no isActive flag.
        select: { id: true, name: true, frequency: true, streak: true },
      }),
      this.prisma.note.count({ where: { userId } }),
      this.prisma.project.count({ where: { userId } }),
    ]);

    const inProgress = await this.prisma.task.count({
      where: { ...openWhere, status: "IN_PROGRESS" },
    });

    // "How many tasks do I have?" is about everything ever created, not just
    // what is still open. Without these the assistant can only say "0 open" and
    // reads as though the account is empty when it has completed history.
    const [totalTasks, completedTotal] = await Promise.all([
      this.prisma.task.count({ where: { userId } }),
      this.prisma.task.count({ where: { userId, status: "COMPLETED" } }),
    ]);

    // Anything due after today, for "what's next" questions.
    const upcoming = await this.prisma.task.findMany({
      where: { ...openWhere, dueDate: { gte: end, not: null } },
      orderBy: { dueDate: "asc" },
      take: 10,
      select: { id: true, title: true, dueDate: true },
    });

    // GoalStatus is ACTIVE | COMPLETED | ARCHIVED.
    const goalsActive = goals.filter((goal) => goal.status === "ACTIVE");
    // Habit has no active/inactive flag, so every tracked habit counts.
    const habitsActive = habits;

    return {
      timeZone,
      today,
      weekday,

      openTasks,
      inProgress,
      dueToday: dueTodayTasks.length,
      overdue: overdueTasks.length,
      completedToday,
      totalTasks,
      completedTotal,

      goalTotal: goals.length,
      goalsActive: goalsActive.length,
      goalTitles: goalsActive.slice(0, 10).map((goal) => goal.title),

      habitTotal: habits.length,
      habitsActive: habitsActive.length,
      habitTitles: habitsActive.slice(0, 10).map((habit) => habit.name),

      noteTotal: noteCount,
      projectTotal: projectCount,

      dueTodayList: dueTodayTasks,
      overdueList: overdueTasks,
      upcomingList: upcoming,
      goals,
    };
  }

  /**
   * Headline sentence for the card. Derived entirely from live counts, so it can
   * never claim "0 tasks due today" when the user has some.
   */
  buildSummary(snapshot) {
    const { dueToday, overdue, openTasks, completedToday, totalTasks, completedTotal: done } = snapshot;

    if (totalTasks === 0) {
      return "You haven't added any tasks yet. Want help setting up your first one?";
    }

    if (openTasks === 0) {
      const finishedToday = completedToday > 0 ? ` ${completedToday} finished today.` : "";
      return `Nothing open — all ${done} of your ${totalTasks} task${totalTasks === 1 ? "" : "s"} ${totalTasks === 1 ? "is" : "are"} done.${finishedToday} Want to plan what's next?`;
    }

    if (overdue > 0) {
      const overduePart = `${overdue} overdue task${overdue === 1 ? "" : "s"}`;
      const duePart = dueToday > 0 ? ` and ${dueToday} due today` : "";
      return `You have ${overduePart}${duePart}. Want me to help you clear the backlog?`;
    }

    if (dueToday > 0) {
      return `I found ${dueToday} task${dueToday === 1 ? "" : "s"} due today. Want me to suggest a plan?`;
    }

    return `Nothing due today, but you have ${openTasks} open task${openTasks === 1 ? "" : "s"}. Want a plan for the rest of the week?`;
  }

  /**
   * Actionable next step chosen from real data. Deliberately deterministic
   * rather than model-generated: it renders instantly, costs nothing, and cannot
   * hallucinate a task that does not exist.
   */
  buildSuggestion(snapshot) {
    const { overdueList, dueTodayList, upcomingList, goalTitles, openTasks } = snapshot;

    if (overdueList.length > 0) {
      const worst = overdueList[0];
      return `Start with "${worst.title}" — it is already overdue, so clearing it removes the most pressure.`;
    }

    if (dueTodayList.length > 0) {
      const quickest = dueTodayList.reduce((best, task) => {
        const bestMins = best.estimatedMinutes ?? Number.MAX_SAFE_INTEGER;
        const taskMins = task.estimatedMinutes ?? Number.MAX_SAFE_INTEGER;
        return taskMins < bestMins ? task : best;
      }, dueTodayList[0]);

      if (quickest.estimatedMinutes) {
        return `Start with "${quickest.title}" — it is only about ${quickest.estimatedMinutes} min. Knock it out, then move to the bigger work.`;
      }

      return `Start with "${quickest.title}", then work through the rest of today's list.`;
    }

    // No open tasks at all: report that plainly rather than steering them
    // towards a goal, which would read as though there were work to do.
    if (openTasks === 0) {
      return goalTitles.length > 0
        ? `Inbox zero — no open tasks. You could use the time to push on your goal "${goalTitles[0]}".`
        : "Inbox zero. Consider setting a goal or a habit to build momentum.";
    }

    if (upcomingList.length > 0) {
      return `Nothing due today. Use the time to get ahead on "${upcomingList[0].title}", which is your next deadline.`;
    }

    if (goalTitles.length > 0) {
      return `No tasks due. Good day to push on your goal "${goalTitles[0]}".`;
    }

    return "No deadlines coming up. Good moment to review your open tasks and clear anything stale.";
  }

  /**
   * Compact text form for the AI prompt. Note this includes counts and titles
   * only — note bodies are deliberately excluded so private note text is not
   * pulled into every single request.
   */
  buildPromptSummary(snapshot) {
    return this.contextSummary(snapshot);
  }

  contextSummary(snapshot) {
    return {
      openTasks: snapshot.openTasks,
      totalTasks: snapshot.totalTasks,
      completedTotal: snapshot.completedTotal,
      dueToday: snapshot.dueToday,
      overdue: snapshot.overdue,
      inProgress: snapshot.inProgress,
      completedToday: snapshot.completedToday,
      goalTotal: snapshot.goalTotal,
      goalsActive: snapshot.goalsActive,
      goalTitles: snapshot.goalTitles,
      habitTotal: snapshot.habitTotal,
      habitTitles: snapshot.habitTitles,
      noteTotal: snapshot.noteTotal,
      projectTotal: snapshot.projectTotal,
      dueTodayList: snapshot.dueTodayList.map((task) => this.describeTask(task, snapshot)),
      overdueList: snapshot.overdueList.map((task) => this.describeTask(task, snapshot)),
      upcomingList: snapshot.upcomingList.map((task) => this.describeTask(task, snapshot)),
    };
  }

  describeTask(task, snapshot) {
    const bits = [task.title];
    if (task.priority) bits.push(task.priority.toLowerCase());
    if (task.estimatedMinutes) bits.push(`~${task.estimatedMinutes} min`);

    if (task.dueDate) {
      const due = buildDateTimeContext({ timeZone: snapshot.timeZone, now: task.dueDate });
      bits.push(`due ${due.date}`);
    }

    return bits.join(", ");
  }
}

module.exports = WorkspaceSnapshotService;
