import { resolveAssetUrl } from './client'

const toTagIds = (tags = []) =>
  (Array.isArray(tags) ? tags : []).map((item) => item?.tag?.id ?? item?.id).filter(Boolean)

export function normalizeTask(task) {
  if (!task) return null
  return {
    id: task.id,
    title: task.title,
    description: task.description ?? null,
    projectId: task.projectId ?? null,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate ?? null,
    completedAt: task.completedAt ?? null,
    estimatedMinutes: task.estimatedMinutes ?? null,
    tagIds: toTagIds(task.tags),
    attachments: Array.isArray(task.attachments) ? task.attachments : [],
    attachmentCount: task.attachmentCount ?? task.attachments?.length ?? task._count?.attachments ?? 0,
    createdAt: task.createdAt ?? new Date().toISOString(),
  }
}

export function normalizeProject(project) {
  if (!project) return null
  return {
    id: project.id,
    name: project.name,
    description: project.description ?? null,
    color: project.color ?? '#4D3EC8',
    status: project.status ?? 'ACTIVE',
  }
}

export function normalizeTag(tag) {
  if (!tag) return null
  return {
    id: tag.id,
    name: tag.name,
    color: tag.color ?? null,
  }
}

export function normalizeNote(note) {
  if (!note) return null
  return {
    id: note.id,
    title: note.title,
    content: note.content ?? '',
    projectId: note.projectId ?? null,
    pinned: note.pinned ?? false,
    createdAt: note.createdAt ?? new Date().toISOString(),
  }
}

const GOAL_CATEGORY_FALLBACK = 'CAREER'

export function normalizeGoal(goal) {
  if (!goal) return null
  return {
    id: goal.id,
    title: goal.title,
    description: goal.description ?? null,
    category: goal.category ?? GOAL_CATEGORY_FALLBACK,
    targetDate: goal.targetDate ?? null,
    progress: Number(goal.progress) || 0,
    status: goal.status ?? 'ACTIVE',
    // Without this the "created" line on the goals page renders as an empty
    // span, and the table view has no date column to show.
    createdAt: goal.createdAt ?? new Date().toISOString(),
  }
}

export function normalizeHabit(habit, todayKey) {
  if (!habit) return null
  const completions = Array.isArray(habit.completions) ? habit.completions : []
  return {
    id: habit.id,
    name: habit.name,
    frequency: habit.frequency,
    streak: Number(habit.streak) || 0,
    doneToday:
      habit.doneToday ??
      completions.some((completion) => completion.date === todayKey),
    color: habit.color ?? null,
  }
}

export function todayKey() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function normalizeNotification(notification) {
  if (!notification) return null
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    taskId: notification.taskId ?? null,
    priority: notification.task?.priority ?? null,
    taskSuggestionId: notification.taskSuggestionId ?? null,
    conversationId: notification.conversationId ?? null,
    readAt: notification.readAt ?? null,
    createdAt: notification.createdAt ?? new Date().toISOString(),
  }
}

export function normalizeUser(user) {
  if (!user) return null
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName ?? '',
    email: user.email,
    bio: user.bio ?? '',
    avatarUrl: resolveAssetUrl(user.avatarUrl),
    // Kept because the routing needs it: without the role surviving
    // normalisation the client has no way to know an administrator is signing in,
    // so the console can only ever be reached by typing its URL. Defaults to
    // USER so a payload that somehow omits it can never read as an admin.
    role: user.role ?? 'USER',
  }
}

