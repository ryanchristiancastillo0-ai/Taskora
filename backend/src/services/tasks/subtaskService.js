const AppError = require("../../utils/AppError.js");
const { parseSchema, definedOnly } = require("../../utils/validate.js");
const {
  createSubtaskSchema,
  updateSubtaskSchema,
} = require("../../validators/tasks/subtaskValidators.js");

class SubtaskService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async listByTask(userId, taskId) {
    await this.assertTaskOwnership(userId, taskId);

    return this.prisma.subtask.findMany({
      where: { taskId },
      orderBy: { position: "asc" },
    });
  }

  async create(userId, taskId, data) {
    await this.assertTaskOwnership(userId, taskId);

    const parsed = parseSchema(createSubtaskSchema, data);

    const position =
      parsed.position ??
      (await this.prisma.subtask.count({ where: { taskId } }));

    return this.prisma.subtask.create({
      data: { taskId, userId, ...parsed, position },
    });
  }

  async update(userId, id, data) {
    await this.get(userId, id);

    const parsed = parseSchema(updateSubtaskSchema, data);

    return this.prisma.subtask.update({
      where: { id },
      data: definedOnly(parsed),
    });
  }

  async remove(userId, id) {
    await this.get(userId, id);

    await this.prisma.subtask.delete({ where: { id } });
  }

  async get(userId, id) {
    const subtask = await this.prisma.subtask.findFirst({
      where: { id, userId },
    });

    if (!subtask) {
      throw new AppError("Subtask not found", 404);
    }

    return subtask;
  }

  async assertTaskOwnership(userId, taskId) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, userId },
      select: { id: true },
    });

    if (!task) {
      throw new AppError("Task not found", 404);
    }
  }
}

module.exports = SubtaskService;