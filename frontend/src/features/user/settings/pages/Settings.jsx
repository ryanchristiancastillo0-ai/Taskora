import { Globe, Sun } from 'lucide-react'
import { useState } from 'react'
import PageHeader from '@/components/layout/PageHeader'
import Button from '@/components/ui/Button'
import Card, { CardHeader } from '@/components/ui/Card'
import NotificationSoundSelect from '@/components/ui/NotificationSoundSelect'
import SegmentedControl from '@/components/ui/SegmentedControl'
import Toggle from '@/components/ui/Toggle'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useApp } from '@/app/providers/AppContext'
import { useTheme } from '@/app/providers/ThemeProvider'
import { THEME_OPTIONS } from '@/constants/index'
import { cx } from '@/utils/format'

export const NOTIFICATION_SETTING_LABELS = {
  taskReminders: 'Task reminders',
  deadlineReminders: 'Deadline reminders',
  projectUpdates: 'Project updates',
  aiSuggestions: 'AI suggestions',
  dailySummary: 'Daily summary',
  emailNotifications: 'Email notifications',
  pushNotifications: 'Push notifications',
}

// Descriptions per switch. The two that decide whether an email can leave the
// server at all carry the explanation, because the rest of the list was six rows
// of identical switches that all did nothing and gave no hint of what they meant.
const NOTIFICATION_SETTING_DESCRIPTIONS = {
  emailNotifications:
    'Master switch. Off means no email is sent at all, whatever the switches below say.',
  taskReminders: 'Emails when a reminder you scheduled comes due.',
  deadlineReminders: 'Emails when you give a task a due date.',
  aiSuggestions: 'Emails when AI proposes a task or a recurring pattern.',
  projectUpdates: 'Emails when a project changes.',
  dailySummary: 'Emails a recap of your day.',
  pushNotifications: 'Browser push, on devices that support it.',
}

// Toggles that still describe a feature the backend does not implement. Kept
// visible rather than hidden so the list matches the database, but marked so the
// page does not claim a working feature it cannot deliver.
const UNIMPLEMENTED_NOTIFICATION_KEYS = new Set([
  'dailySummary',
  'pushNotifications',
])

export function SettingRow({ label, description, children }) {
  return (
    <div className="flex flex-col items-start justify-between gap-3 py-4 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{label}</p>
        {description && (
          <p className="mt-0.5 text-[13px] leading-relaxed text-ink-muted">{description}</p>
        )}
      </div>
      <div className="max-w-full flex-shrink-0">{children}</div>
    </div>
  )
}