export function normalizeProfile(profile) {
  if (!profile) return null
  const onboardingStarted = Boolean(profile.onboardingStarted)
  const onboardingSkipped = Boolean(profile.onboardingSkipped)
  const onboardingCompleted = Boolean(profile.onboardingCompleted)
  return {
    preferredName: profile.preferredName || null,
    occupationOrRole: profile.occupationOrRole || null,
    workStyle: profile.workStyle || null,
    planningStyle: profile.planningStyle || null,
    preferredTaskOrganization: profile.preferredTaskOrganization || null,
    mostProductiveTime: profile.mostProductiveTime || null,
    breakPreference: profile.breakPreference || null,
    reminderPreference: profile.reminderPreference || null,
    difficultyStartingTasks: profile.difficultyStartingTasks || null,
    difficultyFinishingTasks: profile.difficultyFinishingTasks || null,
    preferredTaskDetailLevel: profile.preferredTaskDetailLevel || null,
    preferredAIResponseStyle: profile.preferredAIResponseStyle || null,
    aiProvider: profile.aiProvider || 'GEMINI',
    onboardingStarted,
    onboardingSkipped,
    onboardingCompleted,
    isNew: !(onboardingStarted || onboardingSkipped || onboardingCompleted),
  }
}

// A notification sound from GET /notifications/sounds. `path` is stored
// relative on the backend and resolved against the API origin here, so no
// component has to know the backend host.
export function normalizeNotificationSound(sound) {
  if (!sound?.id) return null
  return {
    id: sound.id,
    name: sound.name || '',
    path: resolveAssetUrl(sound.path),
    description: sound.description || '',
  }
}

export function normalizeSettings(settings = {}, notificationSettings = {}, notificationSound = null) {
  return {
    theme: settings.theme ?? 'LIGHT',
    language: settings.language ?? 'en',
    timezone: settings.timezone ?? '',
    compactMode: Boolean(settings.compactMode),
    showCompletedTasks: Boolean(settings.showCompletedTasks),
    // The backend resolves a missing choice to the default sound, so the
    // resolved object — not the raw id — is what decides what plays.
    notificationSound: normalizeNotificationSound(notificationSound),
    notifications: {
      taskReminders: Boolean(notificationSettings.taskReminders),
      deadlineReminders: Boolean(notificationSettings.deadlineReminders),
      projectUpdates: Boolean(notificationSettings.projectUpdates),
      aiSuggestions: Boolean(notificationSettings.aiSuggestions),
      dailySummary: Boolean(notificationSettings.dailySummary),
      emailNotifications: Boolean(notificationSettings.emailNotifications),
      pushNotifications: Boolean(notificationSettings.pushNotifications),
      // Absent means absent, not audible. The column defaults to false in the
      // database, so a payload that omits the key is an older or partial
      // response and must not be read as consent to make noise: silence is the
      // safe reading, and the toggle in Settings is one click from there.
      soundEnabled: notificationSettings.soundEnabled === true,
    },
  }
}

export function normalizeCommunityUser(user) {
  if (!user) return null
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName ?? '',
    email: user.email ?? '',
    bio: user.bio ?? '',
    avatarUrl: resolveAssetUrl(user.avatarUrl),
  }
}

export function normalizeFriend(friend) {
  if (!friend) return null
  return {
    id: friend.friendshipId,
    friendshipId: friend.friendshipId,
    userId: friend.user?.id,
    user: normalizeCommunityUser(friend.user),
    createdAt: friend.createdAt ?? null,
  }
}

export function normalizeFriendRequest(request) {
  if (!request) return null
  const person = request.sender ?? request.receiver
  return {
    id: request.id,
    senderId: request.senderId,
    receiverId: request.receiverId,
    status: request.status,
    createdAt: request.createdAt ?? null,
    user: person ? normalizeCommunityUser(person) : null,
  }
}

const CONVERSATION_COLORS = [
  '#4D3EC8',
  '#6659E2',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#0EA5E9',
  '#8B5CF6',
  '#64748B',
]

export function colorForText(value) {
  let hash = 0
  for (const char of String(value ?? '')) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  }
  return CONVERSATION_COLORS[hash % CONVERSATION_COLORS.length]
}

