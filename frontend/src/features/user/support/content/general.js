import { Compass } from 'lucide-react'

export const general = {
  id: 'GENERAL',
  label: 'Other / General Support',
  description: 'Anything not covered above, including feedback.',
  icon: Compass,
  issues: [
    {
      slug: 'general-support',
      label: 'Other / General Support',
      problems: [
        {
          slug: 'general-question',
          label: 'I have a general question',
          summary: 'General question about Taskora',
          description: 'A question that does not fit any of the categories above.',
          steps: [
            'Describe what you are trying to do — that is usually enough for us to help.',
          ],
        },
        {
          slug: 'feature-request',
          label: 'Suggest a feature',
          summary: 'Wants to suggest a new feature',
          description: 'An idea for something Taskora should be able to do.',
          steps: [
            'Tell us what you were trying to do and what got in the way.',
            'Feature requests are read by the same team that handles support.',
          ],
        },
        {
          slug: 'feedback',
          label: 'Give feedback or praise',
          summary: 'Wants to leave feedback about Taskora',
          description: 'General feedback about the product or the support experience.',
          steps: ['Tell us what worked and what did not.'],
        },
      ],
    },
  ],
}
