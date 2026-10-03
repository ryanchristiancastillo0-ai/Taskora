import {
  Bell,
  Bug,
  Compass,
  ListChecks,
  Settings,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'

/**
 * The help centre's content tree.
 *
 * Shape, one level per step of the guided flow:
 *
 *   category
 *     └── issue        a thing the user recognises ("Forgot Password")
 *           └── problem  the specific symptom ("Reset email never arrived")
 *                 ├── summary     stored on the ticket as `problem`
 *                 ├── description why this is happening, in plain words
 *                 ├── steps       the fix, as an ordered list
 *                 └── action      an optional button (route, not a URL fetch)
 *
 * The category ids are the ONLY part of this file the backend knows about: they
 * are the values accepted by SUPPORT_CATEGORIES in
 * backend/src/validators/support/supportValidators.js, which refuses anything
 * else at the boundary. Everything below a category is frontend-only and can be
 * extended without a migration.
 *
 * `issue` and `problem` are persisted as SLUGS, never as the labels. The label is
 * what a human reads and it is free to be reworded; the slug is the stable key
 * both halves of the product agree on, so renaming "Reset email never arrived" to
 * "I never got the email" does not orphan the tickets already filed under it.
 * `issueLabel` / `problemLabel` below turn a stored slug back into the current
 * wording, which is how the admin console and the ticket history render a row.
 *
 * Adding an entry: append to the relevant category's `issues`. Nothing else in
 * the app needs to change — the category grid, the search index and the guided
 * flow are all derived from this array.
 */

export const SUPPORT_STATUS_META = {
  OPEN: { label: 'Open', tone: 'amber' },
  IN_PROGRESS: { label: 'In progress', tone: 'indigo' },
  RESOLVED: { label: 'Resolved', tone: 'green' },
  CLOSED: { label: 'Closed', tone: 'slate' },
}

export function supportStatusMeta(status) {
  if (status == null) return { label: 'Unknown', tone: 'muted' }
  return SUPPORT_STATUS_META[String(status).toUpperCase()] ?? { label: String(status), tone: 'muted' }
}

export const SUPPORT_CATEGORIES = [
  {
    id: 'ACCOUNT_SECURITY',
    label: 'Account & Security',
    description: 'Passwords, sign-in and the email on your account.',
    icon: ShieldCheck,
    issues: [
      {
        slug: 'forgot-password',
        label: 'Forgot Password',
        problems: [
          {
            slug: 'no-password',
            label: 'I forgot my password',
            summary: 'Forgot the account password',
            description:
              'You are signed in or trying to sign in, but you cannot remember the password you chose.',
            steps: [
              'Open the sign-in page and select "Forgot password".',
              'Enter the email address you registered with.',
              'Follow the link in the reset email to choose a new password.',
            ],
            action: { label: 'Reset your password', to: '/forgot-password' },
          },
          {
            slug: 'reset-email-missing',
            label: 'Reset email never arrived',
            summary: 'Password reset email was not received',
            description:
              'The reset request went through, but no email is arriving in your inbox.',
            steps: [
              'Check your spam or junk folder — automated mail is often filed there.',
              'Confirm you entered the same email address you registered with.',
              'Wait a couple of minutes and request the email again.',
              'Ask your mail provider to allow emails from Taskora while you wait.',
            ],
            action: { label: 'Resend reset email', to: '/forgot-password' },
          },
          {
            slug: 'reset-link-expired',
            label: 'Reset link expired',
            summary: 'Password reset link has expired',
            description:
              'The link in the reset email no longer works. Reset links are deliberately short-lived.',
            steps: [
              'Request a fresh reset email — the old link cannot be reactivated.',
              'Open the newest email and use its link within the hour.',
              'Check that your device clock is correct; a skewed clock is the usual cause of an instant expiry.',
            ],
            action: { label: 'Request a new link', to: '/forgot-password' },
          },
          {
            slug: 'no-email-access',
            label: 'I no longer have access to my email',
            summary: 'No longer has access to the registered email',
            description:
              'The account is tied to an email address you can no longer open, so the usual reset route is closed.',
            steps: [
              'Try signing in with any provider you linked to the account — a Google or Apple sign-in still works without the email inbox.',
              'If you signed up with a password, contact support so the account can be verified another way.',
            ],
          },
        ],
      },
      {
        slug: 'lost-account-access',
        label: "Lost / Can't Access Account",
        problems: [
          {
            slug: 'locked-out',
            label: 'Locked out after too many attempts',
            summary: 'Locked out after repeated failed sign-in attempts',
            description:
              'Repeated failed attempts pause sign-in for a short period as a safeguard.',
            steps: [
              'Wait 15 minutes before trying again.',
              'Reset your password if you are not sure of the current one.',
              'Make sure you are on the correct sign-in page for your account.',
            ],
            action: { label: 'Reset your password', to: '/forgot-password' },
          },
          {
            slug: 'account-not-found',
            label: 'Account not found',
            summary: 'Sign-in reports the account does not exist',
            description:
              'The email address on the sign-in form does not match an account on Taskora.',
            steps: [
              'Check for a typo in the email address.',
              'Try the address you use for other services — it is often a different one.',
              'If you signed up with Google or Apple, use that button instead of the email form.',
            ],
          },
          {
            slug: 'suspended-account',
            label: 'My account was suspended',
            summary: 'Account suspended and cannot be signed in to',
            description:
              'An administrator has suspended the account. Suspended accounts keep all of their data.',
            steps: [
              'Read the notification email for the reason given.',
              'Reply to that email to appeal the decision.',
            ],
          },
        ],
      },
      {
        slug: 'login-problems',
        label: 'Login Problems',
        problems: [
          {
            slug: 'stay-signed-out',
            label: 'Signed out repeatedly',
            summary: 'Repeatedly signed out of the session',
            description:
              'The session is ending sooner than expected, so you are sent back to the sign-in page.',
            steps: [
              'Turn off "Remember me" is not the fix — instead check whether a browser extension is clearing cookies for this site.',
              'If you are on a shared or managed device, an administrator may be enforcing a session timeout.',
              'Sign in again and check the box to stay signed in.',
            ],
          },
          {
            slug: 'wrong-credentials',
            label: 'Email or password rejected',
            summary: 'Sign-in rejected the email or password',
            description: 'The credentials entered did not match an account.',
            steps: [
              'Check that caps lock is off and the email has no stray spaces.',
              'Confirm you are signing in to Taskora and not a saved account from another service.',
              'Reset the password if you are certain the email is correct.',
            ],
            action: { label: 'Reset your password', to: '/forgot-password' },
          },
          {
            slug: 'sso-fails',
            label: 'Google or Apple sign-in fails',
            summary: 'Social sign-in fails or does not return to Taskora',
            description:
              'The provider sign-in completes but Taskora does not receive the account, usually because a different Taskora account already uses that email.',
            steps: [
              'Finish signing in with the provider first, then return and try again.',
              'If you previously registered with a password, sign in that way and change your email instead.',
              'Check that cookies are allowed for this site on the device.',
            ],
          },
        ],
      },
      {
        slug: 'change-email',
        label: 'Change Email',
        problems: [
          {
            slug: 'change-email-code-missing',
            label: 'Confirmation code never arrived',
            summary: 'Email change confirmation code was not received',
            description:
              'Taskora sent a code to the new address to prove you own it, and it has not arrived.',
            steps: [
              'Check the spam folder in the NEW mailbox as well as the old one.',
              'Confirm the new address was typed correctly — the code goes only to the address you entered.',
              'Wait a minute and request a new code.',
            ],
          },
          {
            slug: 'change-email-blocked',
            label: 'Email already in use',
            summary: 'Requested email address is already linked to an account',
            description:
              'Each email address can belong to one Taskora account only, so it cannot be claimed twice.',
            steps: [
              'Sign in with the account that already uses that email to check which one it is.',
              'If that other account is not yours, contact support so it can be investigated.',
            ],
          },
          {
            slug: 'change-email-wrong',
            label: 'Changed to the wrong address',
            summary: 'Account email was changed to the wrong address',
            description:
              'The account email now points somewhere you did not intend.',
            steps: [
              'If you can still sign in, change it back from Settings.',
              'If the new address is inaccessible, use the password reset route from the sign-in page.',
            ],
            action: { label: 'Go to Settings', to: '/settings' },
          },
        ],
      },
    ],
  },
  {
    id: 'TASKS_PROJECTS',
    label: 'Tasks & Projects',
    description: 'Creating, organising and finding your work.',
    icon: ListChecks,
    issues: [
      {
        slug: 'tasks-projects',
        label: 'Tasks & Projects',
        problems: [
          {
            slug: 'task-not-saving',
            label: 'Task is not saving',
            summary: 'Task edits are not being saved',
            description:
              'Changes to a task appear to be lost when you navigate away or refresh.',
            steps: [
              'Press Save and wait for the confirmation before closing the task.',
              'Check for a failed connection indicator — an unsaved edit is lost on refresh.',
              'Reopen the task to confirm whether the change took effect.',
            ],
          },
          {
            slug: 'task-missing',
            label: 'A task disappeared',
            summary: 'Task is missing from its list or project',
            description: 'A task that existed is no longer showing where you left it.',
            steps: [
              'Check the filters on the list — a status or date filter can hide a task that still exists.',
              'Use search with part of the task title.',
              'Check the project the task was moved to.',
            ],
            action: { label: 'Open my tasks', to: '/tasks' },
          },
          {
            slug: 'project-sync',
            label: 'Tasks not appearing in the project',
            summary: 'Tasks are not appearing under the expected project',
            description: 'A task exists but is not listed under the project you assigned it to.',
            steps: [
              'Open the task and confirm the project field actually saved.',
              'Check whether the project has been archived.',
              'Refresh the project view.',
            ],
            action: { label: 'Open my projects', to: '/projects' },
          },
          {
            slug: 'recurring-not-created',
            label: 'Recurring task was not created',
            summary: 'Recurring task was not generated for the next period',
            description:
              'A repeating task did not appear again on the schedule you expected.',
            steps: [
              'Confirm the task has a repeat rule set.',
              'Check whether the pattern suggestion was skipped rather than accepted.',
              'Look for the next occurrence on the calendar.',
            ],
            action: { label: 'Open the calendar', to: '/calendar' },
          },
        ],
      },
    ],
  },
  {
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
  },
  {
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
  },
  {
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
  },
  {
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
  },
  {
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
  },
]

const CATEGORY_INDEX = new Map(SUPPORT_CATEGORIES.map((category) => [category.id, category]))

/** The category object for a stored id, or undefined. */
export function getSupportCategory(categoryId) {
  return CATEGORY_INDEX.get(categoryId)
}

export function supportCategoryLabel(categoryId) {
  return CATEGORY_INDEX.get(categoryId)?.label ?? String(categoryId ?? 'Unknown')
}

/**
 * Turns a stored `issue` / `problem` slug back into the current wording.
 *
 * The admin console and the user's own ticket history both render rows written
 * weeks or months ago, so they cannot show the slug — it would read as
 * `reset-email-missing` in a status line. Falls back to the raw slug rather than
 * to an empty string: an unrecognised value is still something an admin can read
 * aloud, search for and recognise as a slug, and it makes a bad key obvious
 * instead of silently blank.
 */
export function issueLabel(categoryId, issueSlug) {
  const category = CATEGORY_INDEX.get(categoryId)
  const issue = category?.issues.find((entry) => entry.slug === issueSlug)
  return issue?.label ?? issueSlug ?? 'Unknown'
}

export function problemLabel(categoryId, issueSlug, problemSlug) {
  const category = CATEGORY_INDEX.get(categoryId)
  const issue = category?.issues.find((entry) => entry.slug === issueSlug)
  const problem = issue?.problems.find((entry) => entry.slug === problemSlug)
  return problem?.label ?? problemSlug ?? 'Unknown'
}

/**
 * Deterministic search over the tree. No AI, no network.
 *
 * Every term the user typed has to appear somewhere on a node, which is what
 * stops a two-word query from matching everything: "reset email" finds the reset
 * problems and nothing else. Matching is case-insensitive and substring-based so
 * a partial word ("notif") still lands, which is what a search box is for.
 *
 * Ranked so the most specific hits come first: a problem whose own text matches
 * outranks its parent issue, which outranks a bare category. So "forgot password"
 * surfaces the forgot-password problems above the Account & Security card.
 */
export function searchSupport(query) {
  const terms = String(query || '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)

  if (terms.length === 0) return []

  const matches = (node) => {
    const haystack = node.searchText || ''
    return terms.every((term) => haystack.includes(term))
  }

  const results = []

  for (const category of SUPPORT_CATEGORIES) {
    const categoryText = `${category.label} ${category.description}`.toLowerCase()

    for (const issue of category.issues) {
      const issueText = `${issue.label} ${categoryText}`

      for (const problem of issue.problems) {
        const problemText = `${problem.label} ${problem.summary} ${problem.description} ${issueText}`.toLowerCase()

        if (!matches({ searchText: problemText })) continue

        results.push({
          score: terms.every((term) => `${problem.label} ${problem.summary}`.toLowerCase().includes(term))
            ? 3
            : terms.every((term) => issueText.includes(term))
              ? 2
              : 1,
          category,
          issue,
          problem,
        })
      }
    }
  }

  return results.sort((a, b) => b.score - a.score)
}