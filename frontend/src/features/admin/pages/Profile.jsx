import { useState } from 'react'
import { AtSign, ShieldCheck, SlidersHorizontal, User } from 'lucide-react'
import PageHeader from '@/shared/components/layouts/PageHeader'
import Button from '@/shared/components/ui/Button'
import Card, { CardHeader } from '@/shared/components/ui/Card'
import AvatarPicker from '@/shared/components/ui/AvatarPicker'
import Badge from '@/shared/components/ui/Badge'
import Input from '@/shared/components/ui/Input'
import Modal from '@/shared/components/ui/Modal'
import Select from '@/shared/components/ui/Select'
import Textarea from '@/shared/components/ui/Textarea'
import { useApp } from '../../user/context/AppContext'
import {
  AI_PROVIDER_OPTIONS,
  AI_RESPONSE_STYLES,
  BREAK_PREFERENCES,
  DIFFICULTY_LEVELS,
  PLANNING_STYLES,
  REMINDER_PREFERENCES,
  TIME_OF_DAY,
  WORK_STYLES,
  userRoleMeta,
} from '@/shared/constants'
import { cx, formatDate } from '@/shared/utils/format'

/**
 * The signed-in admin's own profile.
 *
 * Deliberately thin. This is the account page reached through the admin shell,
 * not a second profile system: the fields are the ones /users/me accepts and the
 * save goes through the existing updateUser action. Email is shown but not
 * editable here - changing it needs a verification code through the account
 * flow, so a free-text box would only produce a dead end.
 */
