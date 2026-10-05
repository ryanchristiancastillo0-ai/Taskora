import { Camera, Check, MessagesSquare, Search, Users, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import Avatar from '@/components/ui/Avatar'
import Button from '@/components/ui/Button'
import GroupAvatar from '@/components/ui/GroupAvatar'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import { useApp } from '@/app/providers/AppContext'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { cx } from '@/utils/format'

export default function NewConversationModal({ open, onClose, initialMode, initialMemberIds }) {
  const { data, actions, pushToast } = useApp()
  const [mode, setMode] = useState('DIRECT')
  const [selected, setSelected] = useState([])
  const [name, setName] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [logo, setLogo] = useState(null)
  const [logoPreview, setLogoPreview] = useState(null)
  const [creating, setCreating] = useState(false)
  const logoInputRef = useRef(null)
  const debouncedQuery = useDebouncedValue(query, 300)

  const actionsRef = useRef(actions)
  useEffect(() => {
    actionsRef.current = actions
  }, [actions])

  const friends = data.friends.map((friend) => friend.user).filter(Boolean)
  const meId = data.user?.id

  const userById = (id) =>
    data.communityUsers.find((user) => user.id === id) ??
    friends.find((user) => user.id === id)

  useEffect(() => {
    if (!open) return
    setMode(initialMode === 'GROUP' ? 'GROUP' : 'DIRECT')
    setSelected(initialMode === 'GROUP' ? [...(initialMemberIds ?? [])] : [])
    setName('')
    setQuery('')
    setResults([])
    setSearchError('')
    setLogo(null)
    setLogoPreview((current) => {
      if (current) URL.revokeObjectURL(current)
      return null
    })
  }, [open, initialMode, initialMemberIds])

  // Group membership is open to any account, so this search reaches every user
  // rather than only the friend list.
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

  // Release the preview object URL when the modal goes away.
  useEffect(
    () => () => {
      if (logoPreview) URL.revokeObjectURL(logoPreview)
    },
    [logoPreview]
  )

  const hasQuery = debouncedQuery.trim().length > 0
  const candidates = (hasQuery ? results : friends).filter(
    (user) => user && user.id !== meId
  )

  const selectedMembers = selected
    .map((id) => userById(id))
    .filter(Boolean)

  const toggle = (userId) =>
    setSelected((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId]
    )

  const applyLogo = (file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      pushToast('Please choose an image', 'warn')
      return
    }
    setLogoPreview((current) => {
      if (current) URL.revokeObjectURL(current)
      return URL.createObjectURL(file)
    })
    setLogo(file)
  }

  const clearLogo = () => {
    setLogoPreview((current) => {
      if (current) URL.revokeObjectURL(current)
      return null
    })
    setLogo(null)
  }

  const close = () => {
    onClose()
  }

  const submit = async () => {
    if (mode === 'DIRECT') {
      if (selected.length !== 1) return
      actions.createDirectConversation(selected[0])
      pushToast('Conversation opened')
      close()
      return
    }

    const groupName = name.trim()
    if (!groupName || selected.length === 0) return

    setCreating(true)
    try {
      await actionsRef.current.createGroup({
        name: groupName,
        memberIds: selected,
        icon: logo,
      })
      close()
    } catch {
      // The action already surfaced the failure. Keep the modal open with the
      // name, members and logo intact so nothing has to be retyped.
    } finally {
      setCreating(false)
    }
  }

  const canSubmit =
    mode === 'DIRECT'
      ? selected.length === 1
      : name.trim().length > 0 && selected.length > 0

  return (
    <Modal
      open={open}
      onClose={close}
      title={mode === 'GROUP' ? 'Create group' : 'New conversation'}
      subtitle={
        mode === 'DIRECT'
          ? 'Pick anyone to message'
          : 'Name your group, add a logo and choose members'
      }
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={!canSubmit}
            loading={creating}
          >
            {mode === 'DIRECT' ? 'Start chat' : 'Create group'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex w-full rounded-lg bg-surface-container p-0.5">
          {[
            { value: 'DIRECT', label: 'Direct' },
            { value: 'GROUP', label: 'Group' },
          ].map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => {
                setMode(item.value)
                setSelected([])
                setQuery('')
              }}
              className={cx(
                'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors',
                mode === item.value
                  ? 'bg-surface-card text-ink shadow-card'
                  : 'text-ink-muted hover:text-ink'
              )}
            >
              {item.value === 'GROUP' ? (
                <Users className="size-4" strokeWidth={2} />
              ) : (
                <MessagesSquare className="size-4" strokeWidth={2} />
              )}
              {item.label}
            </button>
          ))}
        </div>

        {mode === 'GROUP' && (
          <>
            <Input
              label="Group name"
              required
              placeholder="e.g. Weekend hiking crew"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />

            <div className="flex items-center gap-3">
              {logoPreview ? (
                <img
                  src={logoPreview}
                  alt="Group logo preview"
                  className="size-16 flex-shrink-0 rounded-full object-cover"
                />
              ) : (
                <GroupAvatar
                  name={name}
                  members={selectedMembers}
                  className="size-16"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-ink">Group logo</p>
                <p className="text-[11px] text-ink-muted">
                  Optional. Leave it empty and the group shows everyone's
                  profile picture instead.
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={Camera}
                    onClick={() => logoInputRef.current?.click()}
                  >
                    {logoPreview ? 'Change' : 'Choose photo'}
                  </Button>
                  {logoPreview && (
                    <Button variant="ghost" size="sm" onClick={clearLogo}>
                      Remove
                    </Button>
                  )}
                </div>
              </div>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => {
                  applyLogo(event.target.files?.[0])
                  event.target.value = ''
                }}
              />
            </div>
          </>
        )}

        <Input
          icon={Search}
          placeholder="Search people by name or email..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />

        {selected.length > 0 && (
          <div>
            <p className="mb-2 text-[13px] font-medium text-ink-soft">
              {selected.length} selected
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {selectedMembers.map((user) => (
                <li key={user.id}>
                  <button
                    type="button"
                    onClick={() => toggle(user.id)}
                    className="flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-soft py-1 pl-1 pr-2 text-[12px] font-medium text-ink transition-colors hover:bg-surface-container"
                  >
                    <Avatar
                      name={`${user.firstName} ${user.lastName}`}
                      src={user.avatarUrl}
                      size="sm"
                      className="!size-5"
                    />
                    <span className="max-w-24 truncate">
                      {user.firstName} {user.lastName}
                    </span>
                    <X className="size-3 text-ink-faint" strokeWidth={2.5} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <p className="mb-2 text-[13px] font-medium text-ink-soft">
            {hasQuery ? 'Search results' : 'Your friends'}
          </p>
          <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            {candidates.map((user) => {
              const checked = selected.includes(user.id)
              const disabled = mode === 'DIRECT' && selected.length === 1 && !checked
              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => toggle(user.id)}
                  disabled={disabled}
                  className={cx(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                    checked ? 'bg-primary-soft' : 'hover:bg-surface-soft',
                    disabled && 'pointer-events-none opacity-40'
                  )}
                >
                  <span
                    className={cx(
                      'flex size-5 flex-shrink-0 items-center justify-center rounded-md border transition-colors',
                      checked
                        ? 'border-primary-container bg-primary-container text-white'
                        : 'border-border-subtle text-transparent'
                    )}
                  >
                    <Check className="size-3.5" strokeWidth={3} />
                  </span>
                  <Avatar
                    name={`${user.firstName} ${user.lastName}`}
                    src={user.avatarUrl}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">
                      {user.firstName} {user.lastName}
                    </span>
                    {hasQuery && user.relationship !== 'FRIEND' && (
                      <span className="block truncate text-[11px] text-ink-muted">
                        Not a friend
                      </span>
                    )}
                  </span>
                </button>
              )
            })}

            {!hasQuery && candidates.length === 0 && (
              <p className="px-2 py-4 text-center text-[13px] text-ink-faint">
                No friends yet. Search above to add anyone.
              </p>
            )}

            {hasQuery && searching && (
              <p className="px-2 py-4 text-center text-[13px] text-ink-faint">
                Searching...
              </p>
            )}

            {hasQuery && !searching && searchError && (
              <p className="px-2 py-4 text-center text-[13px] text-error">
                {searchError}
              </p>
            )}

            {hasQuery && !searching && !searchError && candidates.length === 0 && (
              <p className="px-2 py-4 text-center text-[13px] text-ink-faint">
                No one matches that search.
              </p>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
