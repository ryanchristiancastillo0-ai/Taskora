import { Settings } from 'lucide-react'

export const settingsPreferences = {
  id: 'SETTINGS_PREFERENCES',
  label: 'Settings & Preferences',
  description: 'Theme, profile and how Taskora behaves.',
  icon: Settings,
  issues: [
    {
      slug: 'settings-preferences',
      label: 'Settings & Preferences',
      problems: [
        {
          slug: 'settings-not-saving',
          label: 'Changes are not saving',
          summary: 'Setting changes are not persisted',
          description: 'A change looks applied but is gone after a refresh.',
          steps: [
            'Select "Save changes" before navigating away.',
            'Check your connection if the save fails.',
          ],
          action: { label: 'Open Settings', to: '/settings' },
        },
        {
          slug: 'theme-not-applying',
          label: 'Theme is not applying',
          summary: 'Theme choice does not take effect',
          description: 'The interface stays on the previous theme.',
          steps: [
            'With "System" selected, your operating system setting decides the theme.',
            'Refresh the page after switching.',
          ],
          action: { label: 'Open Settings', to: '/settings' },
        },
        {
          slug: 'delete-account',
          label: 'Delete my account',
          summary: 'Wants to delete the account and its data',
          description: 'The request is to permanently remove the account.',
          steps: [
            'Deleting an account is permanent and cannot be undone.',
            'Export anything you want to keep first.',
            'Use the danger zone on the Settings page to confirm deletion.',
          ],
          action: { label: 'Open Settings', to: '/settings' },
        },
      ],
    },
  ],
}
