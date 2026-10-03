import { api } from '@/shared/api/client'

export function createNotificationActions({ setData }) {
  const markNotificationRead = (id) => {
    api.patch(`/notifications/${id}/read`).catch(() => {})
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
    api.patch('/notifications/read-all').catch(() => {})
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
