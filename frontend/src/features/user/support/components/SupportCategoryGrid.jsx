import { ChevronRight, LifeBuoy } from 'lucide-react'
import Card from '@/shared/components/ui/Card'
import { SUPPORT_CATEGORIES } from '../supportContent'

/**
 * The help centre's front door: one card per category, each listing the issues
 * inside it.
 *
 * Deliberately not a modal and not a wizard. Someone arriving at a help centre
 * usually has a problem in mind already, so the first screen shows every category
 * at once and lets them jump straight to the branch they need. The narrowing
 * happens in SupportIssueFlow, one step at a time, and the breadcrumb there always
 * offers a way back up.
 *
 * The card is a <section> rather than a <button>: it holds several issue buttons,
 * and a button containing buttons is invalid and breaks keyboard navigation.
 */
export default function SupportCategoryGrid({ onSelectIssue }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {SUPPORT_CATEGORIES.map((category) => {
        const Icon = category.icon

        return (
          <Card key={category.id} className="flex flex-col">
            <div className="flex items-start gap-3">
              <div className="flex size-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <Icon className="size-[18px]" strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-ink">{category.label}</h2>
                <p className="mt-0.5 text-[13px] leading-relaxed text-ink-muted">
                  {category.description}
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-1.5 border-t border-border-subtle pt-4">
              {category.issues.map((issue) => (
                <button
                  key={issue.slug}
                  type="button"
                  onClick={() => onSelectIssue(category, issue)}
                  className="group flex w-full items-center justify-between gap-3 rounded-lg border border-border-subtle bg-surface-soft/60 px-3.5 py-2.5 text-left transition-colors hover:border-primary/30 hover:bg-primary-faint"
                >
                  <span className="min-w-0 text-[13.5px] font-medium text-ink-soft group-hover:text-ink">
                    {issue.label}
                  </span>
                  <ChevronRight
                    className="size-4 flex-shrink-0 text-ink-faint transition-colors group-hover:text-primary"
                    strokeWidth={2}
                  />
                </button>
              ))}
            </div>
          </Card>
        )
      })}
    </div>
  )
}

/**
 * The "can't find it" footer under the grid.
 *
 * Points at the GENERAL category's catch-all branch rather than opening a blank
 * compose form: the user still picks "I have a general question" first, so the
 * ticket is filed with a category instead of arriving unlabelled and landing in
 * the admin queue with nothing to triage on.
 */
export function ContactSupportCard({ onSelectIssue }) {
  const general = SUPPORT_CATEGORIES.find((category) => category.id === 'GENERAL')
  const issue = general?.issues?.[0]

  return (
    <Card className="text-center">
      <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
        <LifeBuoy className="size-5" strokeWidth={2} />
      </div>
      <h2 className="text-base font-semibold text-ink">Can't find what you need?</h2>
      <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-ink-muted">
        Tell us what's going on and we'll get back to you. Pick the closest match
        and you won't need to repeat yourself.
      </p>
      {issue && (
        <button
          type="button"
          onClick={() => onSelectIssue(general, issue)}
          className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-primary-container px-4 text-sm font-medium text-white shadow-primary-glow transition-colors hover:bg-primary"
        >
          Contact Customer Support
          <ChevronRight className="size-4" strokeWidth={2} />
        </button>
      )}
    </Card>
  )
}