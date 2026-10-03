const fs = require("fs");
const AppError = require("../../utils/AppError.js");
const { parseSchema } = require("../../utils/validate.js");
const { getPagination, buildMeta } = require("../../utils/pagination.js");
const {
  createConversationSchema,
  sendMessageSchema,
  recommendSchema,
  updateConversationSchema,
} = require("../../validators/user/aiValidators.js");
const {
  AI_GENERATION_JOB,
} = require("../../queues/aiGenerationQueue.js");
const AIProviderFactory = require("./ai/aiProviderFactory.js");
const AIContextBuilder = require("./aiContextBuilder.js");

// How many prior messages are replayed to the provider so it "remembers"
// the conversation. Memory is the stored AIConversation + AIMessage rows.
const MAX_HISTORY_MESSAGES = 50;

// Floor between streamed `ai:delta` frames. The final text always arrives with
// the persisted `ai:message`, so dropping intermediate frames costs nothing.
const AI_DELTA_THROTTLE_MS = 60;

const QUEUE_ADD_TIMEOUT_MS = 3000;

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    if (timer.unref) {
      timer.unref();
    }
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

class AIService {
  constructor(prisma, personalizationService, options = {}) {
    this.prisma = prisma;
    this.personalizationService = personalizationService;
    this.queue = options.queue ?? null;
    this.realtimeService = options.realtimeService ?? null;
    this.fileService = options.fileService ?? null;
    this.workspaceSnapshotService = options.workspaceSnapshotService ?? null;
    this.contextBuilder = new AIContextBuilder();
    this.lastDeltaAt = new Map();
  }

  async getProviderForUser(userId) {
    const profile = await this.personalizationService.getOrCreateProfile(userId);
    return AIProviderFactory.get(profile.aiProvider || "GEMINI");
  }

  async getProviderPreference(userId) {
    const profile = await this.personalizationService.getOrCreateProfile(userId);
    return profile.aiProvider;
  }

  /**
   * Live workspace counts, or null when the service is not wired (keeps the
   * assistant usable in isolation, e.g. in unit tests).
   */
  /**
   * Snapshot rendered for the prompt. Returns null when unavailable so the
   * assistant degrades to task-only context instead of failing.
   */
  async buildWorkspaceSummaryText(userId) {
    const snapshot = await this.getWorkspaceSnapshot(userId);
    if (!snapshot) return null;

    return this.contextBuilder.buildWorkspaceSummary(
      this.workspaceSnapshotService.contextSummary(snapshot)
    );
  }

  async getWorkspaceSnapshot(userId) {
    if (!this.workspaceSnapshotService) return null;

    try {
      return await this.workspaceSnapshotService.build(userId);
    } catch (error) {
      // A snapshot failure must not take the whole reply down; the assistant
      // simply answers without the extra counts this once.
      console.error("Workspace snapshot failed:", error.message);
      return null;
    }
  }

  /**
   * Payload for the dashboard AI card. Backed by the same snapshot the chat
   * prompt uses, so the card's numbers and the assistant's answers can never
   * disagree.
   */
  async getDashboardSummary(userId) {
    const snapshot = await this.getWorkspaceSnapshot(userId);
    if (!snapshot) {
      return {
        available: false,
        summary: "Your assistant is online, but live counts are unavailable right now.",
        suggestion: null,
      };
    }

    return {
      available: true,
      timeZone: snapshot.timeZone,
      today: snapshot.today,
      weekday: snapshot.weekday,
      counts: {
        openTasks: snapshot.openTasks,
        totalTasks: snapshot.totalTasks,
        completedTotal: snapshot.completedTotal,
        inProgress: snapshot.inProgress,
        dueToday: snapshot.dueToday,
        overdue: snapshot.overdue,
        completedToday: snapshot.completedToday,
        goals: snapshot.goalTotal,
        goalsActive: snapshot.goalsActive,
        habits: snapshot.habitTotal,
        habitsActive: snapshot.habitsActive,
        notes: snapshot.noteTotal,
        projects: snapshot.projectTotal,
      },
      dueTodayList: snapshot.dueTodayList.map((task) => ({
        id: task.id,
        title: task.title,
        priority: task.priority,
        estimatedMinutes: task.estimatedMinutes,
      })),
      summary: this.workspaceSnapshotService.buildSummary(snapshot),
      suggestion: this.workspaceSnapshotService.buildSuggestion(snapshot),
    };
  }

