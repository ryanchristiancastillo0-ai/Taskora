import { useApp } from '../../context/AppContext'

export const RELATIONSHIP_STATUS = {
  SELF: 'This is you',
  FRIEND: 'Friends',
  REQUEST_SENT: 'Request sent',
  REQUEST_RECEIVED: 'Wants to connect',
  NONE: 'Not connected',
}

export const RELATIONSHIP_TONE = {
  SELF: 'slate',
  FRIEND: 'green',
  REQUEST_SENT: 'amber',
  REQUEST_RECEIVED: 'indigo',
  NONE: 'muted',
}

// Other users only ever reach the client with these fields — there is no
// "get user by id" endpoint, so a full profile is limited to them.
export function useUserProfile(userId) {
  const { data } = useApp()
  const meId = data.user?.id

  const user =
    data.communityUsers.find((item) => item.id === userId) ??
    data.friends.find((friend) => friend.userId === userId)?.user ??
    data.friendRequests.find(
      (request) =>
        request.senderId === userId || request.receiverId === userId
    )?.user ??
    null

  const isFriend = data.friends.some((friend) => friend.userId === userId)

  const pending = data.friendRequests.find(
    (request) =>
      request.status === 'PENDING' &&
      ((request.senderId === meId && request.receiverId === userId) ||
        (request.receiverId === meId && request.senderId === userId))
  )

  let relationship = 'NONE'
  if (userId === meId) relationship = 'SELF'
  else if (isFriend) relationship = 'FRIEND'
  else if (pending) {
    relationship = pending.senderId === meId ? 'REQUEST_SENT' : 'REQUEST_RECEIVED'
  }

  return {
    user,
    name: user ? `${user.firstName} ${user.lastName}`.trim() : 'Unknown user',
    email: user?.email ?? '',
    bio: user?.bio ?? '',
    avatarUrl: user?.avatarUrl ?? null,
    relationship,
    status: RELATIONSHIP_STATUS[relationship],
    tone: RELATIONSHIP_TONE[relationship],
    isFriend,
    isSelf: relationship === 'SELF',
    pending,
  }
}
