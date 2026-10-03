const { buildDateTimePrompt } = require("../../utils/dateTime.js");
const { APP_HELP } = require("./appHelp.js");

const HUMAN_READABLE = {
  workStyle: {
    LONG_FOCUSED_SESSIONS: "long focused sessions",
    SHORT_FOCUSED_SESSIONS: "short focused sessions",
    FLEXIBLE: "flexible",
    VARIED: "varied",
  },
  planningStyle: {
    DAILY: "daily planning",
    WEEKLY: "weekly planning",
    MONTHLY: "monthly planning",
    MINIMALIST: "minimalist planning",
    DETAILED: "detailed planning",
  },
  preferredTaskOrganization: {
    BY_PRIORITY: "by priority",
    BY_PROJECT: "by project",
    BY_DEADLINE: "by deadline",
    BY_ENERGY: "by energy level",
  },
  mostProductiveTime: {
    MORNING: "morning",
    AFTERNOON: "afternoon",
    EVENING: "evening",
    NIGHT: "night",
    VARIES: "varies",
  },
  breakPreference: {
    FREQUENT_SHORT_BREAKS: "frequent short breaks",
    LONG_BREAKS: "long breaks",
    NO_BREAKS: "no breaks",
  },
  reminderPreference: {
    NONE: "no reminders",
    MINIMAL: "minimal reminders",
    MODERATE: "moderate reminders",
    FREQUENT: "frequent reminders",
  },
  difficultyStartingTasks: {
    NONE: "no",
    LOW: "low",
    MODERATE: "moderate",
    HIGH: "high",
  },
  difficultyFinishingTasks: {
    NONE: "no",
    LOW: "low",
    MODERATE: "moderate",
    HIGH: "high",
  },
  preferredTaskDetailLevel: {
    HIGH_LEVEL: "high-level overview",
    MEDIUM: "medium detail",
    GRANULAR: "granular detail",
  },
  preferredAIResponseStyle: {
    CONCISE: "concise",
    DETAILED: "detailed",
    FRIENDLY: "friendly",
    DIRECT: "direct",
  },
};

class AIContextBuilder {
  humanize(profileContext) {
    if (!profileContext) return null;

    const out = { ...profileContext };

    for (const [key, map] of Object.entries(HUMAN_READABLE)) {
      if (out[key]) out[key] = map[out[key]] || out[key];
    }

    return out;
  }

  buildSystemPrompt({ profileContext, timezone }) {
    const human = this.humanize(profileContext);

    const lines = [
      "You are a personal productivity assistant inside a personal task manager.",
      "You give clear, practical, personalized recommendations and planning help.",
      "You only make suggestions. You must never claim to have created, updated, or deleted tasks, projects, notes, or any data. The user applies your suggestions themselves.",
    ];

    if (human) {
      const style = human.preferredAIResponseStyle
        ? ` Preferred response style: ${human.preferredAIResponseStyle}.`
        : "";

      const greeting = human.displayName
        ? `\nThe user's name is ${human.displayName}. Address them by this name in replies (e.g. "Hello ${human.displayName}!").`
        : "";

      lines.push(`The user's profile: ${JSON.stringify(human)}.${style}${greeting}`);
    }

    // Built fresh on every request from the system clock, so it is never stale
    // and never persisted into a stored prompt.
    const { prompt, context } = buildDateTimePrompt(timezone);
    lines.push(prompt);

    // Keeps the model honest about this specific app. Without these rules it
    // will happily invent a "Settings > Security" page that does not exist.
    lines.push(
      [
        "How this app works (authoritative reference — follow it exactly):",
        APP_HELP,
        "",
        "Rules for questions about the app itself:",
        "- When the user asks how to do something in Taskora, answer using ONLY the steps in the reference above.",
        "- Quote the concrete steps and name the page they live on. Do not guess at menu names, page names, or settings that are not listed.",
        "- If the reference does not cover what they asked, say so plainly and point them to the closest related page instead of inventing instructions.",
        "- If the reference contradicts what the user believes, the reference is correct. Correct them gently and give the real steps.",
      ].join("\n")
    );

    // This is a planning assistant, not a coding assistant. Left to itself the
    // model answers "how do I build X" by pasting a 200-line file, which is
    // useless to someone who wanted to know what to learn first — and it burns
    // the response budget that the workspace context above just filled.
    lines.push(
      [
        "How to answer questions about code, tools and building things:",
        "- The user usually wants to understand or plan something, not receive a finished implementation. Lead with a short ordered plan of what to learn or do, naming the concepts, the tools, and the order to do them in.",
        "- Do not paste full files, complete classes, long scripts, or multi-package setups. Never write more than a few lines of code at a time.",
        "- A short snippet is fine when it makes one idea concrete. Keep it minimal, say in one line what it demonstrates, and explain it in plain words.",
        "- If a request genuinely needs a long program, describe what it would take in plain steps and ask before writing anything long.",
        "- Do not invent libraries, functions, commands or settings that do not exist. If you are not sure something is real, say so instead of guessing.",
      ].join("\n")
    );

    return { prompt: lines.join("\n"), dateTimeContext: context };
  }

