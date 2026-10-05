const { parseSchema, definedOnly } = require("../../utils/validate.js");
const AppError = require("../../utils/AppError.js");
const {
  updateSettingsSchema,
  updateNotificationSettingsSchema,
} = require("../../validators/users/settingsValidators.js");

/**
 * The per-type switches shown in the test email, in the order they appear in
 * Settings. Duplicated as labels rather than keys so the email reads like the
 * screen the user is looking at.
 */
const EMAIL_CATEGORY_LABELS = {
  taskReminders: "Task reminders",
  deadlineReminders: "Deadline reminders",
  projectUpdates: "Project updates",
  aiSuggestions: "AI suggestions",
  dailySummary: "Daily summary",
};

class SettingsService {
  constructor(prisma, notificationSoundService, emailService) {
    this.prisma = prisma;
    this.notificationSoundService = notificationSoundService;
    this.emailService = emailService;
  }

  async ensureUserSettings(userId) {
    let settings = await this.prisma.userSettings.findUnique({
      where: { userId },
    });

    if (!settings) {
      settings = await this.prisma.userSettings.create({ data: { userId } });
    }

    return settings;
  }

  async ensureNotificationSettings(userId) {
    let settings = await this.prisma.notificationSettings.findUnique({
      where: { userId },
    });

    if (!settings) {
      settings = await this.prisma.notificationSettings.create({
        data: { userId },
      });
    }

    return settings;
  }

  async getSettings(userId) {
    const [settings, notificationSettings, notificationSound] = await Promise.all([
      this.ensureUserSettings(userId),
      this.ensureNotificationSettings(userId),
      this.notificationSoundService.getSelectedSound(userId),
    ]);

    return { settings, notificationSettings, notificationSound };
  }

  async updateSettings(userId, data) {
    const parsed = parseSchema(updateSettingsSchema, data);
    const updateData = definedOnly(parsed);

    return await this.prisma.userSettings.upsert({
      where: { userId },
      create: { userId, ...updateData },
      update: updateData,
    });
  }

  async updateNotificationSettings(userId, data) {
    const parsed = parseSchema(updateNotificationSettingsSchema, data);
    const updateData = definedOnly(parsed);

    // Reject an unknown sound before writing, so a bad id never leaves the
    // user's settings pointing at nothing. A null id is the "back to default"
    // case and needs no existence check.
    if (updateData.notificationSoundId) {
      await this.notificationSoundService.assertExists(updateData.notificationSoundId);
    }

    const notificationSettings = await this.prisma.notificationSettings.upsert({
      where: { userId },
      create: { userId, ...updateData },
      update: updateData,
    });

    // Always hand back the resolved sound so the client can play the right file
    // without a second request.
    const notificationSound =
      await this.notificationSoundService.getSelectedSound(userId);

    return { notificationSettings, notificationSound };
  }

  /**
   * Sends one real email to the signed-in user's own address.
   *
   * The switch that turns email on has no in-app effect to observe, so this is
   * how a user finds out whether mail actually works. It is the same `send()`
   * path a real notification takes — only the queue is skipped, because a failure
   * here has to be an error on the button rather than a silent worker log.
   *
   * Requires emailNotifications to be on. Refusing when it is off is the whole
   * point of the consent switch: "I do not want email" must not mean "I get one
   * anyway because I pressed the wrong button".
   */
  async sendNotificationTestEmail(userId) {
    const [user, notificationSettings] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      }),
      this.ensureNotificationSettings(userId),
    ]);

    if (!user?.email) {
      throw new AppError("No email address is on this account", 400);
    }

    if (!notificationSettings.emailNotifications) {
      throw new AppError(
        "Turn on email notifications before sending a test email",
        400
      );
    }

    if (!this.emailService) {
      throw new AppError("Email service is unavailable", 503);
    }

    const enabledTypes = Object.keys(EMAIL_CATEGORY_LABELS)
      .filter((key) => notificationSettings[key] !== false)
      .map((key) => EMAIL_CATEGORY_LABELS[key]);

    await this.emailService.sendTestEmail({
      email: user.email,
      enabledTypes,
    });

    return { sentTo: user.email, enabledTypes };
  }
}

module.exports = SettingsService;