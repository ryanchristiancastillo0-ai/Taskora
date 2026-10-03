class SearchService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async search(userId, query) {
    const q = String(query || "").trim();
    if (!q) {
      return { tasks: [], projects: [] };
    }

    const [tasks, projects] = await Promise.all([
      this.prisma.task.findMany({
        where: { userId, title: { contains: q } },
        select: {
          id: true,
          title: true,
          status: true,
          project: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      this.prisma.project.findMany({
        where: { userId, name: { contains: q } },
        select: { id: true, name: true, color: true, status: true },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
    ]);

    return { tasks, projects };
  }
}

module.exports = SearchService;