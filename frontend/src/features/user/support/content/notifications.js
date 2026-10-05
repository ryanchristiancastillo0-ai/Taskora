import { Bell } from 'lucide-react'

export const notifications = {
  id: 'NOTIFICATIONS',
  label: 'Notifications',
  description: 'Reminders, alerts and the notification centre.',
  icon: Bell,
  issues: [
    {
      slug: 'notifications',
      label: 'Notifications',
      problems: [
        {
          slug: 'no-notifications',
          label: 'Not arriving at all',
          summary: 'No notifications are being received',
          description: 'Reminders and alerts that should appear never do.',
          steps: [
            'Check that each notification switch is on in Settings.',
            'Remember that "Email notifications" is the master switch — with it off nothing is emailed.',
            'Allow notifications for this site in your browser.',
          ],
          action: { label: 'Open notification settings', to: '/settings' },
        },
        {
          slug: 'too-many-notifications',
          label: 'Too many notifications',
          summary: 'Receiving too many notifications',
          description: 'The volume of reminders and alerts is disruptive.',
          steps: [
            'Turn off the individual categories you do not need.',
            'Reduce your reminder frequency on the task itself.',
            'Mute the notification sound so the alerts stop interrupting you.',
          ],
          action: { label: 'Open notification settings', to: '/settings' },
        },
        {
          slug: 'sound-not-playing',
          label: 'No sound on notifications',
          summary: 'Notification sound is not playing',
          description: 'Notifications arrive but are silent.',
          steps: [
            'Check that the notification sound is not muted in Settings.',
            'Your device may be on silent or the tab may be muted.',
            'Use "Send test email" in Settings to confirm the sound is configured.',
          ],
          action: { label: 'Open notification settings', to: '/settings' },
        },
      ],
    },
  ],
}
