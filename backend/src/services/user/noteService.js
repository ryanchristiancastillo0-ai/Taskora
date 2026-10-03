const AppError = require("../../utils/AppError.js");
const { parseSchema, definedOnly } = require("../../utils/validate.js");
const { getPagination, buildMeta } = require("../../utils/pagination.js");
const { createNoteSchema, updateNoteSchema } = require("../../validators/user/noteValidators.js");

class NoteService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async list(userId, query = {}) {
    const { page, limit, skip, take } = getPagination(query);
    const where = { userId };

    if (query.projectId) where.projectId = query.projectId;

    if (query.search) {
      where.OR = [
        { title: { contains: query.search } },
        { content: { contains: query.search } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.note.findMany({
        where,
        orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
        skip,
        take,
      }),
      this.prisma.note.count({ where }),
    ]);

    return { items, pagination: buildMeta(page, limit, total) };
  }

  async get(userId, id) {
    const note = await this.prisma.note.findFirst({
      where: { id, userId },
    });

    if (!note) {
      throw new AppError("Note not found", 404);
    }

    return note;
  }

  async create(userId, data) {
    const parsed = parseSchema(createNoteSchema, data);

    if (parsed.projectId) {
      await this.assertProjectOwnership(userId, parsed.projectId);
    }

    return this.prisma.note.create({
      data: { userId, ...parsed },
    });
  }

  async update(userId, id, data) {
    await this.get(userId, id);

    const parsed = parseSchema(updateNoteSchema, data);

    if (parsed.projectId !== undefined && parsed.projectId !== null) {
      await this.assertProjectOwnership(userId, parsed.projectId);
    }

    if (parsed.pinned !== undefined) {
      parsed.pinnedAt = parsed.pinned ? new Date() : null;
    }

    return this.prisma.note.update({
      where: { id },
      data: definedOnly(parsed),
    });
  }

  async remove(userId, id) {
    await this.get(userId, id);

    await this.prisma.note.delete({ where: { id } });
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

module.exports = NoteService;