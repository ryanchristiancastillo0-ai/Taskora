import {
  AlertTriangle,
  BadgeCheck,
  KeyRound,
  Lock,
  Mail,
  Pencil,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '@/components/layout/PageHeader'
import AvatarPicker from '@/components/ui/AvatarPicker'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Card, { CardHeader } from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import Select from '@/components/ui/Select'
import Textarea from '@/components/ui/Textarea'
import {
  AI_PROVIDER_OPTIONS,
  AI_RESPONSE_STYLES,
  BREAK_PREFERENCES,
  DIFFICULTY_LEVELS,
  PLANNING_STYLES,
  REMINDER_PREFERENCES,
  TIME_OF_DAY,
  WORK_STYLES,
} from '@/constants/index'
import { useApp } from '@/app/providers/AppContext'
import ChangeEmailModal from '@/features/user/profile/components/ChangeEmailModal'
import ChangePasswordModal from '@/features/user/profile/components/ChangePasswordModal'
import ForgotPasswordModal from '@/features/user/profile/components/ForgotPasswordModal'

function PrefRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <span className="text-[13px] text-ink-muted">{label}</span>
      <span className="text-[13px] font-medium capitalize text-ink">
        {String(value ?? '—').toLowerCase()}
      </span>
    </div>
  )
}

/**
 * One credential control: an icon, a label with the current value, a short
 * explanation, and the button that opens its modal.
 */
function SecurityRow({ icon: Icon, label, value, hint, action, onClick }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-4">
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-0.5 flex size-8 flex-shrink-0 items-center justify-center rounded-lg bg-surface-soft text-ink-muted">
          <Icon className="size-4" strokeWidth={2} />
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-ink">{label}</p>
          {value && (
            <p className="mt-0.5 truncate text-[13px] text-ink-muted">{value}</p>
          )}
          {hint && (
            <p className="mt-0.5 text-xs leading-relaxed text-ink-faint">{hint}</p>
          )}
        </div>
      </div>
      <Button
        variant="secondary"
        size="sm"
        onClick={onClick}
        className="ml-11 shrink-0 sm:ml-0"
      >
        {action}
      </Button>
    </div>
  )
}

