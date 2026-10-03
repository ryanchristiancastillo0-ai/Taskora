const AppError = require("../../utils/AppError.js");
const { parseSchema, definedOnly } = require("../../utils/validate.js");
const { getPagination, buildMeta } = require("../../utils/pagination.js");
const {
  createTaskSchema,
  updateTaskSchema,
} = require("../../validators/user/taskValidators.js");

class TaskService {
  constructor(
    prisma,
    notificationService,
    cacheService = null,
    reminderScheduler = null,
    patternService = null
  ) {
    this.prisma = prisma;
    this.notificationService = notificationService;
    this.cacheService = cacheService;
    this.reminderScheduler = reminderScheduler;
    this.patternService = patternService;
  }

  async list(userId, query = {}) {
    const { page, limit, skip, take } = getPagination(query);

    const cacheKey =
      this.cacheService &&
      this.cacheService.buildKey(userId, "tasks", {
        page,
        limit,
        projectId: query.projectId || "",
        status: query.status || "",
        priority: query.priority || "",
        overdue: query.overdue || "",
        today: query.today || "",
        upcoming: query.upcoming || "",
        search: query.search || "",
      });

    const cached = cacheKey && (await this.cacheService.getJson(cacheKey));
    if (cached) {
      return cached;
    }

    const where = { userId };

    if (query.projectId) where.projectId = query.projectId;
    if (query.status) where.status = query.status;
    if (query.priority) where.priority = query.priority;

    if (query.search) {
      where.title = { contains: query.search };
    }

    if (query.overdue === "true") {
      where.dueDate = { lte: new Date() };
      where.status = { not: "COMPLETED" };
    }

    if (query.today === "true") {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      where.dueDate = { gte: start, lt: end };
    }

    if (query.upcoming === "true") {
      where.dueDate = { gte: new Date() };
    }

    const [items, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        include: {
          project: { select: { id: true, name: true, color: true } },
          _count: { select: { subtasks: true, attachments: true } },
          tags: { select: { tag: true } },
        },
      }),
      this.prisma.task.count({ where }),
    ]);

    const result = { items, pagination: buildMeta(page, limit, total) };

    if (cacheKey) {
      await this.cacheService.setJson(cacheKey, result);
    }

    return result;
  }

  async get(userId, id) {
    const task = await this.prisma.task.findFirst({
      where: { id, userId },
      include: {
        project: true,
        tags: { include: { tag: true } },
        attachments: { orderBy: { createdAt: "asc" } },
        subtasks: { orderBy: { position: "asc" } },
      },
    });

    if (!task) {
      throw new AppError("Task not found", 404);
    }

    return task;
  }

  async create(userId, data) {
    const parsed = parseSchema(createTaskSchema, data);
    const { tagIds, ...rest } = parsed;

    if (rest.projectId) {
      await this.assertProjectOwnership(userId, rest.projectId);
    }

    const tags = tagIds ? await this.assertTagsOwnership(userId, tagIds) : [];

    // Keep completion consistent with update(): completing sets completedAt.
    if (rest.status === "COMPLETED" && !rest.completedAt) {
      rest.completedAt = new Date();
    }

    const task = await this.prisma.task.create({
      data: {
        userId,
        ...rest,
        tags:
          tags.length > 0
            ? { create: tags.map((tagId) => ({ tag: { connect: { id: tagId } } })) }
            : undefined,
      },
    });

    if (rest.dueDate) {
      const scheduled = await this.reminderScheduler?.scheduleTaskReminder({
        taskId: task.id,
        userId,
        title: task.title,
        dueDate: rest.dueDate,
      });

      if (!scheduled) {
        await this.notificationService.create(userId, {
          taskId: task.id,
          title: "Task due",
          message: `"${task.title}" is due on ${new Date(rest.dueDate).toDateString()}`,
          type: "TASK_DUE",
        });
      }
    }

    if (this.cacheService) {
      await this.cacheService.invalidatePattern(`app:${userId}:tasks:*`);
    }

    if (rest.status === "COMPLETED") {
      await this.patternService?.onTaskCompleted(userId, task);
    }

    return this.get(userId, task.id);
  }

  async update(userId, id, data) {
    const existing = await this.get(userId, id);

    const parsed = parseSchema(updateTaskSchema, data);
    const { tagIds, ...rest } = parsed;

    if (rest.projectId !== undefined && rest.projectId !== null) {
      await this.assertProjectOwnership(userId, rest.projectId);
    }

    let tagsUpdate;
    if (tagIds !== undefined) {
      const uniqueTagIds = [...new Set(tagIds)];
      await this.assertTagsOwnership(userId, uniqueTagIds);
      tagsUpdate = {
        deleteMany: {},
        create: uniqueTagIds.map((tagId) => ({
          tag: { connect: { id: tagId } },
        })),
      };
    }

    const updateData = definedOnly(rest);

    const completing = updateData.status === "COMPLETED";
    if (completing) {
      updateData.completedAt = new Date();
    }

    if (completing || rest.dueDate !== undefined) {
      await this.reminderScheduler?.cancelTaskReminder(id);
    }

    if (rest.dueDate && !completing) {
      const scheduled = await this.reminderScheduler?.scheduleTaskReminder({
        taskId: id,
        userId,
        title: parsed.title || existing.title,
        dueDate: rest.dueDate,
      });

      if (!scheduled) {
        await this.notificationService.create(userId, {
          taskId: id,
          title: "Task due",
          message: `"${parsed.title || existing.title}" is due on ${new Date(
            rest.dueDate
          ).toDateString()}`,
          type: "TASK_DUE",
        });
      }
    }

    await this.prisma.task.update({
      where: { id },
      data: {
        ...updateData,
        ...(tagsUpdate ? { tags: tagsUpdate } : {}),
      },
    });

    if (this.cacheService) {
      await this.cacheService.invalidatePattern(`app:${userId}:tasks:*`);
    }

    if (completing) {
      await this.patternService?.onTaskCompleted(userId, {
        id,
        title: parsed.title || existing.title,
        completedAt: updateData.completedAt,
      });
    }

    return this.get(userId, id);
  }

  async remove(userId, id) {
    await this.get(userId, id);

    await this.reminderScheduler?.cancelTaskReminder(id);

    await this.prisma.task.delete({ where: { id } });

    if (this.cacheService) {
      await this.cacheService.invalidatePattern(`app:${userId}:tasks:*`);
    }
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

  async assertTagsOwnership(userId, tagIds) {
    const uniqueIds = [...new Set(tagIds)];

    const tags = await this.prisma.tag.findMany({
      where: { id: { in: uniqueIds }, userId },
      select: { id: true },
    });

    if (tags.length !== uniqueIds.length) {
      const found = new Set(tags.map((tag) => tag.id));
      const missing = uniqueIds.filter((id) => !found.has(id));

      if (missing.length > 0) {
        throw new AppError("One or more tags do not exist", 400);
      }
    }

    return uniqueIds;
  }
}

module.exports = TaskService;