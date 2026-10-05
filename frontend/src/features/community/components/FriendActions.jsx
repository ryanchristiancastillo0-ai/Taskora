import { Check, Clock, Send, User, UserMinus, UserPlus, Users, X } from 'lucide-react'
import IconButton from '@/components/ui/IconButton'
import { useApp } from '@/app/providers/AppContext'
import { cx } from '@/utils/format'
import { useUserProfile } from './useUserProfile'
import UserProfileMenu from './UserProfileMenu'

/**
 * The relationship controls for one person, wherever that person is on screen.
 *
 * The People list and the chat details panel both need "what can I do about this
 * person", and the answer depends on a relationship that lives in the store
 * (friend, request sent, request received, none) - so the decision is derived
 * here once, from `useUserProfile`, instead of being re-implemented per list.
 * Callers supply only what is local to them: how to open a direct chat and how
 * to start a group with this person.
 */
export default function FriendActions({
  userId,
  onMessage,
  onAddToGroup,
  size = 'sm',
  className,
}) {
  const { actions } = useApp()
  const { name, relationship, pending } = useUserProfile(userId)

  const button = (icon, label, onClick, extra = {}) => (
    <IconButton
      icon={icon}
      label={label}
      size={size}
      onClick={onClick}
      {...extra}
    />
  )

  let primary
  if (relationship === 'FRIEND') {
    primary = button(UserMinus, `Remove ${name} as a friend`, () => actions.removeFriend(userId), {
      className: 'hover:text-error',
    })
  } else if (relationship === 'REQUEST_SENT') {
    // Mirrors the old People list: a sent request shows as a waiting state
    // rather than a second, conflicting way to change the relationship.
    primary = button(Clock, 'Friend request sent', undefined, { disabled: true })
  } else if (relationship === 'REQUEST_RECEIVED' && pending) {
    primary = (
      <>
        {button(Check, `Accept ${name}'s request`, () =>
          actions.respondFriendRequest(pending.id, true)
        )}
        {button(X, `Decline ${name}'s request`, () =>
          actions.respondFriendRequest(pending.id, false)
        )}
      </>
    )
  } else {
    primary = button(UserPlus, `Add ${name} as a friend`, () =>
      actions.sendFriendRequest(userId)
    )
  }

  return (
    <div className={cx('flex shrink-0 items-center gap-0.5', className)}>
      {primary}
      {onAddToGroup && relationship === 'FRIEND' && (
        <IconButton
          icon={Users}
          label={`Add ${name} to a new group`}
          size={size}
          onClick={() => onAddToGroup(userId)}
        />
      )}
      {onMessage && (
        <IconButton icon={Send} label={`Message ${name}`} size={size} onClick={onMessage} />
      )}
      <UserProfileMenu
        userId={userId}
        align="right"
        trigger={<IconButton icon={User} label={`${name}'s profile`} size={size} />}
      />
    </div>
  )
}