export function normalizeConversation(conversation) {
  if (!conversation) return null
  const members = (conversation.members || []).map((member) => ({
    id: member.id,
    firstName: member.firstName,
    lastName: member.lastName ?? '',
    email: member.email ?? '',
    avatarUrl: resolveAssetUrl(member.avatarUrl),
    role: member.role ?? 'MEMBER',
  }))
  const admin = members.find((member) => member.role === 'ADMIN')
  return {
    id: conversation.id,
    type: conversation.type,
    name: conversation.name ?? null,
    iconUrl: resolveAssetUrl(conversation.iconUrl),
    iconColor: colorForText(conversation.name ?? conversation.id),
    adminId: admin?.id ?? null,
    memberIds: members.map((member) => member.id),
    members,
    unread: Number(conversation.unread) || 0,
    // The list endpoint already returns the newest message per conversation.
    // It has to survive normalisation, because it is the only preview data
    // available on a cold start: data.chatMessages only fills once a
    // conversation has actually been opened in this session, so without this
    // every chat reads "No messages yet" until you click into it.
    lastMessage: normalizeChatMessage(conversation.lastMessage),
    lastMessageAt:
      conversation.lastMessageAt ??
      conversation.updatedAt ??
      conversation.createdAt ??
      null,
    createdAt: conversation.createdAt ?? null,
  }
}

export function normalizeChatReactions(reactions) {
  if (!Array.isArray(reactions)) return []
  return reactions
    .filter((reaction) => reaction && reaction.emoji)
    .map((reaction) => {
      // `user` is present on freshly fetched reactions. Older cached payloads
      // and rows written before identity was included only have userId, so the
      // caller can still fall back to its own directory lookup.
      const user = reaction.user ?? null
      return {
        id: reaction.id ?? null,
        userId: reaction.userId ?? user?.id ?? null,
        emoji: reaction.emoji,
        firstName: user?.firstName ?? reaction.firstName ?? null,
        lastName: user?.lastName ?? reaction.lastName ?? null,
        avatarUrl: user?.avatarUrl ?? reaction.avatarUrl ?? null,
      }
    })
}

export function normalizeChatMessage(message) {
  if (!message) return null

  // Messages created before the MessageAttachment table only have the legacy
  // scalar columns, so promote the first of those into the new array shape
  // instead of rendering an empty bubble.
  const attachments = Array.isArray(message.attachments) && message.attachments.length
    ? message.attachments
        .filter((attachment) => attachment && attachment.url)
        .map((attachment) => ({
          id: attachment.id ?? null,
          url: resolveAssetUrl(attachment.url),
          fileName: attachment.fileName ?? null,
          fileType: attachment.fileType ?? null,
          fileSize: attachment.fileSize ?? null,
          kind: attachment.kind ?? 'FILE',
        }))
    : message.attachmentUrl
      ? [
          {
            id: null,
            url: resolveAssetUrl(message.attachmentUrl),
            fileName: message.fileName ?? null,
            fileType: message.fileType ?? null,
            fileSize: message.fileSize ?? null,
            kind: message.type === 'IMAGE' ? 'IMAGE' : 'FILE',
          },
        ]
      : []

  const reactions = normalizeChatReactions(message.reactions)

  return {
    id: message.id,
    conversationId: message.conversationId,
    type: message.type,
    content: message.content ?? null,
    attachmentUrl: resolveAssetUrl(message.attachmentUrl),
    fileName: message.fileName ?? null,
    fileType: message.fileType ?? null,
    fileSize: message.fileSize ?? null,
    attachments,
    reactions,
    senderId: message.senderId ?? null,
    createdAt: message.createdAt ?? null,
  }
}

export function normalizeAiConversation(conversation) {
  if (!conversation) return null
  return {
    id: conversation.id,
    title: conversation.title ?? null,
    isSpeak: conversation.isSpeak === true,
    voiceId: conversation.voiceId ?? null,
    createdAt: conversation.createdAt ?? null,
    updatedAt: conversation.updatedAt ?? null,
  }
}

export function normalizeAiMessage(message) {
  if (!message) return null
  return {
    id: message.id,
    conversationId: message.conversationId,
    role: message.role,
    content: message.content,
    attachments: Array.isArray(message.attachments)
      ? message.attachments
          .filter((attachment) => attachment && attachment.url)
          .map((attachment) => ({
            url: attachment.url,
            fileName: attachment.fileName ?? null,
            fileType: attachment.fileType ?? null,
            fileSize: attachment.fileSize ?? null,
          }))
      : [],
    createdAt: message.createdAt ?? null,
  }
}