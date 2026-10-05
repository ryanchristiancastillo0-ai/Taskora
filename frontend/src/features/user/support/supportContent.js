import { accountSecurity } from './content/accountSecurity'
import { tasksProjects } from './content/tasksProjects'
import { aiAssistant } from './content/aiAssistant'
import { notifications } from './content/notifications'
import { settingsPreferences } from './content/settingsPreferences'
import { reportBug } from './content/reportBug'
import { general } from './content/general'

/**
 * The help centre's content tree, plus the lookups and search over it. The
 * category data itself lives in ./content, one module per category.
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
 * Adding an entry: append to the relevant category in ./content. Nothing else in
 * the app needs to change — the category grid, the search index and the guided
 * flow are all derived from the array below.
 */

export { accountSecurity, aiAssistant, general, notifications, reportBug, settingsPreferences, tasksProjects }

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

/** Display order of the category grid; the ids are the backend contract. */
export const SUPPORT_CATEGORIES = [
  accountSecurity,
  tasksProjects,
  aiAssistant,
  notifications,
  settingsPreferences,
  reportBug,
  general,
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
