import { CheckCircle2, LifeBuoy } from 'lucide-react'
import { Link } from 'react-router-dom'
import Button, { buttonClasses } from '@/shared/components/ui/Button'
import Card, { CardHeader } from '@/shared/components/ui/Card'

/**
 * The answer for one problem, and the way out to a human.
 *
 * Two separate things on purpose. The steps are the answer; the support-request
 * button is not part of it. Someone whose problem the steps fixed should never
 * feel nudged into filing a ticket, so the request call to action sits below a
 * divider under its own "still having trouble?" heading — it is offered, not
 * pushed. The same rule is why the request form arrives on the next step rather
 * than opening under this card.
 */
export default function SupportSolution({ problem, onStartRequest }) {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader title={problem.label} subtitle={problem.description} />

        {problem.steps?.length > 0 && (
          <div>
            <p className="mb-3 text-[13px] font-semibold text-ink-soft">Try these steps:</p>
            <ol className="flex flex-col gap-3">
              {problem.steps.map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span className="flex size-6 flex-shrink-0 items-center justify-center rounded-full bg-primary-soft text-[11px] font-semibold text-primary">
                    {index + 1}
                  </span>
                  <span className="pt-0.5 text-sm leading-relaxed text-ink-soft">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {problem.action && (
          <div className="mt-5 border-t border-border-subtle pt-5">
            {/*
              A react-router <Link> rather than a <Button>, because this leads
              somewhere inside Taskora ("Resend reset email" goes to
              /forgot-password) and an <a href> would drop the SPA state and
              re-run bootstrap. `buttonClasses` is the shared Button's own
              exported class builder, so the control is pixel-identical to every
              other button in the app without Button needing an asChild prop it
              has never had.
            */}
            <Link
              to={problem.action.to}
              className={buttonClasses({ variant: 'soft' })}
            >
              <CheckCircle2 className="size-[18px]" strokeWidth={2} />
              {problem.action.label}
            </Link>
          </div>
        )}
      </Card>

      <Card>
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex size-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <LifeBuoy className="size-[18px]" strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-ink">Still having trouble?</h2>
              <p className="mt-0.5 text-[13px] leading-relaxed text-ink-muted">
                We'll already know the topic you picked — you won't have to explain it
                again.
              </p>
            </div>
          </div>
          <Button variant="secondary" onClick={onStartRequest} className="w-full sm:w-auto">
            Submit Support Request
          </Button>
        </div>
      </Card>
    </div>
  )
}