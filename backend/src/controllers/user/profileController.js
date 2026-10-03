const asyncHandler = require("../../utils/asyncHandler.js");

class ProfileController {
  constructor(personalizationService) {
    this.personalizationService = personalizationService;
  }

  getProfile = asyncHandler(async (req, res) => {
    const profile = await this.personalizationService.getOrCreateProfile(
      req.user.userId
    );

    return res.status(200).json({
      success: true,
      data: {
        profile,
        onboardingCompleted: profile.onboardingCompleted,
      },
    });
  });

  completeOnboarding = asyncHandler(async (req, res) => {
    const profile = await this.personalizationService.completeOnboarding({
      userId: req.user.userId,
      data: req.body,
    });

    return res.status(200).json({
      success: true,
      message: "Onboarding completed",
      data: {
        profile,
        onboardingCompleted: profile.onboardingCompleted,
      },
    });
  });

  updateProfile = asyncHandler(async (req, res) => {
    const profile = await this.personalizationService.updateProfile({
      userId: req.user.userId,
      data: req.body,
    });

    return res.status(200).json({
      success: true,
      data: {
        profile,
        onboardingCompleted: profile.onboardingCompleted,
      },
    });
  });
}

module.exports = ProfileController;