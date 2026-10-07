const { z } = require("zod");
const { stringId } = require("../../utils/validate.js");

const updateSettingsSchema = z
  .object({
    theme: z.enum(["LIGHT", "DARK", "SYSTEM"]).optional(),
    language: z.string().trim().min(2).max(10).optional(),
    timezone: z.string().trim().min(1).max(100).optional(),
    compactMode: z.boolean().optional(),
    showCompletedTasks: z.boolean().optional(),
  })
  .strict();

const updateNotificationSettingsSchema = z
  .object({
    taskReminders: z.boolean().optional(),
    deadlineReminders: z.boolean().optional(),
    projectUpdates: z.boolean().optional(),
    aiSuggestions: z.boolean().optional(),
    dailySummary: z.boolean().optional(),
    emailNotifications: z.boolean().optional(),
    pushNotifications: z.boolean().optional(),
    // Master switch for the alert tone. Independent of the selected clip, so
    // muting and choosing a sound never overwrite each other.
    soundEnabled: z.boolean().optional(),
    // Reference to a NotificationSound row. Null clears the selection, which
    // puts the user back on the default sound.
    notificationSoundId: stringId.nullable().optional(),
  })
  .strict();

// Body of POST /settings/notifications/push/subscribe. The browser's
// PushSubscription exposes exactly these three fields; anything else is a
// validation failure rather than silently stored.
const pushSubscribeSchema = z
  .object({
    endpoint: z.string().trim().url().max(500),
    keys: z
      .object({
        p256dh: z.string().trim().min(1).max(500),
        auth: z.string().trim().min(1).max(500),
      })
      .strict(),
    userAgent: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

// Body of DELETE /settings/notifications/push/subscribe.
const pushUnsubscribeSchema = z
  .object({
    endpoint: z.string().trim().url().max(500),
  })
  .strict();

module.exports = {
  updateSettingsSchema,
  updateNotificationSettingsSchema,
  pushSubscribeSchema,
  pushUnsubscribeSchema,
};