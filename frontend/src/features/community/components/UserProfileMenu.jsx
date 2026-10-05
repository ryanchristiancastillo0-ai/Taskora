import { Clock, User, UserMinus, UserPlus } from 'lucide-react'
import { useState } from 'react'
import Dropdown, { MenuItem, MenuSeparator } from '@/components/ui/Dropdown'
import { useApp } from '@/app/providers/AppContext'
import UserProfileModal from './UserProfileModal'
import { useUserProfile } from './useUserProfile'

export default function UserProfileMenu({
  userId,
  align = 'right',
  className = 'w-56',
  trigger,
  triggerClassName,
}) {
  const { actions, pushToast } = useApp()
  const [open, setOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const { relationship, pending, isSelf } = useUserProfile(userId)

  const run = (action) => {
    setBusy(true)
    Promise.resolve(action())
      .catch((error) =>
        pushToast(error?.message || 'Something went wrong. Please try again.', 'danger')
      )
      .finally(() => setBusy(false))
  }

  let friendItem = null
  if (relationship === 'FRIEND') {
    friendItem = (
      <MenuItem
        key="friend"
        icon={UserMinus}
        label="Remove friend"
        danger
        disabled={busy}
        onClick={() => run(() => actions.removeFriend(userId))}
      />
    )
  } else if (relationship === 'REQUEST_SENT') {
    friendItem = (
      <MenuItem key="friend" icon={Clock} label="Request sent" disabled />
    )
  } else if (relationship === 'REQUEST_RECEIVED') {
    friendItem = (
      <MenuItem
        key="friend"
        icon={UserPlus}
        label="Accept request"
        disabled={busy}
        onClick={() => run(() => actions.respondFriendRequest(pending.id, true))}
      />
    )
  } else if (relationship === 'NONE') {
    friendItem = (
      <MenuItem
        key="friend"
        icon={UserPlus}
        label="Add friend"
        disabled={busy}
        onClick={() => run(() => actions.sendFriendRequest(userId))}
      />
    )
  }

  // Flat array on purpose: Dropdown clones direct children to wire up
  // close-on-click, and a Fragment child would swallow the injected onClick.
  const items = []
  if (!isSelf) {
    items.push(
      <MenuItem
        key="view"
        icon={User}
        label="View full profile"
        onClick={() => setProfileOpen(true)}
      />
    )
    if (friendItem) items.push(<MenuSeparator key="sep" />)
  }
  if (friendItem) items.push(friendItem)

  return (
    <>
      <Dropdown
        open={open}
        onOpenChange={setOpen}
        align={align}
        className={className}
        triggerClassName={triggerClassName}
        trigger={trigger}
      >
        {items}
      </Dropdown>
      <UserProfileModal
        userId={userId}
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
      />
    </>
  )
}
