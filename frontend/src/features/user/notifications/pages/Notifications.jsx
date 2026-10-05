import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CalendarClock,
  CheckCheck,
  MessagesSquare,
  RefreshCw,
  Sparkles,
  UserPlus,
} from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import PriorityDot from '@/components/ui/PriorityDot'
import { useApp } from '@/app/providers/AppContext'
import { cx, notificationPriority, timeAgo } from '@/utils/format'

const typeIcon = {
  TASK_DUE: { icon: CalendarClock, className: 'bg-warning-soft text-warning' },
  TASK_DUE_SOON: { icon: CalendarClock, className: 'bg-amber-50 text-amber-600' },
  TASK_OVERDUE: { icon: CalendarClock, className: 'bg-danger-soft text-danger' },
  AI_SUGGESTION: { icon: Sparkles, className: 'bg-primary-soft text-primary' },
  FRIEND_REQUEST: { icon: UserPlus, className: 'bg-emerald-50 text-emerald-600' },
  NEW_MESSAGE: { icon: MessagesSquare, className: 'bg-sky-50 text-sky-600' },
  TASK_PATTERN_SUGGESTION: { icon: RefreshCw, className: 'bg-primary-soft text-primary' },
}

export default function NotificationsPage() {
  const { data, actions } = useApp()
  const navigate = useNavigate()
  const [resolved, setResolved] = useState({})
  const [busy, setBusy] = useState(null)

  const notifications = [...data.notifications].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  )
  const unread = notifications.filter((notification) => !notification.readAt).length

  // Deep link straight into the conversation that produced the notification.
  // Set before navigating, matching the sidebar chat-head shortcut.
  const openChat = (notification) => {
    if (!notification.conversationId) return
    if (!notification.readAt) actions.markNotificationRead(notification.id)
    actions.openConversation(notification.conversationId)
    navigate('/community')
  }

  const respond = (notification, outcome) => {
    setBusy(notification.taskSuggestionId)
    const request =
      outcome === 'accept'
        ? actions.acceptSuggestion(notification.taskSuggestionId)
        : actions.skipSuggestion(notification.taskSuggestionId)

    request
      .then(() => {
        setResolved((current) => ({
          ...current,
          [notification.taskSuggestionId]: outcome,
        }))
        if (!notification.readAt) actions.markNotificationRead(notification.id)
      })
      .finally(() => setBusy(null))
  }

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle={`${unread} unread ${unread === 1 ? 'notification' : 'notifications'}`}
        actions={
          unread > 0 ? (
            <Button variant="soft" icon={CheckCheck} onClick={actions.markAllNotificationsRead}>
              Mark all read
            </Button>
          ) : null
        }
      />

      <div className="flex flex-col gap-2.5">
        {notifications.map((notification) => {
          const meta = typeIcon[notification.type] ?? typeIcon.TASK_DUE
          const Icon = meta.icon
          const read = !!notification.readAt
          const dotPriority = notificationPriority(notification, data.tasks)
          const isSuggestion = notification.type === 'TASK_PATTERN_SUGGESTION'
          const outcome = isSuggestion
            ? resolved[notification.taskSuggestionId]
            : null

          return (
            <div
              key={notification.id}
              role={isSuggestion ? undefined : 'button'}
              tabIndex={isSuggestion ? undefined : 0}
              onClick={() => {
                if (!isSuggestion && !read) actions.markNotificationRead(notification.id)
              }}
              onKeyDown={(event) => {
                if (!isSuggestion && (event.key === 'Enter' || event.key === ' ') && !read) {
                  actions.markNotificationRead(notification.id)
                }
              }}
              className={cx(
                'group flex items-start gap-4 rounded-card border px-5 py-4 text-left transition-colors',
                isSuggestion
                  ? 'border-primary-container/40 bg-primary-soft/40'
                  : read
                    ? 'border-border-subtle bg-surface-card hover:bg-surface-soft'
                    : 'border-primary-container/30 bg-primary-soft/40 hover:bg-primary-soft/70'
              )}
            >
              <div
                className={cx(
                  'mt-0.5 flex size-9 flex-shrink-0 items-center justify-center rounded-lg',
                  meta.className
                )}
              >
                <Icon className="size-[18px]" strokeWidth={2} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="text-sm font-semibold text-ink">{notification.title}</p>
                  {dotPriority && <PriorityDot priority={dotPriority} />}
                  {!read && (
                    <span className="size-2 flex-shrink-0 rounded-full bg-primary-container" />
                  )}
                </div>
                <p className="mt-0.5 text-[13px] leading-relaxed text-ink-soft">
                  {notification.message}
                </p>
                <p className="mt-1.5 text-[11px] text-ink-faint">
                  {timeAgo(notification.createdAt)}
                </p>

                {isSuggestion && (
                  <div className="mt-3 flex items-center gap-2">
                    {outcome === 'accepted' && (
                      <Badge tone="green">Added to your tasks</Badge>
                    )}
                    {outcome === 'skipped' && (
                      <Badge tone="muted">Skipped</Badge>
                    )}
                    {!outcome && (
                      <>
                        <Button
                          size="sm"
                          loading={busy === notification.taskSuggestionId}
                          disabled={busy !== null}
                          onClick={() => respond(notification, 'accept')}
                        >
                          Add Task
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busy !== null}
                          onClick={() => respond(notification, 'skip')}
                        >
                          Skip
                        </Button>
                      </>
                    )}
                  </div>
                )}

                {!isSuggestion && notification.conversationId && (
                  <div className="mt-3">
                    <Button
                      size="sm"
                      variant="soft"
                      icon={MessagesSquare}
                      onClick={(event) => {
                        event.stopPropagation()
                        openChat(notification)
                      }}
                    >
                      View chat
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}