import { Sparkles } from 'lucide-react'

export const aiAssistant = {
  id: 'AI_ASSISTANT',
  label: 'AI Assistant',
  description: 'Chat, suggestions and voice input.',
  icon: Sparkles,
  issues: [
    {
      slug: 'ai-assistant',
      label: 'AI Assistant',
      problems: [
        {
          slug: 'ai-not-responding',
          label: 'AI is not responding',
          summary: 'AI Assistant does not return a reply',
          description: 'A message is sent but no answer comes back.',
          steps: [
            'Wait a moment — a long answer can take longer than a short one.',
            'Check your connection; the assistant needs a live request.',
            'Re-send the message.',
          ],
          action: { label: 'Open AI Assistant', to: '/ai' },
        },
        {
          slug: 'ai-error',
          label: 'An error message appeared',
          summary: 'AI Assistant returned an error',
          description: 'The assistant replied with an error rather than an answer.',
          steps: [
            'Try the same message again — a provider hiccup is usually temporary.',
            'If it keeps failing, try a shorter message.',
            'Check Settings for your AI provider and confirm it is configured.',
          ],
          action: { label: 'Check AI settings', to: '/settings' },
        },
        {
          slug: 'ai-voice-not-working',
          label: 'Voice input is not working',
          summary: 'Voice input does not capture or send audio',
          description: 'The microphone button records nothing, or the recording is not transcribed.',
          steps: [
            'Allow microphone access for this site in your browser settings.',
            'Check that the correct input device is selected in the voice picker.',
            'Make sure no other app is using the microphone at the same time.',
          ],
          action: { label: 'Open AI Assistant', to: '/ai' },
        },
        {
          slug: 'ai-wrong-answers',
          label: 'Answers are not relevant',
          summary: 'AI answers do not reflect the account context',
          description:
            'Responses ignore your tasks, projects or stated preferences.',
          steps: [
            'Complete the preferences interview so the assistant knows how you work.',
            'Mention the project by name in your message.',
            'Clear the conversation and start a fresh one — earlier context can carry over.',
          ],
          action: { label: 'Review preferences', to: '/settings' },
        },
      ],
    },
  ],
}