  async createConversation(userId, data) {
    const parsed = parseSchema(createConversationSchema, data);

    return this.prisma.aIConversation.create({
      data: {
        userId,
        ...(parsed.title ? { title: parsed.title } : {}),
      },
    });
  }

  async listConversations(userId, query = {}) {
    const { page, limit, skip, take } = getPagination(query);
    const where = { userId };

    const [items, total] = await Promise.all([
      this.prisma.aIConversation.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip,
        take,
        include: {
          messages: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      }),
      this.prisma.aIConversation.count({ where }),
    ]);

    return { items, pagination: buildMeta(page, limit, total) };
  }

  async getConversation(userId, id) {
    const conversation = await this.prisma.aIConversation.findFirst({
      where: { id, userId },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!conversation) {
      throw new AppError("Conversation not found", 404);
    }

    return conversation;
  }

  async updateTitle(userId, id, data) {
    const parsed = parseSchema(updateConversationSchema, data, { partial: true });

    const conversation = await this.getConversation(userId, id);
    if (
      !parsed.title &&
      parsed.pinned === undefined &&
      parsed.isSpeak === undefined &&
      parsed.voiceId === undefined
    ) {
      throw new AppError("Nothing to update", 400);
    }

    const updates = {};
    if (parsed.title) {
      updates.title = parsed.title.trim();
      updates.pinned = false;
    }

    if (parsed.pinned === true) {
      updates.pinned = true;
      updates.pinnedAt = conversation.pinned && conversation.pinnedAt
        ? conversation.pinnedAt
        : new Date();
    } else if (parsed.pinned === false) {
      updates.pinned = false;
      updates.pinnedAt = null;
    }

    if (parsed.isSpeak !== undefined) {
      updates.isSpeak = Boolean(parsed.isSpeak);
    }

    if (parsed.voiceId !== undefined) {
      updates.voiceId = parsed.voiceId;
    }

    return this.prisma.aIConversation.update({
      where: { id },
      data: updates,
      include: {
        messages: { orderBy: { createdAt: "asc" } },
      },
    });
  }

  async deleteConversation(userId, id) {
    await this.getConversation(userId, id);

    await this.prisma.aIConversation.delete({ where: { id } });
  }

  async sendMessage(userId, conversationId, data, files = []) {
    const parsed = parseSchema(sendMessageSchema, data);

    const conversation = await this.getConversation(userId, conversationId);

    const attachments = (files || [])
      .filter(Boolean)
      .map((file) => ({
        url: this.fileService
          ? this.fileService.buildUrl(file.filename)
          : null,
        fileName: (file.originalname || "file").slice(0, 255),
        fileType: file.mimetype,
        fileSize: file.size,
      }));

    const userMessage = await this.prisma.aIMessage.create({
      data: {
        conversationId,
        role: "USER",
        content: parsed.message,
        attachments: attachments.length ? attachments : undefined,
      },
    });

    const firstUserText =
      conversation.messages.length === 0 ? parsed.message : null;

    const job = await this.tryEnqueue({
      userId,
      conversationId,
      messageId: userMessage.id,
      firstUserText,
    });

    if (!job) {
      const assistantMessage = await this.processAiMessage({
        userId,
        conversationId,
        messageId: userMessage.id,
        firstUserText,
      });
      return { status: "done", userMessage, assistantMessage };
    }

    this.emitProgress(userId, conversationId, 5, "Queued");
    return { status: "queued", jobId: job.id, userMessage };
  }

  async processAiMessage({ userId, conversationId, messageId, firstUserText }, job = null) {
    const conversation = await this.getConversation(userId, conversationId);

    const emit = (percent, phase) => {
      if (job && typeof job.updateProgress === "function") {
        job.updateProgress(percent).catch(() => {});
      }
      this.emitProgress(userId, conversationId, percent, phase);
    };

    emit(10, "Loading chat history");

    // Every one of these is an independent read. They were awaited one after
    // another, so a reply paid the full round-trip latency of eight sequential
    // queries before the model was even called.
    const [user, provider, profile, userSettings, taskContext, projectNames, workspaceSummary] =
      await Promise.all([
        this.prisma.user.findUnique({
          where: { id: userId },
          select: { firstName: true },
        }),
        this.getProviderForUser(userId),
        this.personalizationService.getOrCreateProfile(userId),
        this.prisma.userSettings.findUnique({
          where: { userId },
          select: { timezone: true },
        }),
        this.buildOpenTaskContext(userId),
        this.getProjectNames(userId),
        this.buildWorkspaceSummaryText(userId),
      ]);

    const profileContext = this.personalizationService.buildSafeProfileContext(
      profile,
      user?.firstName
    );

    // The user's own timezone, already stored on UserSettings (defaults to
    // Asia/Manila). Read per request so a timezone change applies immediately.
    const { prompt: systemPrompt } = this.contextBuilder.buildSystemPrompt({
      profileContext,
      timezone: userSettings?.timezone || process.env.APP_TIMEZONE,
    });

    emit(25, "Gathering your tasks");

    const currentMessage = conversation.messages.find(
      (message) => message.id === messageId
    );
    if (!currentMessage) {
      throw new AppError("Message not found", 404);
    }

    const userContent = this.contextBuilder.buildChatUserContent({
      request: currentMessage.content,
      taskContext,
      projectNames,
      workspaceSummary,
    });

    const history = this.normalizeHistory(
      conversation.messages.map((message) => ({
        role: message.role === "ASSISTANT" ? "assistant" : "user",
        content: message.content,
      })),
      MAX_HISTORY_MESSAGES
    );

    const parts = await this.buildMessageParts(currentMessage);

    emit(45, "Thinking");

    // Streamed so the reply appears as it is written. The non-streaming call
    // left the user looking at an empty composer for the entire generation,
    // which made a normal reply feel like a hang.
    let response;
    try {
      response = await provider.generateTextStreamedWithRetry({
        systemPrompt,
        messages: [
          ...history,
          { role: "user", content: userContent, parts },
        ],
        onChunk: (delta, text) => {
          this.emitDelta(userId, conversationId, text);
        },
        onFallback: (providerName) => {
          emit(50, `Switched to ${providerName}`);
        },
      });
    } catch (error) {
      // Both providers failed. Tell the client to drop the partial reply it is
      // still showing, otherwise the failed turn is left on screen forever
      // with no indication that anything went wrong.
      this.emitError(userId, conversationId, error.message);
      throw error;
    }

    emit(88, "Finishing your answer");

    const assistantMessage = await this.prisma.aIMessage.create({
      data: {
        conversationId,
        role: "ASSISTANT",
        content: response.text,
      },
    });

    if (firstUserText) {
      const stored = await this.prisma.aIConversation.findUnique({
        where: { id: conversationId },
        select: { title: true },
      });
      if (stored && !stored.title) {
        await this.prisma.aIConversation.update({
          where: { id: conversationId },
          data: { title: firstUserText.slice(0, 60) },
        });
      }
    }

    emit(100, "Done");
    this.emitAssistantMessage(userId, conversationId, assistantMessage);

    return assistantMessage;
  }

  async tryEnqueue(data) {
    if (!this.queue) return null;
    try {
      const job = await withTimeout(
        this.queue.add(AI_GENERATION_JOB, data, {
          attempts: 3,
          backoff: { type: "exponential", delay: 2000 },
          removeOnComplete: { age: 86_400, count: 500 },
          removeOnFail: { age: 604_800 },
        }),
        QUEUE_ADD_TIMEOUT_MS,
        "queue.add"
      );
      return job;
    } catch (error) {
      console.warn(
        `[ai] queue unavailable (${error.message}) — processing inline`
      );
      return null;
    }
  }

  emitProgress(userId, conversationId, percent, phase) {
    if (!this.realtimeService) return;
    this.realtimeService.emitToUser(userId, "ai:progress", {
      conversationId,
      percent,
      phase,
    });
  }

  // Partial reply text as the model produces it. Throttled because a fast model
  // can emit dozens of chunks a second and each one costs a socket frame plus a
  // React render; the user cannot read faster than that anyway.
  emitDelta(userId, conversationId, text) {
    if (!this.realtimeService) return;

    const now = Date.now();
    const key = `${userId}:${conversationId}`;
    if (now - (this.lastDeltaAt?.get(key) ?? 0) < AI_DELTA_THROTTLE_MS) {
      return;
    }
    this.lastDeltaAt.set(key, now);

    this.realtimeService.emitToUser(userId, "ai:delta", {
      conversationId,
      content: text,
    });
  }

  emitAssistantMessage(userId, conversationId, message) {
    if (!this.realtimeService) return;
    this.realtimeService.emitToUser(userId, "ai:message", {
      conversationId,
      message,
    });
  }

  // Queued generation runs outside the request/response cycle, so a failure has
  // no HTTP response to travel back on. This is the only signal the client gets
  // that the turn it is watching did not complete.
  emitError(userId, conversationId, message) {
    this.lastDeltaAt.delete(`${userId}:${conversationId}`);
    if (!this.realtimeService) return;
    this.realtimeService.emitToUser(userId, "ai:error", {
      conversationId,
      message,
    });
  }

  async buildMessageParts(message) {
    const parts = [{ text: message.content }];
    const attachments = Array.isArray(message.attachments)
      ? message.attachments
      : [];

    for (const attachment of attachments) {
      if (!attachment?.url || !this.fileService) continue;
      try {
        const filePath = this.fileService.resolvePath(attachment.url);
        const data = await fs.promises.readFile(filePath, "base64");
        parts.push({
          inlineData: {
            mimeType: attachment.fileType || "application/octet-stream",
            data,
          },
        });
      } catch (error) {
        console.warn(
          `[ai] could not read attachment ${attachment.fileName}: ${error.message}`
        );
      }
    }

    return parts;
  }

  async recommend(userId, data) {
    const parsed = parseSchema(recommendSchema, data);
    const { request, projectId, scope } = parsed;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true },
    });

    const provider = await this.getProviderForUser(userId);
    const profile = await this.personalizationService.getOrCreateProfile(userId);
    const profileContext = this.personalizationService.buildSafeProfileContext(
      profile,
      user?.firstName
    );

    const { taskContext, projectNames } = await this.buildRecommendationContext(
      userId,
      { projectId, scope }
    );

    // Recommendations are date-sensitive too ("plan my week"), so they get the
    // same clock context as chat rather than being left to guess the date.
    const userSettings = await this.prisma.userSettings.findUnique({
      where: { userId },
      select: { timezone: true },
    });

    const { prompt: systemPrompt } = this.contextBuilder.buildSystemPrompt({
      profileContext,
      timezone: userSettings?.timezone || process.env.APP_TIMEZONE,
    });

    const userContent = this.contextBuilder.buildChatUserContent({
      request,
      taskContext,
      projectNames,
      workspaceSummary: await this.buildWorkspaceSummaryText(userId),
    });

    const response = await provider.generateTextWithRetry({
      systemPrompt,
      messages: [{ role: "user", content: userContent }],
    });

    return { recommendation: response.text };
  }

  async buildOpenTaskContext(userId) {
    const tasks = await this.prisma.task.findMany({
      where: { userId, status: { not: "COMPLETED" } },
      orderBy: [{ dueDate: "asc" }],
      take: 20,
      include: { project: { select: { name: true } } },
    });

    if (tasks.length === 0) return "No open tasks right now.";

    return this.contextBuilder.buildTaskListForAi(tasks);
  }

  async buildRecommendationContext(userId, { projectId, scope }) {
    const where = { userId, status: { not: "COMPLETED" } };

    if (projectId) {
      await this.assertProjectOwnership(userId, projectId);
      where.projectId = projectId;
    }

    if (scope === "day" || scope === "week" || scope === "month") {
      const start = new Date();
      start.setHours(0, 0, 0, 0);

      const end = new Date(start);
      const days = scope === "day" ? 1 : scope === "week" ? 7 : 30;
      end.setDate(end.getDate() + days);

      where.OR = [
        { dueDate: { gte: start, lte: end } },
        { status: "IN_PROGRESS" },
      ];
    }

    const tasks = await this.prisma.task.findMany({
      where,
      orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
      take: 30,
      include: {
        project: { select: { name: true } },
        subtasks: { select: { id: true, title: true, completed: true } },
      },
    });

    const projects = projectId
      ? []
      : await this.prisma.project.findMany({
          where: { userId, status: "ACTIVE" },
          select: { name: true },
          take: 50,
        });

    return {
      taskContext: this.contextBuilder.buildTaskListForAi(tasks),
      projectNames: projects.map((project) => project.name),
    };
  }

  async getProjectNames(userId) {
    const projects = await this.prisma.project.findMany({
      where: { userId },
      select: { name: true },
      take: 50,
    });

    return projects.map((project) => project.name);
  }

  // Merges adjacent same-role messages (so providers never receive
  // consecutive identical roles) and keeps only the most recent turns.
  normalizeHistory(messages, max) {
    const merged = [];

    for (const message of messages) {
      const previous = merged[merged.length - 1];

      if (previous && previous.role === message.role) {
        previous.content = `${previous.content}\n\n${message.content}`;
      } else {
        merged.push({ role: message.role, content: message.content });
      }
    }

    return merged.slice(-max);
  }

  async assertProjectOwnership(userId, projectId) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, userId },
      select: { id: true },
    });

    if (!project) {
      throw new AppError("Project not found", 404);
    }
  }
}

module.exports = AIService;