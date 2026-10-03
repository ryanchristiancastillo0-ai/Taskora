const AppError = require("../../utils/AppError.js");

// Notification sounds are global rows, not per-user rows: the same catalogue is
// offered to everyone and a user only stores a reference to the one they picked
// (NotificationSettings.notificationSoundId). The audio itself never reaches the
// database — `path` is a relative URL served by the existing /uploads mount.
class NotificationSoundService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  // Oldest first so the catalogue order is stable and matches the order the
  // sounds were seeded in.
  async list() {
    return await this.prisma.notificationSound.findMany({
      orderBy: { createdAt: "asc" },
    });
  }

  // The sound played for users who have not chosen one. Falls back to the
  // oldest row so notifications still make noise if the flag is ever missing.
  async getDefault() {
    const flagged = await this.prisma.notificationSound.findFirst({
      where: { isDefault: true },
      orderBy: { createdAt: "asc" },
    });

    if (flagged) {
      return flagged;
    }

    return await this.prisma.notificationSound.findFirst({
      orderBy: { createdAt: "asc" },
    });
  }

  // Resolves what a user should actually hear: their selection when it is set
  // and still exists, otherwise the default. Returns null only when the
  // catalogue is empty (i.e. the seed has not been run yet).
  async getSelectedSound(userId) {
    const settings = await this.prisma.notificationSettings.findUnique({
      where: { userId },
      select: { notificationSoundId: true },
    });

    if (settings?.notificationSoundId) {
      const selected = await this.prisma.notificationSound.findUnique({
        where: { id: settings.notificationSoundId },
      });

      // A deleted sound leaves a dangling id, so fall through to the default
      // rather than silencing the user.
      if (selected) {
        return selected;
      }
    }

    return await this.getDefault();
  }

  async assertExists(id) {
    const sound = await this.prisma.notificationSound.findUnique({
      where: { id },
    });

    if (!sound) {
      throw new AppError("Notification sound not found", 404);
    }

    return sound;
  }

  // Stores the choice on the user's NotificationSettings row, creating it if
  // this is their first settings write. Only the id is persisted — never the
  // URL — so renaming or replacing a file updates every user at once.
  async setSelectedSound(userId, notificationSoundId) {
    await this.assertExists(notificationSoundId);

    await this.prisma.notificationSettings.upsert({
      where: { userId },
      create: { userId, notificationSoundId },
      update: { notificationSoundId },
    });

    return await this.getSelectedSound(userId);
  }
}

module.exports = NotificationSoundService;
