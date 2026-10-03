const { parseSchema, definedOnly } = require("../../utils/validate.js");
const AppError = require("../../utils/AppError.js");
const {
  onboardingSchema,
  updateProfileSchema,
} = require("../../validators/user/profileValidators.js");

class PersonalizationService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async getOrCreateProfile(userId) {
    let profile = await this.prisma.personalizationProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      profile = await this.prisma.personalizationProfile.create({
        data: { userId },
      });
    }

    return profile;
  }

  async getProfile(userId) {
    const profile = await this.prisma.personalizationProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new AppError("Personalization profile not found", 404);
    }

    return profile;
  }

  async getOnboardingStatus(userId) {
    const profile = await this.prisma.personalizationProfile.findUnique({
      where: { userId },
      select: { onboardingCompleted: true },
    });

    return profile?.onboardingCompleted ?? false;
  }

  async completeOnboarding({ userId, data }) {
    const parsed = parseSchema(onboardingSchema, data);

    const skipped = parsed.skipped === true;

    // Skip = user chose to defer onboarding. We record that it STARTED and was
    // SKIPPED (NOT completed), so the red dot / gateway stays active until they
    // actually complete it.
    if (skipped) {
      const profile = await this.prisma.personalizationProfile.upsert({
        where: { userId },
        update: {
          onboardingStarted: true,
          onboardingSkipped: true,
          onboardingCompleted: false,
        },
        create: {
          userId,
          onboardingStarted: true,
          onboardingSkipped: true,
          onboardingCompleted: false,
        },
      });

      return profile;
    }

    const { skipped: _ignored, ...completionData } = parsed;

    const profile = await this.prisma.personalizationProfile.upsert({
      where: { userId },
      update: {
        ...completionData,
        onboardingStarted: true,
        onboardingSkipped: false,
        onboardingCompleted: true,
      },
      create: {
        userId,
        ...completionData,
        onboardingStarted: true,
        onboardingSkipped: false,
        onboardingCompleted: true,
      },
    });

    return profile;
  }

  async updateProfile({ userId, data }) {
    const parsed = parseSchema(updateProfileSchema, data);
    const updateData = definedOnly(parsed);

    const existing = await this.prisma.personalizationProfile.findUnique({
      where: { userId },
    });

    if (!existing) {
      return await this.prisma.personalizationProfile.create({
        data: { userId, ...updateData },
      });
    }

    return await this.prisma.personalizationProfile.update({
      where: { userId },
      data: updateData,
    });
  }

  // Controlled projection for AI use. Never passes whole DB records.
  buildSafeProfileContext(profile, userFirstName) {
    if (!profile) return null;

    return {
      displayName: profile.preferredName || userFirstName || null,
      preferredName: profile.preferredName,
      occupationOrRole: profile.occupationOrRole,
      productivityGoal: profile.productivityGoal,
      workStyle: profile.workStyle,
      planningStyle: profile.planningStyle,
      preferredTaskOrganization: profile.preferredTaskOrganization,
      mostProductiveTime: profile.mostProductiveTime,
      usualStartTime: profile.usualStartTime,
      usualEndTime: profile.usualEndTime,
      averageFocusDuration: profile.averageFocusDuration,
      breakPreference: profile.breakPreference,
      reminderPreference: profile.reminderPreference,
      difficultyStartingTasks: profile.difficultyStartingTasks,
      difficultyFinishingTasks: profile.difficultyFinishingTasks,
      preferredTaskDetailLevel: profile.preferredTaskDetailLevel,
      preferredAIResponseStyle: profile.preferredAIResponseStyle,
    };
  }
}

module.exports = PersonalizationService;