export default function SettingsPage() {
  const { data, actions, pushToast } = useApp()
  const { theme, compactMode, setTheme, setCompactMode } = useTheme()
  const [showCompletedTasks, setShowCompletedTasks] = useState(
    data.settings.showCompletedTasks
  )
  const [notifications, setNotifications] = useState(data.settings.notifications)

  // Deleting the account is the one irreversible action on this page, so it goes
  // through the shared ConfirmDialog rather than a bare window.confirm. The
  // native dialog cannot be styled, cannot show the busy state the request
  // needs, and blocked dismissal is handled inconsistently across browsers — the
  // reusable one already renders inside the app's own Modal portal.
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deletingAccount, setDeletingAccount] = useState(false)

  const runDeleteAccount = async () => {
    setDeletingAccount(true)
    try {
      await actions.deleteAccount()
      pushToast('Account deleted')
    } catch (error) {
      pushToast(error.message, 'danger')
      // Keep the dialog open on failure so the reason stays next to the button
      // that caused it, instead of the user having to reopen it to retry.
      setConfirmDelete(true)
    } finally {
      setDeletingAccount(false)
    }
  }

  // The catalogue and the current choice both come from the backend — there is
  // no hardcoded list of sounds anywhere in the client.
  const sounds = data.notificationSounds
  const selectedSound = data.settings.notificationSound
  const selectedSoundId = selectedSound?.id ?? ''
  // The mute switch is independent of the chosen clip, so the dropdown stays
  // usable while muted and unmuting restores whatever was picked.
  const soundMuted = data.settings.notifications.soundEnabled === false

  const toggleNotification = (key) =>
    setNotifications((current) => ({ ...current, [key]: !current[key] }))

  // Sending a test email is the only notification action with a result worth
  // waiting on, so it owns a busy state. The toast on success or failure comes
  // from the action; this only stops the rethrow becoming unhandled.
  const [sendingTestEmail, setSendingTestEmail] = useState(false)

  const sendTestEmail = async () => {
    setSendingTestEmail(true)
    try {
      await actions.sendTestEmail()
    } catch {
      // Already toasted by the action.
    } finally {
      setSendingTestEmail(false)
    }
  }

  // The action applies the change to the store before the request resolves and
  // rolls back on failure (surfacing its own toast), so the row highlights
  // instantly and this catch only stops the rethrow becoming unhandled.
  const selectSound = (notificationSoundId) => {
    actions.setNotificationSound(notificationSoundId).catch(() => {})
  }

  const toggleSoundMuted = () => {
    actions.setSoundEnabled(soundMuted).catch(() => {})
  }

  const save = () => {
    const settingsPromise = actions.updateSettings({ showCompletedTasks })
    // The mute switch is applied immediately through its own action, so the
    // local `notifications` copy is stale for that one key. Send the live store
    // value instead, or saving here would quietly undo the mute.
    const notificationPromise = actions.updateNotificationSettings({
      ...notifications,
      soundEnabled: data.settings.notifications.soundEnabled !== false,
    })
    Promise.all([settingsPromise, notificationPromise])
      .then(() => pushToast('Settings saved'))
      .catch((error) => pushToast(error.message, 'danger'))
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Appearance, behaviour and notifications"
        actions={<Button onClick={save}>Save changes</Button>}
      />

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader title="Appearance" subtitle="How Taskora looks on your screen." />
          <div className="divide-y divide-border-subtle">
            <SettingRow
              label="Theme"
              description="Choose light, dark, or follow your system."
            >
              <SegmentedControl
                options={THEME_OPTIONS}
                value={theme}
                onChange={setTheme}
                size="md"
              />
            </SettingRow>
            <SettingRow label="Compact mode" description="Show more content per row.">
              <Toggle
                checked={compactMode}
                onChange={setCompactMode}
                label="Compact mode"
              />
            </SettingRow>
            <SettingRow
              label="Show completed tasks"
              description="Keep finished tasks visible in lists."
            >
              <Toggle
                checked={showCompletedTasks}
                onChange={setShowCompletedTasks}
                label="Show completed tasks"
              />
            </SettingRow>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Notifications"
            subtitle="Choose which alerts you receive."
          />
          <div className="divide-y divide-border-subtle">
            <SettingRow
              label="Notification sound"
              description={
                soundMuted
                  ? 'Muted. Incoming notifications will not play a sound.'
                  : selectedSound?.description || 'Played when a new notification arrives.'
              }
            >
              <div className="flex flex-col items-stretch gap-2.5 sm:items-end">
                <div className="flex items-center justify-end gap-2">
                  <span className="text-[13px] text-ink-muted">
                    {soundMuted ? 'Muted' : 'Sound on'}
                  </span>
                  <Toggle
                    checked={!soundMuted}
                    onChange={() => toggleSoundMuted()}
                    label="Notification sound"
                  />
                </div>
                <div
                  className={cx(
                    'flex items-center gap-2 transition-opacity',
                    soundMuted && 'opacity-60'
                  )}
                >
                  <NotificationSoundSelect
                    sounds={sounds}
                    selectedId={selectedSoundId}
                    onSelect={selectSound}
                    pushToast={pushToast}
                  />
                </div>
              </div>
            </SettingRow>
            {Object.entries(NOTIFICATION_SETTING_LABELS).map(([key, label]) => (
              <SettingRow
                key={key}
                label={label}
                description={NOTIFICATION_SETTING_DESCRIPTIONS[key]}
              >
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {key === 'emailNotifications' && (
                    <>
                      <Button
                        variant="soft"
                        size="sm"
                        onClick={sendTestEmail}
                        loading={sendingTestEmail}
                        disabled={!notifications.emailNotifications}
                        title={
                          notifications.emailNotifications
                            ? 'Send a real email to your inbox'
                            : 'Turn on email notifications first'
                        }
                      >
                        Send test email
                      </Button>
                    </>
                  )}
                  {UNIMPLEMENTED_NOTIFICATION_KEYS.has(key) && (
                    <span className="rounded-md bg-surface-container px-1.5 py-0.5 text-[11px] font-medium text-ink-faint">
                      Not available yet
                    </span>
                  )}
                  <Toggle
                    checked={notifications[key]}
                    onChange={() => toggleNotification(key)}
                    label={label}
                  />
                </div>
              </SettingRow>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="About" subtitle="Product and region." />
          <div className="divide-y divide-border-subtle">
            <SettingRow label="Product language" description="Interface language.">
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ink">
                <Globe className="size-3.5 text-ink-muted" strokeWidth={2} />
                English
              </span>
            </SettingRow>
            <SettingRow label="Taskora version" description="Currently running.">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">
                <Sun className="size-3.5" strokeWidth={2} />
                v0.9.0 preview
              </span>
            </SettingRow>
          </div>
        </Card>

        <Card>
          <CardHeader title="Danger zone" subtitle="Destructive actions." />
          <div className="flex flex-col items-start gap-3 py-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div>
              <p className="text-sm font-medium text-ink">Delete account</p>
              <p className="mt-0.5 text-[13px] text-ink-muted">
                This removes your data permanently.
              </p>
            </div>
            <Button variant="dangerSoft" onClick={() => setConfirmDelete(true)}>
              Delete account
            </Button>
          </div>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => {
          if (deletingAccount) return
          setConfirmDelete(false)
        }}
        title="Delete your account?"
        message="This removes your account and all of its data permanently. This cannot be undone."
        confirmLabel="Delete account"
        cancelLabel="Keep my account"
        loading={deletingAccount}
        onConfirm={runDeleteAccount}
      />
    </div>
  )
}