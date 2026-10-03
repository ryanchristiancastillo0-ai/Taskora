const AppError = require("../../utils/AppError.js");
const { parseSchema, definedOnly } = require("../../utils/validate.js");
const { getPagination, buildMeta } = require("../../utils/pagination.js");
const {
  createProjectSchema,
  updateProjectSchema,
} = require("../../validators/user/projectValidators.js");

class ProjectService {
  constructor(prisma, cacheService = null) {
    this.prisma = prisma;
    this.cacheService = cacheService;
  }

  async list(userId, query = {}) {
    const { page, limit, skip, take } = getPagination(query);

    const cacheKey =
      this.cacheService &&
      this.cacheService.buildKey(userId, "projects", { page, limit });

    const cached = cacheKey && (await this.cacheService.getJson(cacheKey));
    if (cached) {
      return cached;
    }

    const where = { userId };

    const [items, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        include: {
          _count: { select: { tasks: true } },
        },
      }),
      this.prisma.project.count({ where }),
    ]);

    const result = { items, pagination: buildMeta(page, limit, total) };

    if (cacheKey) {
      await this.cacheService.setJson(cacheKey, result);
    }

    return result;
  }

  async get(userId, id) {
    const project = await this.prisma.project.findFirst({
      where: { id, userId },
      include: {
        tasks: {
          orderBy: { createdAt: "asc" },
          include: {
            subtasks: { select: { id: true, completed: true } },
            tags: { select: { tag: true } },
          },
        },
      },
    });

    if (!project) {
      throw new AppError("Project not found", 404);
    }

    return project;
  }

  async create(userId, data) {
    const parsed = parseSchema(createProjectSchema, data);

    const project = await this.prisma.project.create({
      data: { userId, ...parsed },
    });

    await this.invalidateLists(userId);

    return project;
  }

  async update(userId, id, data) {
    await this.get(userId, id);

    const parsed = parseSchema(updateProjectSchema, data);

    const project = await this.prisma.project.update({
      where: { id },
      data: definedOnly(parsed),
    });

    await this.invalidateLists(userId);

    return project;
  }

  async remove(userId, id) {
    await this.get(userId, id);

    await this.prisma.project.delete({ where: { id } });

    await this.invalidateLists(userId);
  }

  async invalidateLists(userId) {
    if (!this.cacheService) {
      return;
    }

    await this.cacheService.invalidatePattern(`app:${userId}:projects:*`);
    await this.cacheService.invalidatePattern(`app:${userId}:tasks:*`);
  }
}

module.exports = ProjectService;