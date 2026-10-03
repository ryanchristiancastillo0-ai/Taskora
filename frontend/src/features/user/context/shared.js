export const toApiTask = (task) => ({
  title: task.title,
  description: task.description || null,
  projectId: task.projectId || null,
  priority: task.priority,
  status: task.status,
  dueDate: task.dueDate || null,
  estimatedMinutes: task.estimatedMinutes
    ? Number(task.estimatedMinutes)
    : null,
  tagIds: task.tagIds || [],
})

export const unwrap = (payload, key) => payload?.[key] ?? payload

export function isSameUser(a, b) {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.id === b.id &&
    a.firstName === b.firstName &&
    a.lastName === b.lastName &&
    a.email === b.email &&
    a.bio === b.bio &&
    a.avatarUrl === b.avatarUrl
  )
}

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
