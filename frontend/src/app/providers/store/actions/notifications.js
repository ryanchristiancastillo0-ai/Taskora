import { notificationsApi } from '@/features/user/notifications/api/notificationsApi'

export function createNotificationActions({ setData }) {
  const markNotificationRead = (id) => {
    notificationsApi.markRead(id).catch(() => {})
    setData((prev) => ({
      ...prev,
      notifications: prev.notifications.map((notification) =>
        notification.id === id
          ? { ...notification, readAt: new Date().toISOString() }
          : notification
      ),
    }))
  }

  const markAllNotificationsRead = () => {
    notificationsApi.markAllRead().catch(() => {})
    setData((prev) => ({
      ...prev,
      notifications: prev.notifications.map((notification) => ({
        ...notification,
        readAt: notification.readAt ?? new Date().toISOString(),
      })),
    }))
  }

  return { markNotificationRead, markAllNotificationsRead }
}
