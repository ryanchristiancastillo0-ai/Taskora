import { Clock, Mail, UserMinus, UserPlus } from 'lucide-react'
import { useState } from 'react'
import Avatar from '@/components/ui/Avatar'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { useApp } from '@/app/providers/AppContext'
import { useUserProfile } from './useUserProfile'

export default function UserProfileModal({ userId, open, onClose }) {
  const { actions, pushToast } = useApp()
  const [busy, setBusy] = useState(false)
  const { name, email, bio, avatarUrl, relationship, status, tone, isSelf, pending } =
    useUserProfile(userId)

  const run = (action) => {
    setBusy(true)
    Promise.resolve(action())
      .catch((error) =>
        pushToast(error?.message || 'Something went wrong. Please try again.', 'danger')
      )
      .finally(() => setBusy(false))
  }

  let action = null
  if (relationship === 'FRIEND') {
    action = (
      <Button
        variant="secondary"
        icon={UserMinus}
        fullWidth
        loading={busy}
        onClick={() => run(() => actions.removeFriend(userId))}
      >
        Remove friend
      </Button>
    )
  } else if (relationship === 'REQUEST_SENT') {
    action = (
      <Button variant="secondary" icon={Clock} fullWidth disabled>
        Friend request sent
      </Button>
    )
  } else if (relationship === 'REQUEST_RECEIVED') {
    action = (
      <Button
        icon={UserPlus}
        fullWidth
        loading={busy}
        onClick={() => run(() => actions.respondFriendRequest(pending.id, true))}
      >
        Accept request
      </Button>
    )
  } else if (relationship === 'NONE') {
    action = (
      <Button
        icon={UserPlus}
        fullWidth
        loading={busy}
        onClick={() => run(() => actions.sendFriendRequest(userId))}
      >
        Add friend
      </Button>
    )
  }

  return (
    <Modal open={open} onClose={onClose} title="Profile" size="sm">
      <div className="flex flex-col items-center text-center">
        <Avatar name={name} src={avatarUrl} size="xl" />
        <h2 className="mt-3 text-lg font-semibold text-ink">{name}</h2>
        {email && (
          <p className="mt-1 flex items-center gap-1.5 text-[13px] text-ink-muted">
            <Mail className="size-3.5 flex-shrink-0" strokeWidth={2} />
            <span className="truncate">{email}</span>
          </p>
        )}
        {!isSelf && <Badge tone={tone} className="mt-3">{status}</Badge>}

        <div className="mt-5 w-full rounded-xl bg-surface-soft p-4 text-left">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            Bio
          </p>
          {bio ? (
            <p className="mt-1.5 text-[13px] leading-relaxed whitespace-pre-line text-ink-soft">
              {bio}
            </p>
          ) : (
            <p className="mt-1.5 text-[13px] text-ink-faint">
              {isSelf ? 'You have not added a bio yet.' : 'No bio yet.'}
            </p>
          )}
        </div>
      </div>

      {action && <div className="mt-5">{action}</div>}
    </Modal>
  )
}