export default function AdminProfile() {
  const { data, actions, pushToast } = useApp()
  const user = data.user

  // The provider hydrates asynchronously, so there is a first render with no
  // user at all. Rendering nothing until it arrives also means the form below
  // always mounts with a real user, which is what lets it initialise its state
  // from props instead of syncing them in an effect.
  if (!user) return null

  const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email

  return (
    <>
      <PageHeader
        title="Profile"
        subtitle="Your own account, as it appears across Taskora."
      />

      <Card>
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <AvatarPicker
            name={displayName}
            src={user.avatarUrl}
            size="xl"
            caption="Click the photo to change it"
            onSave={(file) => actions.uploadAvatar(file)}
            onRemove={() => actions.removeAvatar()}
            pushToast={pushToast}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-semibold text-ink">{displayName}</h2>
              {user.role && (
                <Badge tone={userRoleMeta(user.role)?.tone ?? 'slate'}>
                  {userRoleMeta(user.role)?.label ?? user.role}
                </Badge>
              )}
            </div>
            <p className="mt-0.5 truncate text-[13px] text-ink-muted">{user.email}</p>
            {user.createdAt && (
              <p className="mt-1 text-[12px] text-ink-faint">
                Member since {formatDate(user.createdAt)}
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* items-start, because the default stretch makes the shorter column's
          card grow to the height of the taller one — the personal details card
          was being pulled down to match the three cards beside it and left a
          tall empty panel under its Save button. */}
      <div className="mt-4 grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <ProfileForm user={user} />

        <div className="space-y-4">
          <PersonalisationCard />

          <Card>
            <CardHeader
              title="Sign-in"
              subtitle="The one field that cannot be edited here."
              icon={AtSign}
            />
            <div className="space-y-3">
              <div>
                <p className="text-[12px] font-medium text-ink-faint">Email address</p>
                {/* An address has no spaces to wrap on, so a long one is clipped
                    on a narrow screen instead of breaking. */}
                <p className="mt-0.5 break-words text-[13px] text-ink">{user.email}</p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">
                  Changing it sends a verification code to the new address. Use the
                  email change flow on your account page, which confirms the address
                  before letting you sign in with it.
                </p>
              </div>
              <div className="border-t border-border-subtle pt-3">
                <p className="text-[12px] font-medium text-ink-faint">Password</p>
                <p className="mt-0.5 text-[13px] text-ink-muted">
                  Managed from your account security settings.
                </p>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Admin access"
              subtitle="What this account can reach."
              icon={ShieldCheck}
            />
            <div className="space-y-3 text-[13px] leading-relaxed text-ink-muted">
              <p>
                Your role is{' '}
                <span className="font-medium text-ink">
                  {userRoleMeta(user.role)?.label ?? user.role ?? 'User'}
                </span>
                , which lets you open the console at{' '}
                <span className="font-medium text-ink">/admin</span>.
              </p>
              <p>
                The console can change another account&apos;s role or suspend it. It
                cannot change your own role or status - that guard lives in the API,
                not just in this interface.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}

/**
 * Editable half of the profile.
 *
 * Only ever mounted with a real `user`, so the state initialiser can read it
 * directly. `dirty` is compared against the record rather than tracked with a
 * separate flag, which means a rejected save cannot leave the button stuck on.
 *
 * The avatar is deliberately not a field here. It is an upload, not a URL to
 * retype, and it has its own staged-then-committed picker on the card above —
 * which also keeps this form's payload inside the fields PATCH /users/me
 * actually accepts.
 */
function ProfileForm({ user }) {
  const { actions, pushToast } = useApp()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(() => ({
    firstName: user.firstName ?? '',
    lastName: user.lastName ?? '',
    bio: user.bio ?? '',
  }))

  const set = (key) => (event) =>
    setForm((previous) => ({ ...previous, [key]: event.target.value }))

  const dirty =
    form.firstName !== (user.firstName ?? '') ||
    form.lastName !== (user.lastName ?? '') ||
    form.bio !== (user.bio ?? '')

  const save = async () => {
    setSaving(true)
    try {
      await actions.updateUser({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        bio: form.bio.trim(),
      })
      pushToast('Profile updated')
    } catch (error) {
      pushToast(error.message || 'Could not save your profile', 'danger')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader
        title="Personal details"
        subtitle="How you appear to other people."
        icon={User}
      />
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="First name"
            value={form.firstName}
            onChange={set('firstName')}
            placeholder="First name"
          />
          <Input
            label="Last name"
            value={form.lastName}
            onChange={set('lastName')}
            placeholder="Last name"
          />
        </div>
        <Textarea
          label="Bio"
          value={form.bio}
          onChange={set('bio')}
          rows={4}
          placeholder="A sentence about what you do."
        />
        <div className="flex items-center justify-end gap-3 border-t border-border-subtle pt-4">
          {dirty && !saving && (
            <span className="text-[12px] text-ink-faint">Unsaved changes</span>
          )}
          <Button onClick={save} disabled={!dirty || saving} loading={saving} icon={User}>
            Save changes
          </Button>
        </div>
      </div>
    </Card>
  )
}

// Every field the wizard collects, so clearing one and saving really does clear
// it. A value left out of the payload is never sent, which is why an empty
// preferred name is dropped instead of sent: the validator requires one, so
// there is no version of "save" that empties the field.
const EMPTY_PREFS = {
  preferredName: '',
  occupationOrRole: '',
  workStyle: '',
  planningStyle: '',
  mostProductiveTime: '',
  breakPreference: '',
  reminderPreference: '',
  difficultyStartingTasks: '',
  preferredAIResponseStyle: '',
  aiProvider: 'GEMINI',
}

/**
 * The admin's own personalisation.
 *
 * Onboarding collects these for everybody else but is skipped for this role, so
 * before this card an admin was the one account whose preferences could be
 * neither seen nor changed anywhere in the UI. It mirrors the Personalisation
 * card on the user profile - same rows, same options, same PATCH /profile save -
 * so the two accounts are not maintained as separate systems.
 *
 * Read-only until Edit is pressed, and the form is only ever mounted with real
 * values: the state is filled at open time rather than initialised from props,
 * so a profile that hydrates after the first render cannot leave the form blank.
 */
function PersonalisationCard() {
  const { data, actions, pushToast } = useApp()
  const profile = data.profile
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [prefs, setPrefs] = useState(EMPTY_PREFS)

  const openPrefs = () => {
    setPrefs({
      preferredName: profile?.preferredName ?? '',
      occupationOrRole: profile?.occupationOrRole ?? '',
      workStyle: profile?.workStyle ?? '',
      planningStyle: profile?.planningStyle ?? '',
      mostProductiveTime: profile?.mostProductiveTime ?? '',
      breakPreference: profile?.breakPreference ?? '',
      reminderPreference: profile?.reminderPreference ?? '',
      difficultyStartingTasks: profile?.difficultyStartingTasks ?? '',
      preferredAIResponseStyle: profile?.preferredAIResponseStyle ?? '',
      aiProvider: profile?.aiProvider ?? 'GEMINI',
    })
    setOpen(true)
  }

  const savePrefs = async () => {
    setSaving(true)
    const patch = {
      occupationOrRole: prefs.occupationOrRole,
      workStyle: prefs.workStyle,
      planningStyle: prefs.planningStyle,
      mostProductiveTime: prefs.mostProductiveTime,
      breakPreference: prefs.breakPreference,
      reminderPreference: prefs.reminderPreference,
      difficultyStartingTasks: prefs.difficultyStartingTasks,
      preferredAIResponseStyle: prefs.preferredAIResponseStyle,
      aiProvider: prefs.aiProvider,
    }
    if (prefs.preferredName.trim()) patch.preferredName = prefs.preferredName.trim()

    try {
      await actions.updateProfile(patch)
      setOpen(false)
      pushToast('Preferences updated')
    } catch (error) {
      pushToast(error.message || 'Could not save your preferences', 'danger')
    } finally {
      setSaving(false)
    }
  }

  const setPref = (key) => (event) => setPrefs({ ...prefs, [key]: event.target.value })

  return (
    <>
      <Card>
        <CardHeader
          title="Personalisation"
          subtitle="How the assistant plans and talks with you."
          icon={SlidersHorizontal}
          actions={
            <Button variant="secondary" icon={SlidersHorizontal} onClick={openPrefs}>
              Edit
            </Button>
          }
        />
        <div className="divide-y divide-border-subtle">
          <PrefRow label="Preferred name" value={profile?.preferredName} />
          <PrefRow label="Role" value={profile?.occupationOrRole} />
          <PrefRow label="Work style" value={profile?.workStyle} />
          <PrefRow label="Planning style" value={profile?.planningStyle} />
          <PrefRow label="Most productive time" value={profile?.mostProductiveTime} />
          <PrefRow label="Reminder preference" value={profile?.reminderPreference} />
          <PrefRow label="AI response style" value={profile?.preferredAIResponseStyle} />
          <PrefRow label="AI provider" value={profile?.aiProvider} />
        </div>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Preferences">
        <form className="flex flex-col gap-4" onSubmit={(event) => event.preventDefault()}>
          <Input
            label="Preferred name"
            placeholder="How the assistant should call you"
            value={prefs.preferredName}
            onChange={setPref('preferredName')}
          />
          <Input
            label="Role"
            placeholder="e.g. Platform administrator"
            value={prefs.occupationOrRole}
            onChange={setPref('occupationOrRole')}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select label="Work style" value={prefs.workStyle} onChange={setPref('workStyle')}>
              <option value="">Select one</option>
              {WORK_STYLES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select
              label="Planning style"
              value={prefs.planningStyle}
              onChange={setPref('planningStyle')}
            >
              <option value="">Select one</option>
              {PLANNING_STYLES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select
              label="Most productive time"
              value={prefs.mostProductiveTime}
              onChange={setPref('mostProductiveTime')}
            >
              <option value="">Select one</option>
              {TIME_OF_DAY.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select
              label="Break preference"
              value={prefs.breakPreference}
              onChange={setPref('breakPreference')}
            >
              <option value="">Select one</option>
              {BREAK_PREFERENCES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select
              label="Reminder preference"
              value={prefs.reminderPreference}
              onChange={setPref('reminderPreference')}
            >
              <option value="">Select one</option>
              {REMINDER_PREFERENCES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select
              label="Difficulty starting tasks"
              value={prefs.difficultyStartingTasks}
              onChange={setPref('difficultyStartingTasks')}
            >
              <option value="">Select one</option>
              {DIFFICULTY_LEVELS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select
              label="AI response style"
              value={prefs.preferredAIResponseStyle}
              onChange={setPref('preferredAIResponseStyle')}
            >
              <option value="">Select one</option>
              {AI_RESPONSE_STYLES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select label="AI provider" value={prefs.aiProvider} onChange={setPref('aiProvider')}>
              {AI_PROVIDER_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option.charAt(0) + option.slice(1).toLowerCase()}
                </option>
              ))}
            </Select>
          </div>
          <div className="mt-1 flex flex-wrap justify-end gap-3">
            <Button variant="ghost" type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={savePrefs} disabled={saving}>
              {saving ? 'Saving…' : 'Save preferences'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}

/**
 * One stored preference.
 *
 * The label is allowed to shrink but the value is clipped rather than wrapped:
 * a role or preferred name is free text up to 120 characters, and letting it
 * wrap would push the row's baseline out and break the rhythm of the list on a
 * narrow screen. The full value is still the element's text, so it is selectable
 * and reachable by assistive tech.
 */
function PrefRow({ label, value }) {
  const empty = value === null || value === undefined || value === ''
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <span className="shrink-0 text-[13px] text-ink-muted">{label}</span>
      <span
        className={cx(
          'min-w-0 truncate text-[13px] font-medium capitalize',
          empty ? 'text-ink-faint' : 'text-ink'
        )}
      >
        {empty ? 'Not set' : String(value).toLowerCase()}
      </span>
    </div>
  )
}