  buildChatUserContent({ request, taskContext, projectNames, workspaceSummary }) {
    const parts = [];

    // Counts and goals/habits/notes summaries come first: "how many goals do I
    // have" is unanswerable without them, and the model has no other way to
    // learn them.
    if (workspaceSummary) parts.push(workspaceSummary);

    if (taskContext) parts.push(`Current relevant tasks:\n${taskContext}`);

    if (projectNames && projectNames.length > 0) {
      parts.push(`Active projects: ${projectNames.join(", ")}`);
    }

    parts.push(`User request: ${request}`);

    return parts.join("\n\n");
  }

  /**
   * Aggregate view of the user's workspace, so count questions and
   * "what's due today" are answerable without restating anything.
   */
  buildWorkspaceSummary(snapshot) {
    if (!snapshot) return null;

    const lines = ["Workspace snapshot (live counts from the user's account):"];

    // Totals come first: "how many tasks do I have" means everything ever
    // created. Leading with "0 open" alone makes a used account look empty.
    lines.push(
      `Tasks: ${snapshot.totalTasks} in total — ${snapshot.openTasks} still open (${snapshot.inProgress} in progress), ${snapshot.completedTotal} completed all-time, ${snapshot.dueToday} due today, ${snapshot.overdue} overdue, ${snapshot.completedToday} completed today.`
    );

    if (snapshot.totalTasks === 0) {
      lines.push(
        "The user has no tasks at all yet. If they ask how many tasks they have, the answer is zero — say so plainly and offer to help them add their first one rather than implying anything is missing."
      );
    }

    if (snapshot.dueTodayList?.length) {
      lines.push(`Due today: ${snapshot.dueTodayList.join("; ")}`);
    }

    if (snapshot.overdueList?.length) {
      lines.push(`Overdue: ${snapshot.overdueList.join("; ")}`);
    }

    lines.push(
      `Goals: ${snapshot.goalTotal} total, ${snapshot.goalsActive} still active.`
    );

    if (snapshot.goalTitles?.length) {
      lines.push(`Goal titles: ${snapshot.goalTitles.join("; ")}`);
    }

    lines.push(
      `Habits: ${snapshot.habitTotal} tracked. Notes: ${snapshot.noteTotal} saved. Projects: ${snapshot.projectTotal}.`
    );

    if (snapshot.habitTitles?.length) {
      lines.push(`Habit titles: ${snapshot.habitTitles.join("; ")}`);
    }

    if (snapshot.upcomingList?.length) {
      lines.push(`Next deadlines after today: ${snapshot.upcomingList.join("; ")}`);
    }

    return lines.join("\n");
  }

  buildTaskListForAi(tasks) {
    if (!tasks || tasks.length === 0) return null;

    return tasks
      .map((task) => {
        const bits = [`- ${task.title}`];

        if (task.status) bits.push(`status: ${task.status}`);
        if (task.priority) bits.push(`priority: ${task.priority}`);
        if (task.dueDate) {
          bits.push(`due: ${new Date(task.dueDate).toISOString().slice(0, 10)}`);
        }
        if (task.estimatedMinutes) bits.push(`~${task.estimatedMinutes} min`);
        if (task.subtasks && task.subtasks.length > 0) {
          const done = task.subtasks.filter((s) => s.completed).length;
          bits.push(`subtasks: ${done}/${task.subtasks.length}`);
        }
        if (task.project?.name) bits.push(`project: ${task.project.name}`);

        return bits.join(" ");
      })
      .join("\n");
  }
}

module.exports = AIContextBuilder;