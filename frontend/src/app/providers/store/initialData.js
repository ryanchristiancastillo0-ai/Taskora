// The shape every consumer can rely on before bootstrap commits: user and
// profile are always objects (the sidebar, dashboard and both profile pages
// read them unguarded), and an unnormalised payload keeps these placeholders.

export function initialData() {
  return {
    user: {
      id: '',
      firstName: '',
      lastName: '',
      email: '',
      bio: '',
      avatarUrl: null,
      // 'USER' rather than null so the admin guard fails closed for a session
      // that has not finished bootstrapping.
      role: 'USER',
    },
    profile: {
      preferredName: null,
      occupationOrRole: null,
      workStyle: null,
      planningStyle: null,
      preferredTaskOrganization: null,
      mostProductiveTime: null,
      breakPreference: null,
      reminderPreference: null,
      difficultyStartingTasks: null,
      difficultyFinishingTasks: null,
      preferredTaskDetailLevel: null,
      preferredAIResponseStyle: null,
      aiProvider: 'GEMINI',
      onboardingCompleted: false,
      onboardingSkipped: false,
      isNew: true,
    },
    settings: {
      theme: 'LIGHT',
      language: 'en',
      timezone: '',
      compactMode: false,
      showCompletedTasks: false,
      notificationSound: null,
      notifications: {
        taskReminders: false,
        deadlineReminders: false,
        projectUpdates: false,
        aiSuggestions: false,
        dailySummary: false,
        emailNotifications: false,
        pushNotifications: false,
        // The tone is opt-in, so the pre-bootstrap placeholder matches the
        // database default. Anything else renders "Sound on" in Settings for the
        // frame before the real preference lands.
        soundEnabled: false,
      },
    },
    tasks: [],
    projects: [],
    tags: [],
    notes: [],
    goals: [],
    habits: [],
    notifications: [],
    // Sound catalogue, fetched from the backend. Never hardcoded here.
    notificationSounds: [],
    communityUsers: [],
    friends: [],
    friendRequests: [],
    conversations: [],
    chatMessages: [],
    aiConversations: [],
    aiMessages: [],
  }
}