export default function ProfilePage() {
  const navigate = useNavigate()
  const { data, actions, pushToast } = useApp()
  const [showEdit, setShowEdit] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showPrefs, setShowPrefs] = useState(false)
  const [prefsSaving, setPrefsSaving] = useState(false)
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [showForgotModal, setShowForgotModal] = useState(false)
  const [values, setValues] = useState({
    firstName: data.user.firstName,
    lastName: data.user.lastName,
    bio: data.user.bio ?? '',
  })
  const [prefs, setPrefs] = useState({
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
  })

  const profile = data.profile
  const onboardingIncomplete = profile.onboardingSkipped && !profile.onboardingCompleted

  const saveChanges = () => {
    setSaving(true)
    actions
      .updateUser({
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        bio: values.bio.trim() || null,
      })
      .then(() => {
        setShowEdit(false)
        pushToast('Profile updated')
      })
      .catch((error) => pushToast(error.message, 'danger'))
      .finally(() => setSaving(false))
  }

  const openPrefs = () => {
    setPrefs({
      preferredName: profile.preferredName ?? '',
      occupationOrRole: profile.occupationOrRole ?? '',
      workStyle: profile.workStyle ?? '',
      planningStyle: profile.planningStyle ?? '',
      mostProductiveTime: profile.mostProductiveTime ?? '',
      breakPreference: profile.breakPreference ?? '',
      reminderPreference: profile.reminderPreference ?? '',
      difficultyStartingTasks: profile.difficultyStartingTasks ?? '',
      preferredAIResponseStyle: profile.preferredAIResponseStyle ?? '',
      aiProvider: profile.aiProvider ?? 'GEMINI',
    })
    setShowPrefs(true)
  }

  const savePrefs = () => {
    setPrefsSaving(true)
    const patch = {}
    if (prefs.preferredName.trim()) patch.preferredName = prefs.preferredName.trim()
    patch.occupationOrRole = prefs.occupationOrRole
    patch.workStyle = prefs.workStyle
    patch.planningStyle = prefs.planningStyle
    patch.mostProductiveTime = prefs.mostProductiveTime
    patch.breakPreference = prefs.breakPreference
    patch.reminderPreference = prefs.reminderPreference
    patch.difficultyStartingTasks = prefs.difficultyStartingTasks
    patch.preferredAIResponseStyle = prefs.preferredAIResponseStyle
    patch.aiProvider = prefs.aiProvider
    actions
      .updateProfile(patch)
      .then(() => {
        setShowPrefs(false)
        pushToast('Preferences updated')
      })
      .catch((error) => pushToast(error.message, 'danger'))
      .finally(() => setPrefsSaving(false))
  }

  const setPref = (key) => (event) => setPrefs({ ...prefs, [key]: event.target.value })

  return (
    <div>
      {onboardingIncomplete && (
        <div className="mb-6 flex flex-col gap-3 rounded-xl border border-warning/20 bg-warning-soft p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" strokeWidth={2} />
            <div>
              <p className="text-sm font-semibold text-amber-800">
                Complete your personalisation
              </p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-amber-700">
                Fill this up to make your experience a lot better — we'll tailor planning,
                reminders, and AI suggestions around you.
              </p>
            </div>
          </div>
          <Button
            variant="soft"
            className="shrink-0"
            onClick={() => navigate('/onboarding')}
          >
            Complete onboarding
          </Button>
        </div>
      )}
      <PageHeader
        title="Profile"
        subtitle="Your details and personalisation"
        actions={
          <Button
            variant="secondary"
            icon={Pencil}
            onClick={() => {
              setValues({
                firstName: data.user.firstName,
                lastName: data.user.lastName,
                bio: data.user.bio ?? '',
              })
              setShowEdit(true)
            }}
          >
            Edit profile
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <Card className="sticky top-20 flex flex-col items-center py-8 text-center">
            <AvatarPicker
              name={`${data.user.firstName} ${data.user.lastName}`}
              src={data.user.avatarUrl}
              size="xl"
              caption="Click the photo to change it"
              className="mb-4"
              onSave={(file) => actions.uploadAvatar(file)}
              onRemove={() => actions.removeAvatar()}
              pushToast={pushToast}
            />
            <h2 className="text-lg font-semibold text-ink">
              {data.user.firstName} {data.user.lastName}
            </h2>
            <p className="mt-1 flex items-center gap-1.5 text-[13px] text-ink-muted">
              <Mail className="size-3.5" strokeWidth={2} />
              {data.user.email}
            </p>
            {onboardingIncomplete ? (
              <Badge tone="amber" className="mt-3 gap-1">
                <AlertTriangle className="size-3.5" strokeWidth={2} />
                Profile incomplete
              </Badge>
            ) : (
              <Badge tone="green" className="mt-3 gap-1">
                <BadgeCheck className="size-3.5" strokeWidth={2} />
                Onboarding complete
              </Badge>
            )}
            {data.user.bio && (
              <p className="mt-4 max-w-xs text-[13px] leading-relaxed text-ink-soft">
                {data.user.bio}
              </p>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-6 lg:col-span-8">
          <Card>
            <CardHeader
              title="Personalisation"
              subtitle="How Taskora plans and communicates with you."
              actions={
                <Button variant="secondary" icon={SlidersHorizontal} onClick={openPrefs}>
                  Edit preferences
                </Button>
              }
            />
            <div className="divide-y divide-border-subtle">
              <PrefRow label="Preferred name" value={profile.preferredName} />
              <PrefRow label="Work style" value={profile.workStyle} />
              <PrefRow label="Planning style" value={profile.planningStyle} />
              <PrefRow label="Task organisation" value={profile.preferredTaskOrganization} />
              <PrefRow label="Most productive time" value={profile.mostProductiveTime} />
              <PrefRow label="Reminder preference" value={profile.reminderPreference} />
              <PrefRow label="AI response style" value={profile.preferredAIResponseStyle} />
              <PrefRow label="AI provider" value={profile.aiProvider} />
            </div>
          </Card>
          <Card>
            <CardHeader title="Account" subtitle="Membership and usage." />
            <div className="divide-y divide-border-subtle">
              <PrefRow label="Plan" value="Free" />
              <PrefRow label="Active devices" value="3" />
              <PrefRow
                label="Member since"
                value={
                  data.user.createdAt
                    ? new Date(data.user.createdAt).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })
                    : '—'
                }
              />
            </div>
          </Card>
          <Card>
            <CardHeader
              icon={ShieldCheck}
              title="Security"
              subtitle="Your sign-in details and how we reach you."
            />
            <div className="divide-y divide-border-subtle">
              <SecurityRow
                icon={Mail}
                label="Email address"
                value={data.user.email}
                hint="We send a code to the new address before switching over."
                action="Change email"
                onClick={() => setShowEmailModal(true)}
              />
              <SecurityRow
                icon={Lock}
                label="Password"
                hint="Confirm with a 6-digit code we email you."
                action="Change password"
                onClick={() => setShowPasswordModal(true)}
              />
              <SecurityRow
                icon={KeyRound}
                label="Forgot your password?"
                hint="Signed in but locked out? We'll email you a reset code."
                action="Reset password"
                onClick={() => setShowForgotModal(true)}
              />
            </div>
          </Card>
        </div>
      </div>

      <Modal open={showPrefs} onClose={() => setShowPrefs(false)} title="Preferences">
        <form className="flex flex-col gap-4">
          <Input
            label="Preferred name"
            placeholder="How the assistant should call you"
            value={prefs.preferredName}
            onChange={setPref('preferredName')}
          />
          <Input
            label="Role"
            placeholder="e.g. Frontend developer"
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
            <Select label="Planning style" value={prefs.planningStyle} onChange={setPref('planningStyle')}>
              <option value="">Select one</option>
              {PLANNING_STYLES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select label="Most productive time" value={prefs.mostProductiveTime} onChange={setPref('mostProductiveTime')}>
              <option value="">Select one</option>
              {TIME_OF_DAY.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select label="Break preference" value={prefs.breakPreference} onChange={setPref('breakPreference')}>
              <option value="">Select one</option>
              {BREAK_PREFERENCES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select label="Reminder preference" value={prefs.reminderPreference} onChange={setPref('reminderPreference')}>
              <option value="">Select one</option>
              {REMINDER_PREFERENCES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select label="Difficulty starting tasks" value={prefs.difficultyStartingTasks} onChange={setPref('difficultyStartingTasks')}>
              <option value="">Select one</option>
              {DIFFICULTY_LEVELS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select label="AI response style" value={prefs.preferredAIResponseStyle} onChange={setPref('preferredAIResponseStyle')}>
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
            <Button variant="ghost" type="button" onClick={() => setShowPrefs(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={savePrefs} disabled={prefsSaving}>
              {prefsSaving ? 'Saving…' : 'Save preferences'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={showEdit}
        onClose={() => setShowEdit(false)}
        title="Edit profile"
        subtitle="Your email address is changed from Security below, so it can be verified."
      >
        <form className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="First name"
              value={values.firstName}
              onChange={(event) => setValues({ ...values, firstName: event.target.value })}
            />
            <Input
              label="Last name"
              value={values.lastName}
              onChange={(event) => setValues({ ...values, lastName: event.target.value })}
            />
          </div>
          <Textarea
            label="Bio"
            rows={3}
            value={values.bio}
            onChange={(event) => setValues({ ...values, bio: event.target.value })}
          />
          <div className="mt-1 flex flex-wrap justify-end gap-3">
            <Button variant="ghost" type="button" onClick={() => setShowEdit(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={saveChanges} disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </form>
      </Modal>

      <ChangeEmailModal
        open={showEmailModal}
        onClose={() => setShowEmailModal(false)}
        currentEmail={data.user.email}
        actions={actions}
        pushToast={pushToast}
      />

      <ChangePasswordModal
        open={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
        email={data.user.email}
        actions={actions}
        pushToast={pushToast}
      />

      <ForgotPasswordModal
        open={showForgotModal}
        onClose={() => setShowForgotModal(false)}
        email={data.user.email}
        actions={actions}
        pushToast={pushToast}
      />
    </div>
  )
}