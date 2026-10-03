import { useState } from 'react'
import { Star } from 'lucide-react'
import Button from '@/shared/components/ui/Button'
import Card, { CardHeader } from '@/shared/components/ui/Card'

/**
 * "How helpful was this?" — the help centre's own 1-5 rating.
 *
 * Separate from the support ticket on purpose. A ticket asks "please fix this";
 * a rating here is about whether the page answered the question, and it is only
 * meaningful once someone has actually read something. So the card appears below
 * the request history, not on the solution step — measuring a page before it was
 * read produces noise.
 *
 * Submitting replaces the form with a thank-you rather than showing a toast
 * alone: the answer is visible, there is nothing left to do, and leaving a live
 * star row on screen invites the reader to click it again and file a second
 * rating for the same visit.
 */
export default function SupportRating({ onSubmit }) {
  const [rating, setRating] = useState(0)
  const [hovered, setHovered] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const shown = hovered || rating

  const send = async () => {
    if (!rating || submitting) return
    setSubmitting(true)
    try {
      await onSubmit(rating)
      setDone(true)
    } catch {
      // Left for the page's toast to report; the stars stay put so the rating
      // can be resubmitted without setting up again.
      setRating(0)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader
        title="Rate this help centre"
        subtitle="Five taps tells us which articles to write next."
      />

      {done ? (
        <div className="flex items-center gap-2 rounded-field border border-success/25 bg-success-soft px-3.5 py-3 text-sm text-emerald-700">
          <Star className="size-4 flex-shrink-0 fill-current" strokeWidth={2} />
          Thanks — that helps us prioritise.
        </div>
      ) : (
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div
            className="flex items-center gap-1"
            role="radiogroup"
            aria-label="Rate the help centre from 1 to 5"
            onMouseLeave={() => setHovered(0)}
          >
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={rating === value}
                aria-label={`${value} star${value === 1 ? '' : 's'}`}
                disabled={submitting}
                onMouseEnter={() => setHovered(value)}
                onFocus={() => setHovered(value)}
                onClick={() => setRating(value)}
                className="rounded p-1 transition-transform hover:scale-110 disabled:pointer-events-none"
              >
                <Star
                  className={
                    value <= shown
                      ? 'size-6 fill-amber-400 text-amber-400'
                      : 'size-6 text-ink-faint'
                  }
                  strokeWidth={1.75}
                />
              </button>
            ))}
          </div>

          <Button
            size="sm"
            variant="soft"
            onClick={send}
            loading={submitting}
            disabled={!rating || submitting}
          >
            Send rating
          </Button>
        </div>
      )}
    </Card>
  )
}