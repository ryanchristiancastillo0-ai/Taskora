import { CloudOff, RefreshCw, Sparkles, TriangleAlert } from 'lucide-react'
import InlineRichText from '@/components/ui/InlineRichText'
import { cx, timeAgo } from '@/utils/format'

/**
 * A single spinner, used in the composer, the status line and each pending row.
 *
 * One component so the three cannot drift apart, and `role="status"` lives on
 * the caller's element because three separate live regions announcing the same
 * thing is worse than one.
 */
export function Spinner({ className }) {
  return (
    <svg
      className={cx('animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"
      />
    </svg>
  )
}

// The chips on an empty thread. Every one of these is answerable from the
// figures the dashboard already renders, so none of them can be a question the
// backend has no data for.
export const ADMIN_AI_STARTERS = [
  'How many users are active?',
  'How is growth trending?',
  'What is overdue?',
  'Who are the most active users?',
]

// What the header badge claims. Every state is a fact about a request, not a
// mood: the widget used to say "Online & ready" before anything had been asked,
// which is a claim it could not support.
export function badgeState({ isThinking, offline, loadError }) {
  if (offline) return { label: 'Offline', tone: 'offline' }
  if (loadError) return { label: 'Unavailable', tone: 'error' }
  if (isThinking) return { label: 'Answering…', tone: 'busy' }
  return { label: 'Ready', tone: 'ready' }
}

export const BADGE_TONES = {
  ready: { text: 'text-emerald-600', dot: 'bg-success' },
  busy: { text: 'text-ink-muted', dot: 'bg-ink-faint' },
  error: { text: 'text-warning', dot: 'bg-warning' },
  offline: { text: 'text-warning', dot: 'bg-warning' },
}

function Notice({ children }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-field bg-warning-soft px-3 py-2.5 text-[12px] leading-relaxed text-ink-soft"
    >
      <TriangleAlert className="mt-0.5 size-3.5 flex-shrink-0 text-warning" strokeWidth={2} />
      <span>{children}</span>
    </p>
  )
}

/**
 * The scroll area's contents: offline and load banners, the starter chips on an
 * empty thread, and the exchanges themselves.
 */
export default function CopilotThread({
  exchanges,
  pending,
  loading,
  loadError,
  isThinking,
  online,
  scrollRef,
  onSubmitStarter,
  onRetry,
}) {
  const isEmpty = exchanges.length === 0

  return (
    <div
      ref={scrollRef}
      aria-live="polite"
      aria-busy={isThinking}
      className="relative z-10 min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4"
    >
      {/* Offline takes precedence over everything else. It is the one state where
          nothing the admin does next can work, so it is stated at the top rather
          than as a toast that scrolls away. */}
      {!online && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-field bg-warning-soft px-3 py-2.5 text-[12px] leading-relaxed text-ink-soft"
        >
          <CloudOff className="mt-0.5 size-3.5 flex-shrink-0 text-warning" strokeWidth={2} />
          <span>
            You are offline, so questions cannot be sent. Anything already asked is
            still being worked on and will be here when you reconnect.
          </span>
        </p>
      )}

      {loadError && online && <Notice>{loadError}</Notice>}

      {loading && isEmpty ? (
        <div className="flex items-center gap-2 text-[12px] text-ink-faint">
          <Spinner className="size-3.5" />
          <span>Loading conversation…</span>
        </div>
      ) : isEmpty ? (
        <div className="space-y-3">
          <p className="text-[13px] leading-relaxed text-ink-soft">
            Ask me about anything on this page — the user base, growth, task mix or
            completion.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {ADMIN_AI_STARTERS.map((starter) => (
              <button
                key={starter}
                type="button"
                disabled={!online}
                onClick={() => onSubmitStarter(starter)}
                className="rounded-full border border-border-subtle bg-surface-container/60 px-2.5 py-1 text-left text-[12px] text-ink-soft transition-colors hover:border-primary-container/40 hover:bg-primary-soft hover:text-primary disabled:opacity-40"
              >
                {starter}
              </button>
            ))}
          </div>
        </div>
      ) : (
        exchanges.map((exchange) => (
          <Exchange
            key={exchange.id}
            exchange={exchange}
            isPending={pending.has(exchange.id)}
            onRetry={() => onRetry(exchange)}
            canRetry={online}
          />
        ))
      )}
    </div>
  )
}

/**
 * One question and the state of its answer.
 *
 * Rendered as two bubbles for an answered exchange and a single compact block
 * for a pending or failed one. The reason: a question with no answer yet has no
 * assistant turn to pair it with, and drawing an empty assistant bubble for it
 * would imply a reply that does not exist.
 */
function Exchange({ exchange, isPending, onRetry, canRetry }) {
  const failed = exchange.status === 'FAILED'

  return (
    <div className="space-y-2">
      <div className="flex items-end justify-end gap-2">
        <div className="min-w-0 max-w-[85%] text-right">
          <div className="inline-block rounded-field bg-primary-container px-3 py-2 text-left text-[13px] leading-relaxed text-white">
            <p className="whitespace-pre-wrap">{exchange.question}</p>
          </div>
          <p className="mt-1 px-0.5 text-[10px] text-ink-faint">
            {timeAgo(exchange.createdAt)}
          </p>
        </div>
      </div>

      {failed ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-field bg-warning-soft px-3 py-2.5 text-[12px] leading-relaxed text-ink-soft"
        >
          <TriangleAlert className="mt-0.5 size-3.5 flex-shrink-0 text-warning" strokeWidth={2} />
          <div className="min-w-0 flex-1">
            <p>{exchange.error || 'That question could not be answered.'}</p>
            {/* A request limit is not the same failure as a bad question: the
                answer clears by itself, so the row says when instead of offering
                a Retry button that would fail again immediately. */}
            {exchange.quotaExhausted ? (
              <p className="mt-1 text-[11px] text-ink-muted">
                {canRetry
                  ? 'The provider will accept requests again shortly.'
                  : 'Waiting for the connection to come back.'}
              </p>
            ) : (
              <button
                type="button"
                onClick={onRetry}
                disabled={!canRetry}
                className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-primary underline-offset-2 hover:underline disabled:opacity-40"
              >
                <RefreshCw className="size-3" strokeWidth={2.2} />
                Try again
              </button>
            )}
          </div>
        </div>
      ) : isPending ? (
        <div className="flex items-end gap-2">
          <span className="flex size-6 flex-shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
            <Sparkles className="size-3" strokeWidth={2.2} />
          </span>
          <div
            role="status"
            aria-label="Copilot is answering"
            className="flex items-center gap-2 rounded-field bg-surface-container px-3 py-2.5 text-[12px] text-ink-muted"
          >
            <Spinner className="size-3" />
            <span>Reading the numbers…</span>
          </div>
        </div>
      ) : exchange.answer ? (
        <div className="flex items-end gap-2">
          <span className="flex size-6 flex-shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
            <Sparkles className="size-3" strokeWidth={2.2} />
          </span>
          <div className="min-w-0 max-w-[85%]">
            <div className="inline-block rounded-field bg-surface-container px-3 py-2 text-left text-[13px] leading-relaxed text-ink-soft">
              <InlineRichText text={exchange.answer} />
            </div>
            <p className="mt-1 px-0.5 text-[10px] text-ink-faint">
              {exchange.provider ? `via ${exchange.provider}` : 'answered'}
              {exchange.answeredAt ? ` · ${timeAgo(exchange.answeredAt)}` : ''}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  )
}
