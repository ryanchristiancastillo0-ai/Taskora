import { Check, Search, UserPlus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import Avatar from '@/shared/components/ui/Avatar'
import Button from '@/shared/components/ui/Button'
import Input from '@/shared/components/ui/Input'
import Modal from '@/shared/components/ui/Modal'
import { useApp } from '../../context/AppContext'
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue'

// Lets a group admin pull in any registered user, not just existing friends.
export default function AddMemberModal({ open, onClose, conversation }) {
  const { data, actions, pushToast } = useApp()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [addingId, setAddingId] = useState(null)

  const actionsRef = useRef(actions)
  const debouncedQuery = useDebouncedValue(query, 300)

  useEffect(() => {
    actionsRef.current = actions
  }, [actions])

  useEffect(() => {
    if (!open) {
      setQuery('')
      setResults([])
      setSearchError('')
      setAddingId(null)
    }
  }, [open])

  useEffect(() => {
    if (!open || !debouncedQuery.trim()) {
      setResults([])
      setSearching(false)
      setSearchError('')
      return
    }

    let cancelled = false
    setSearching(true)
    setSearchError('')
    actionsRef.current
      .searchPeople(debouncedQuery)
      .then((found) => {
        if (!cancelled) setResults(found || [])
      })
      .catch((error) => {
        if (cancelled) return
        setResults([])
        setSearchError(error?.message || 'Search failed. Please try again.')
      })
      .finally(() => {
        if (!cancelled) setSearching(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, debouncedQuery])

  // Anyone already in the group cannot be added again, and you cannot add
  // yourself, so both are filtered out of the picker entirely.
  const candidates = useMemo(() => {
    const memberIds = new Set(conversation?.memberIds ?? [])
    return results.filter(
      (user) => user.id !== data.user?.id && !memberIds.has(user.id)
    )
  }, [results, conversation, data.user])

  const add = async (userId) => {
    setAddingId(userId)
    try {
      await actionsRef.current.addGroupMember(conversation.id, userId)
      setResults((current) => current.filter((user) => user.id !== userId))
      pushToast('Member added to the group')
    } catch {
      // The action already surfaced the failure.
    } finally {
      setAddingId(null)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add member"
      subtitle={`Anyone with an account can join ${conversation?.name ?? 'this group'}`}
      footer={
        <Button variant="ghost" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <Input
          icon={Search}
          autoFocus
          placeholder="Search people by name or email..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />

        <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
          {candidates.map((user) => (
            <button
              key={user.id}
              type="button"
              disabled={addingId !== null}
              onClick={() => add(user.id)}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-surface-soft disabled:opacity-50"
            >
              <Avatar
                name={`${user.firstName} ${user.lastName}`}
                src={user.avatarUrl}
                size="sm"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">
                  {user.firstName} {user.lastName}
                </span>
                <span className="block truncate text-[11px] text-ink-muted">
                  {user.relationship === 'FRIEND'
                    ? 'Friend'
                    : user.email}
                </span>
              </span>
              {addingId === user.id ? (
                <span className="text-[11px] font-medium text-primary">
                  Adding...
                </span>
              ) : (
                <span className="flex size-6 items-center justify-center rounded-full bg-primary-soft text-primary">
                  {user.relationship === 'FRIEND' ? (
                    <Check className="size-3.5" strokeWidth={2.5} />
                  ) : (
                    <UserPlus className="size-3.5" strokeWidth={2} />
                  )}
                </span>
              )}
            </button>
          ))}

          {!debouncedQuery.trim() && (
            <p className="px-2 py-6 text-center text-[13px] text-ink-faint">
              Search for anyone to add them, friends or not.
            </p>
          )}

          {debouncedQuery.trim() && searching && (
            <p className="px-2 py-6 text-center text-[13px] text-ink-faint">
              Searching...
            </p>
          )}

          {debouncedQuery.trim() && !searching && searchError && (
            <p className="px-2 py-6 text-center text-[13px] text-error">
              {searchError}
            </p>
          )}

          {debouncedQuery.trim() && !searching && !searchError && candidates.length === 0 && (
            <p className="px-2 py-6 text-center text-[13px] text-ink-faint">
              No one found. Everyone matching is already in the group.
            </p>
          )}
        </div>

        <p className="text-[11px] text-ink-faint">
          Members can see each other and read the group's messages.
        </p>
      </div>
    </Modal>
  )
}
