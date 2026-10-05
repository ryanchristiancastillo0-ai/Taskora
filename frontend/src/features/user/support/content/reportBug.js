import { Bug } from 'lucide-react'

export const reportBug = {
  id: 'REPORT_BUG',
  label: 'Report a Bug',
  description: 'Something is broken or looks wrong.',
  icon: Bug,
  issues: [
    {
      slug: 'report-bug',
      label: 'Report a Bug',
      problems: [
        {
          slug: 'visual-bug',
          label: 'Layout or display problem',
          summary: 'Layout or display renders incorrectly',
          description: 'The interface looks wrong — overlapping, misaligned or unreadable.',
          steps: [
            'Try a hard refresh — a stale cached bundle causes most visual problems.',
            'Note which page and which browser you saw it on.',
          ],
        },
        {
          slug: 'crash',
          label: 'The app crashed or froze',
          summary: 'Application crashed or became unresponsive',
          description: 'The page stopped responding or closed unexpectedly.',
          steps: [
            'Reload and try again.',
            'If it keeps happening, note the last action you took before it froze.',
          ],
        },
        {
          slug: 'performance',
          label: 'Taskora is slow',
          summary: 'Taskora is slow or unresponsive',
          description: 'Pages take a long time to load or respond.',
          steps: [
            'Close other heavy tabs and try again.',
            'Check whether the slowdown follows a specific page or device.',
          ],
        },
      ],
    },
  ],
}
