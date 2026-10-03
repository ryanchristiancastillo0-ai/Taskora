import { ChevronRight, Home } from 'lucide-react'
import Button from '@/shared/components/ui/Button'
import Card, { CardHeader } from '@/shared/components/ui/Card'
import SupportSolution from './SupportSolution'

/**
 * The narrowing half of the guided flow, from a category down to a solution.
 *
 * One component owns all three levels rather than three separate screens,
 * because they are one decision being made in stages: pick an issue, pick which
 * symptom matches, read the fix. Splitting them would mean remounting a header
 * and losing scroll position between clicks.
 *
 * Every level is reached by selection rather than by a step counter, so "go back"
 * is always a breadcrumb click and there is no way to reach a step whose
 * prerequisite was skipped.
 */
export default function SupportIssueFlow({
  category,
  issue,
  problem,
  onSelectIssue,
  onSelectProblem,
  onBackHome,
  onBackToCategory,
  onStartRequest,
}) {
  return (
    <div className="flex flex-col gap-4">
      <SupportBreadcrumb
        category={category}
        issue={issue}
        problem={problem}
        onBackHome={onBackHome}
        onBackToCategory={onBackToCategory}
      />

      {/* --- Level 1: which issue in this category? --- */}
      {!issue && (
        <Card>
          <CardHeader
            title={category.label}
            subtitle={`Which of these best matches your problem in ${category.label.toLowerCase()}?`}
          />
          <div className="flex flex-col gap-2">
            {category.issues.map((entry) => (
              <button
                key={entry.slug}
                type="button"
                onClick={() => onSelectIssue(entry)}
                className="group flex items-center justify-between gap-3 rounded-field border border-border-subtle bg-surface-soft/60 px-4 py-3 text-left transition-colors hover:border-primary/30 hover:bg-primary-faint"
              >
                <span className="text-sm font-medium text-ink-soft group-hover:text-ink">
                  {entry.label}
                </span>
                <ChevronRight
                  className="size-4 flex-shrink-0 text-ink-faint transition-colors group-hover:text-primary"
                  strokeWidth={2}
                />
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* --- Level 2: which symptom? Native radios, not clickable divs, so
             keyboard and screen-reader users get the same list for free. --- */}
      {issue && !problem && (
        <Card>
          <CardHeader
            title={issue.label}
            subtitle="What problem are you experiencing?"
          />
          <div className="flex flex-col gap-2">
            {issue.problems.map((entry) => (
              <label
                key={entry.slug}
                className="group flex cursor-pointer items-center gap-3 rounded-field border border-border-subtle bg-surface-soft/60 px-4 py-3 transition-colors hover:border-primary/30 hover:bg-primary-faint"
              >
                <input
                  type="radio"
                  name="support-problem"
                  value={entry.slug}
                  className="peer sr-only"
                  onChange={() => onSelectProblem(entry)}
                />
                <span
                  aria-hidden="true"
                  className="flex size-[18px] flex-shrink-0 items-center justify-center rounded-full border-2 border-border-subtle transition-colors peer-checked:border-primary"
                >
                  <span className="size-2 rounded-full bg-primary opacity-0 transition-opacity peer-checked:opacity-100" />
                </span>
                <span className="text-sm font-medium text-ink-soft group-hover:text-ink">
                  {entry.label}
                </span>
              </label>
            ))}
          </div>
        </Card>
      )}

      {/* --- Level 3: the fix, plus the way out to a real person. --- */}
      {issue && problem && (
        <SupportSolution
          problem={problem}
          onStartRequest={onStartRequest}
        />
      )}

      {issue && problem && (
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onBackToCategory}
            icon={Home}
          >
            Back to all topics
          </Button>
        </div>
      )}
    </div>
  )
}

/**
 * Where am I in the tree.
 *
 * A trail of buttons rather than a step indicator, because each crumb is a real
 * destination: "Account & Security" has to take the user back to the category
 * screen with the issue list, not scroll up. Segments the user has not reached
 * yet are inert text, so the control cannot offer a way out of a step that does
 * not exist yet.
 */
function SupportBreadcrumb({ category, issue, problem, onBackHome, onBackToCategory }) {
  return (
    <nav aria-label="Support breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-[13px]">
        <li>
          <button
            type="button"
            onClick={onBackHome}
            className="rounded font-medium text-ink-muted transition-colors hover:text-primary"
          >
            Customer Service
          </button>
        </li>
        <ChevronRight className="size-3.5 text-ink-faint" strokeWidth={2} aria-hidden="true" />

        <li>
          <button
            type="button"
            onClick={onBackToCategory}
            className="rounded font-medium text-ink-muted transition-colors hover:text-primary"
          >
            {category.label}
          </button>
        </li>

        {issue && (
          <>
            <ChevronRight className="size-3.5 text-ink-faint" strokeWidth={2} aria-hidden="true" />
            <li>
              <span className="font-medium text-ink-muted">{issue.label}</span>
            </li>
          </>
        )}

        {problem && (
          <>
            <ChevronRight className="size-3.5 text-ink-faint" strokeWidth={2} aria-hidden="true" />
            <li>
              <span className="font-medium text-ink">{problem.label}</span>
            </li>
          </>
        )}
      </ol>
    </nav>
  )
}