import { useState } from 'react'
import { Bell, Globe, Info, Moon, Sun, Volume2 } from 'lucide-react'
import PageHeader from '@/shared/components/layouts/PageHeader'
import Card, { CardHeader } from '@/shared/components/ui/Card'
import NotificationSoundSelect from '@/shared/components/ui/NotificationSoundSelect'
import SegmentedControl from '@/shared/components/ui/SegmentedControl'
import Select from '@/shared/components/ui/Select'
import Toggle from '@/shared/components/ui/Toggle'
import { useApp } from '../../user/context/AppContext'
import { useTheme } from '../../user/context/ThemeProvider'
import { THEME_OPTIONS } from '@/shared/constants'
import { cx } from '@/shared/utils/format'

/**
 * Admin console settings.
 *
 * This is the signed-in admin's own account settings, served by the real
 * /users/me and /settings endpoints through AppContext - not a second set of
 * console preferences. There is no admin-preferences table, and inventing one
 * would mean a model, a migration and a screen whose values reset on every
 * deploy. What an admin can change about the console is therefore stated
 * rather than faked.
 */
export default function AdminSettings() {
  const { data, actions, pushToast } = useApp()
  const { theme, setTheme, compactMode, setCompactMode } = useTheme()

  const [saving, setSaving] = useState(false)
  const settings = data.settings

  const persist = async (patch, notificationPatch) => {
    setSaving(true)
    try {
      if (patch) await actions.updateSettings(patch)
      if (notificationPatch) await actions.updateNotificationSettings(notificationPatch)
      pushToast('Settings saved')
    } catch (error) {
      pushToast(error.message || 'Could not save settings', 'danger')
    } finally {
      setSaving(false)
    }
  }

  const notifications = settings?.notifications ?? {}
  // Same shape as the user Settings page: the catalogue and the current choice
  // both come from the backend, so the console has no list of sounds of its own.
  const sounds = data.notificationSounds
  const selectedSound = settings?.notificationSound
  const soundMuted = notifications.soundEnabled === false

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Your account preferences, shared with the rest of Taskora."
        actions={
          saving ? (
            <span className="text-[13px] text-ink-faint">Saving…</span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-faint">
              <Info className="size-3.5" strokeWidth={2} />
              Changes save as you make them
            </span>
          )
        }
      />

      <Card>
        <CardHeader title="Appearance" subtitle="How Taskora looks on your screen." icon={theme === 'DARK' ? Moon : Sun} />
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[13px] font-medium text-ink">Theme</p>
              <p className="mt-0.5 text-[12px] text-ink-muted">
                Applies across the app, the console included.
              </p>
            </div>
            <SegmentedControl
              options={THEME_OPTIONS}
              value={theme}
              onChange={(next) => setTheme(next)}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-5">
            <div>
              <p className="text-[13px] font-medium text-ink">Compact mode</p>
              <p className="mt-0.5 text-[12px] text-ink-muted">
                Tighter rows and padding. Useful on the wide admin tables.
              </p>
            </div>
            <Toggle
              checked={compactMode}
              onChange={(next) => {
                setCompactMode(next)
                persist({ compactMode: next })
              }}
              label="Compact mode"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-5">
            <div>
              <p className="text-[13px] font-medium text-ink">Language</p>
              <p className="mt-0.5 text-[12px] text-ink-muted">Interface language.</p>
            </div>
            <Select
              value={settings?.language ?? 'en'}
              onChange={(event) => persist({ language: event.target.value })}
              className="w-40"
            >
              <option value="en">English</option>
              <option value="fil">Filipino</option>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="mt-4">
        <CardHeader
          title="Notifications"
          subtitle="Which alerts you receive, in the app and by email."
          icon={Bell}
        />
        <div className="space-y-4">
          {[
            ['taskReminders', 'Task reminders', 'Nudges for tasks due today.'],
            ['deadlineReminders', 'Deadline reminders', 'Alerts as a due date approaches.'],
            ['projectUpdates', 'Project updates', 'Activity on projects you own.'],
            ['aiSuggestions', 'AI suggestions', 'Suggestions from the assistant.'],
            ['dailySummary', 'Daily summary', 'One recap each morning.'],
            ['emailNotifications', 'Email notifications', 'Send the above to your inbox.'],
            ['pushNotifications', 'Push notifications', 'Browser push while Taskora is open.'],
          ].map(([key, label, description]) => (
            <div
              key={key}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-4 last:border-0 last:pb-0"
            >
              <div>
                <p className="text-[13px] font-medium text-ink">{label}</p>
                <p className="mt-0.5 text-[12px] text-ink-muted">{description}</p>
              </div>
              <Toggle
                checked={Boolean(notifications[key])}
                onChange={(next) => persist(null, { [key]: next })}
                label={label}
              />
            </div>
          ))}

          {/*
            The alert tone, matching the user Settings page control for control:
            the same picker, the same audition button, the same independence
            between "which clip" and "am I audible at all". The mute switch goes
            through setSoundEnabled rather than the generic notification patch
            because that is the action that also re-points the audio engine -
            patching the store alone left the switch looking changed while
            notifications kept sounding until the next page load.
          */}
          <div className="flex flex-col gap-3 border-t border-border-subtle pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Volume2 className="size-4 text-ink-faint" strokeWidth={2} />
                <div>
                  <p className="text-[13px] font-medium text-ink">Notification sound</p>
                  <p className="mt-0.5 text-[12px] text-ink-muted">
                    {soundMuted
                      ? 'Muted. Incoming notifications will not play a sound.'
                      : selectedSound?.description ||
                        'Played when a new notification arrives.'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="text-[12px] text-ink-muted">
                  {soundMuted ? 'Muted' : 'Sound on'}
                </span>
                <Toggle
                  checked={!soundMuted}
                  onChange={() => actions.setSoundEnabled(soundMuted).catch(() => {})}
                  label="Notification sound"
                />
              </div>
            </div>
            <div
              className={cx(
                'flex justify-end transition-opacity',
                soundMuted && 'opacity-60'
              )}
            >
              <NotificationSoundSelect
                sounds={sounds}
                selectedId={selectedSound?.id ?? ''}
                onSelect={(id) => actions.setNotificationSound(id).catch(() => {})}
                pushToast={pushToast}
              />
            </div>
          </div>
        </div>
      </Card>

      <Card className="mt-4">
        <CardHeader
          title="About this console"
          subtitle="What the admin area can and cannot do."
          icon={Globe}
        />
        <div className="space-y-3 text-[13px] leading-relaxed text-ink-muted">
          <p>
            The console reads every task, project, user and AI request on the
            platform, and can change exactly two things about an account: its role
            and whether it is suspended. Everything else — tasks, projects, notes,
            goals, habits — is read-only here and stays under its owner&apos;s
            control.
          </p>
          <p>
            Settings on this page are your own account preferences, stored against
            your user record and shared with the main app. The console has no
            separate preferences of its own.
          </p>
        </div>
      </Card>
    </>
  )
}
