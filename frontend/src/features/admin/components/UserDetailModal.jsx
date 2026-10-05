import { Mail, Sparkles, ListTodo, FolderKanban, Target, Repeat, Shield } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Badge from '@/components/ui/Badge'
import Avatar from '@/components/ui/Avatar'
import ProgressBar from '@/components/ui/ProgressBar'
import { ACCOUNT_STATUS, ACTIVITY_STATUS } from '@/constants'
import { formatDate, timeAgo } from '@/utils/format'

const COUNTS = [
  { key: 'tasks', label: 'Tasks', icon: ListTodo },
  { key: 'projects', label: 'Projects', icon: FolderKanban },
  { key: 'notes', label: 'Notes', icon: Mail },
  { key: 'goals', label: 'Goals', icon: Target },
  { key: 'habits', label: 'Habits', icon: Repeat },
]

function Field({ label, value }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{label}</p>
      <p className="mt-0.5 text-[13px] text-ink">{value}</p>
    </div>
  )
}

// Read-only detail view for one account. Opened from the users table; every
// mutating control stays in the table's action menu so there is exactly one
// place a destructive action can be started from.
export default function UserDetailModal({ user, onClose }) {
  if (!user) return null

  const account = ACCOUNT_STATUS[user.status] || ACCOUNT_STATUS.ACTIVE
  const activity = ACTIVITY_STATUS[user.activity] || ACTIVITY_STATUS.INACTIVE
  const maxCount = Math.max(...COUNTS.map((item) => user[item.key] || 0), 1)

  return (
    <Modal
      open
      onClose={onClose}
      title={user.name}
      subtitle={user.email}
      size="md"
      footer={null}
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-4">
          <Avatar name={user.name} src={user.avatarUrl} size="xl" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={user.role === 'ADMIN' ? 'indigo' : 'muted'}>
                {user.role === 'ADMIN' ? 'Administrator' : 'User'}
              </Badge>
              <Badge tone={account.tone}>{account.label}</Badge>
              <Badge tone={activity.tone} dot>
                {activity.label}
              </Badge>
            </div>
            {user.bio && (
              <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">{user.bio}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 rounded-card bg-surface-soft p-4 sm:grid-cols-3">
          <Field label="Joined" value={formatDate(user.joinedAt, 'long')} />
          <Field
            label="Last active"
            value={user.lastActiveAt ? timeAgo(user.lastActiveAt) : 'Never signed in'}
          />
          <Field label="AI provider" value={user.aiProvider === 'GEMINI' ? 'Gemini' : 'OpenRouter'} />
        </div>

        <div>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            Workspace usage
          </p>
          <div className="flex flex-col gap-2.5">
            {COUNTS.map((item) => (
              <div key={item.key} className="flex items-center gap-3">
                <item.icon className="size-4 flex-shrink-0 text-ink-faint" strokeWidth={2} />
                <span className="w-24 flex-shrink-0 text-[13px] text-ink-soft">{item.label}</span>
                <div className="min-w-0 flex-1">
                  <ProgressBar value={user[item.key] || 0} max={maxCount} />
                </div>
                <span className="w-8 flex-shrink-0 text-right text-[13px] font-semibold tabular-nums text-ink">
                  {user[item.key] || 0}
                </span>
              </div>
            ))}
          </div>
        </div>

        {!user.onboardingCompleted && (
          <p className="flex items-start gap-2 rounded-card bg-warning-soft p-3 text-[13px] leading-relaxed text-ink-soft">
            <Sparkles className="mt-0.5 size-4 flex-shrink-0 text-warning" strokeWidth={2} />
            This account has not finished onboarding, so some of its numbers are still empty.
          </p>
        )}

        {user.role === 'ADMIN' && (
          <p className="flex items-start gap-2 rounded-card bg-primary-soft p-3 text-[13px] leading-relaxed text-ink-soft">
            <Shield className="mt-0.5 size-4 flex-shrink-0 text-primary" strokeWidth={2} />
            Administrators can view and suspend every account on this platform.
          </p>
        )}
      </div>
    </Modal>
  )
}
