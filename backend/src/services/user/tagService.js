const AppError = require("../../utils/AppError.js");
const { parseSchema, definedOnly } = require("../../utils/validate.js");
const { getPagination, buildMeta } = require("../../utils/pagination.js");
const { createTagSchema, updateTagSchema } = require("../../validators/user/tagValidators.js");

class TagService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async list(userId, query = {}) {
    const { page, limit, skip, take } = getPagination(query);
    const where = { userId };

    const [items, total] = await Promise.all([
      this.prisma.tag.findMany({
        where,
        orderBy: { name: "asc" },
        skip,
        take,
        include: {
          _count: { select: { tasks: true } },
        },
      }),
      this.prisma.tag.count({ where }),
    ]);

    return { items, pagination: buildMeta(page, limit, total) };
  }

  async get(userId, id) {
    const tag = await this.prisma.tag.findFirst({
      where: { id, userId },
      include: {
        tasks: {
          include: { task: true },
        },
      },
    });

    if (!tag) {
      throw new AppError("Tag not found", 404);
    }

    return tag;
  }

  async create(userId, data) {
    const parsed = parseSchema(createTagSchema, data);

    try {
      return await this.prisma.tag.create({
        data: { userId, ...parsed },
      });
    } catch (err) {
      if (err.code === "P2002") {
        throw new AppError("A tag with this name already exists", 409);
      }
      throw err;
    }
  }

  async update(userId, id, data) {
    await this.get(userId, id);

    const parsed = parseSchema(updateTagSchema, data);

    try {
      return await this.prisma.tag.update({
        where: { id },
        data: definedOnly(parsed),
      });
    } catch (err) {
      if (err.code === "P2002") {
        throw new AppError("A tag with this name already exists", 409);
      }
      throw err;
    }
  }

  async remove(userId, id) {
    await this.get(userId, id);

    await this.prisma.tag.delete({ where: { id } });
  }
}

module.exports = TagService;