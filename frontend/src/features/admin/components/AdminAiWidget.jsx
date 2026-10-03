import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUp, CloudOff, RefreshCw, Sparkles, Trash2, TriangleAlert, X } from 'lucide-react'
import ConfirmDialog from '@/shared/components/ui/ConfirmDialog'
import InlineRichText from '@/shared/components/ui/InlineRichText'
import { cx, timeAgo } from '@/shared/utils/format'
import { useOnlineStatus } from '@/shared/hooks/useOnlineStatus'
import useAdminCopilot from '../hooks/useAdminCopilot'

// The chips on an empty thread. Every one of these is answerable from the
// figures the dashboard already renders, so none of them can be a question the
// backend has no data for.
const ADMIN_AI_STARTERS = [
  'How many users are active?',
  'How is growth trending?',
  'What is overdue?',
  'Who are the most active users?',
]

const MAX_INPUT_HEIGHT = 120

// What the header badge claims. Every state is a fact about a request, not a
// mood: the widget used to say "Online & ready" before anything had been asked,
// which is a claim it could not support.
function badgeState({ isThinking, offline, loadError }) {
  if (offline) return { label: 'Offline', tone: 'offline' }
  if (loadError) return { label: 'Unavailable', tone: 'error' }
  if (isThinking) return { label: 'Answering…', tone: 'busy' }
  return { label: 'Ready', tone: 'ready' }
}

const BADGE_TONES = {
  ready: { text: 'text-emerald-600', dot: 'bg-success' },
  busy: { text: 'text-ink-muted', dot: 'bg-ink-faint' },
  error: { text: 'text-warning', dot: 'bg-warning' },
  offline: { text: 'text-warning', dot: 'bg-warning' },
}

/**
 * Floating admin copilot.
 *
 * Same visual language as the user dashboard's AiAssistantCard — brand disc,
 * gradient bloom, primary-filled user bubbles, surface-container assistant
 * bubbles, `rounded-field` — so the two read as one product.
 *
 * The difference from the previous version is where the conversation lives. It
 * used to be localStorage plus a `fetch` whose result was thrown away if the
 * widget unmounted, so navigating to another admin page mid-answer lost the reply
 * after the provider had already been paid for it. Now the server stores each
 * question, queues the answer, and pushes it back over the socket; this widget
 * only renders. That is what lets an admin ask a question, go to /admin/users,
 * and find the answer waiting — and it is why the thread survives a reload or a
 * closed tab at all.
 *
 * Replies are written from a snapshot of the same admin figures the dashboard
 * renders, so a reply can be checked against the cards above it, and a failure
 * surfaces as a real failure rather than a plausible answer nobody asked for.
 */
export default function AdminAiWidget() {
  const {
    exchanges,
    pending,
    loading,
    loadError,
    isThinking,
    send,
    retry,
    clear,
  } = useAdminCopilot()
  const online = useOnlineStatus()
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  // Clearing is the one irreversible thing this widget does, and the button that
  // does it is a 28px icon one tap away from the conversation. The dialog is the
  // difference between a mis-tap and a lost thread, and it costs one piece of
  // state: `clear` only runs from the confirm handler.
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearing, setClearing] = useState(false)

  const panelRef = useRef(null)
  const launcherRef = useRef(null)
  const scrollRef = useRef(null)
  const inputRef = useRef(null)
  // Guards against a second send while one is in flight. The hook already owns
  // the pending set; this only covers the few ms between Enter and the POST
  // landing, which is long enough to double-submit a fast double-Enter.
  const sendingRef = useRef(false)

  // No localStorage effect, and that is deliberate. This component used to cache
  // the whole thread under `taskora:admin-ai-thread`. Now the server owns it, so
  // the old key is not read and not migrated: a cached thread with no server rows
  // behind it would show answers the backend cannot vouch for, which is the one
  // failure mode the rest of this design exists to prevent. The stale key is left
  // to expire on its own rather than being deleted, so no user data is destroyed.

  // The thread runs oldest-first, so "the latest" is the bottom of the scroller
// and following the conversation means staying pinned there. Keyed on the last
// row's content rather than on `exchanges.length`: an answer arriving over the
// socket is an upsert of a row that was already on screen, so the count does not
// change even though the row grew from a spinner to a full paragraph.
const lastExchange = exchanges[exchanges.length - 1]

useEffect(() => {
    const node = scrollRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [
    exchanges.length,
    lastExchange?.status,
    lastExchange?.answer,
    isThinking,
  ])

  // Opening moves focus into the composer so the widget is keyboard-reachable
  // without tabbing through the whole dashboard first.
  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [open])

  // Escape closes, and a click anywhere outside the panel and the launcher
  // dismisses it. Checked against both refs so the launcher can toggle rather
  // than close-then-reopen in the same gesture.
  useEffect(() => {
    if (!open) return undefined

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false)
        launcherRef.current?.focus()
      }
    }

    const onPointerDown = (event) => {
      const target = event.target
      if (panelRef.current?.contains(target)) return
      if (launcherRef.current?.contains(target)) return
      setOpen(false)
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  const resizeInput = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`
  }, [])

  const submit = useCallback(
    async (text) => {
      const content = String(text ?? '').trim()
      if (!content || sendingRef.current) return

      sendingRef.current = true
      setPrompt('')
      requestAnimationFrame(resizeInput)
      try {
        await send(content)
      } finally {
        sendingRef.current = false
        inputRef.current?.focus()
      }
    },
    [resizeInput, send]
  )

  const isEmpty = exchanges.length === 0
  const badge = badgeState({ isThinking, offline: !online, loadError })
  const tone = BADGE_TONES[badge.tone]

  // `clearing` only exists to disable the dialog's own button. `clear` already
  // swallows a failed delete and reconciles from the server on the next read, so
  // there is nothing to report and nothing to retry — the dialog simply closes.
  const confirmClearThread = useCallback(async () => {
    setClearing(true)
    try {
      await clear()
      setConfirmClear(false)
    } finally {
      setClearing(false)
    }
  }, [clear])

  return (
    // Launcher and panel share one fixed column so the panel always sits exactly
    // one gap above the button, and the mobile-nav offset is declared once in
    // index.css instead of being duplicated here. The panel's height budget
    // lives beside that offset as `.assistant-panel-max-h`, for the same reason.
    <div className="assistant-launcher-inset fixed right-4 z-30 flex flex-col items-end sm:right-6">
      {open && (
        <div
          ref={panelRef}
          id="admin-ai-panel"
          role="dialog"
          aria-label="Admin copilot"
          className="animate-panel-in assistant-panel-max-h relative mb-3 flex w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-card border border-primary-container/20 bg-surface-card shadow-lifted"
        >
          <div
            className="pointer-events-none absolute -right-10 -top-10 size-36 rounded-full blur-2xl"
            style={{
              background:
                'linear-gradient(135deg, rgba(102,89,226,0.26), rgba(238,237,252,0))',
            }}
          />

          <div className="relative z-10 flex shrink-0 items-center justify-between gap-3 border-b border-border-subtle px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex size-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary-container text-white shadow-primary-glow">
                <Sparkles className="size-4" strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold leading-tight text-ink">
                  Admin Copilot
                </p>
                {/* Real state, not a permanent "Online & ready". This badge has
                    to admit a dropped connection, because the next thing the
                    admin does will be send a question that cannot reach the
                    server. */}
                <p
                  className={cx('flex items-center gap-1.5 text-[11px]', tone.text)}
                  aria-live="polite"
                >
                  <span
                    className={cx(
                      'size-1.5 rounded-full',
                      tone.dot,
                      isThinking && 'animate-pulse'
                    )}
                  />
                  {badge.label}
                </p>
              </div>
            </div>
            <div className="flex flex-shrink-0 items-center gap-0.5">
              {exchanges.length > 0 && (
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  aria-label="Clear conversation"
                  title="Clear conversation"
                  className="flex size-7 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-primary-soft hover:text-primary"
                >
                  <Trash2 className="size-3.5" strokeWidth={2} />
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  launcherRef.current?.focus()
                }}
                aria-label="Close copilot"
                title="Close"
                className="flex size-7 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-primary-soft hover:text-primary"
              >
                <X className="size-4" strokeWidth={2} />
              </button>
            </div>
          </div>

          <div
            ref={scrollRef}
            aria-live="polite"
            aria-busy={isThinking}
            className="relative z-10 min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4"
          >
            {/* Offline takes precedence over everything else in the panel. It is
                the one state where nothing the admin does next can work, so it
                is stated at the top rather than as a toast that scrolls away. */}
            {!online && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-field bg-warning-soft px-3 py-2.5 text-[12px] leading-relaxed text-ink-soft"
              >
                <CloudOff className="mt-0.5 size-3.5 flex-shrink-0 text-warning" strokeWidth={2} />
                <span>
                  You are offline, so questions cannot be sent. Anything already
                  asked is still being worked on and will be here when you
                  reconnect.
                </span>
              </p>
            )}

            {loadError && online && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-field bg-warning-soft px-3 py-2.5 text-[12px] leading-relaxed text-ink-soft"
              >
                <TriangleAlert className="mt-0.5 size-3.5 flex-shrink-0 text-warning" strokeWidth={2} />
                <span>{loadError}</span>
              </p>
            )}

            {loading && isEmpty ? (
              <div className="flex items-center gap-2 text-[12px] text-ink-faint">
                <Spinner className="size-3.5" />
                <span>Loading conversation…</span>
              </div>
            ) : isEmpty ? (
              <div className="space-y-3">
                <p className="text-[13px] leading-relaxed text-ink-soft">
                  Ask me about anything on this page — the user base, growth, task
                  mix or completion.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {ADMIN_AI_STARTERS.map((starter) => (
                    <button
                      key={starter}
                      type="button"
                      disabled={!online}
                      onClick={() => submit(starter)}
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
                  onRetry={() => retry(exchange)}
                  canRetry={online}
                />
              ))
            )}
          </div>

          {/* The composer row. The status line under it is the loading state the
              request asked for: a question that was accepted but has no answer
              yet says so here, in words, next to the box it was typed in —
              rather than only as an animated dot in the scroll area, which is
              easy to miss and says nothing about what is happening. */}
          <div className="relative z-10 shrink-0 border-t border-border-subtle bg-canvas">
            {isThinking && (
              <p
                role="status"
                className="flex items-center gap-1.5 px-3 pt-2 text-[11px] text-ink-muted"
              >
                <Spinner className="size-3" />
                <span>
                  Working on your question — you can leave this page, it will be
                  here when you come back.
                </span>
              </p>
            )}

            <div className="flex items-end gap-1 p-1.5 pl-3">
              <textarea
                ref={inputRef}
                rows={1}
                value={prompt}
                onChange={(event) => {
                  setPrompt(event.target.value)
                  resizeInput()
                }}
                onKeyDown={(event) => {
                  // Enter sends, Shift+Enter inserts a newline. Guard against the
                  // IME case where Enter is composing, not submitting.
                  if (
                    event.key === 'Enter' &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault()
                    submit(prompt)
                  }
                }}
                placeholder={
                  online
                    ? 'Ask about users, growth or tasks…'
                    : 'Offline — reconnect to ask…'
                }
                aria-label="Ask Taskora AI"
                className="max-h-[7.5rem] w-full resize-none bg-transparent py-2 text-sm leading-relaxed text-ink placeholder:text-ink-faint focus:outline-none"
              />
              <button
                type="button"
                aria-label={isThinking ? 'Waiting for the current answer' : 'Send prompt'}
                onClick={() => submit(prompt)}
                disabled={!prompt.trim() || !online}
                className="mb-0.5 flex size-8 flex-shrink-0 items-center justify-center rounded-full bg-primary-container text-white shadow-primary-glow transition-all hover:bg-primary disabled:opacity-40"
              >
                {isThinking ? (
                  <Spinner className="size-4" />
                ) : (
                  <ArrowUp className="size-4" strokeWidth={2.5} />
                )}
              </button>
            </div>
          </div>

          <p className="relative z-10 shrink-0 border-t border-border-subtle px-4 py-1.5 text-[10px] text-ink-faint">
            Answers are written from this page's figures, not from a stored report.
          </p>
        </div>
      )}

      <button
        ref={launcherRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="admin-ai-panel"
        aria-label={open ? 'Close admin copilot' : 'Open admin copilot'}
        className={cx(
          'group flex items-center gap-2 rounded-full bg-primary-container text-white shadow-primary-glow transition-all duration-200 hover:bg-primary active:scale-95',
          open ? 'size-11 justify-center sm:size-12' : 'h-11 pl-3.5 pr-4 sm:h-12'
        )}
      >
        <Sparkles className="size-[18px] flex-shrink-0 sm:size-5" strokeWidth={2.2} />
        {!open && (
          <span className="hidden text-sm font-semibold sm:block">Ask Taskora AI</span>
        )}
        {/* A dot rather than a count: the console already shows a badge on every
            other indicator, and one unanswered question does not need a number
            on top of the panel's own status line. */}
        {isThinking && !open && (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 size-3 rounded-full border-2 border-canvas bg-amber-400"
          />
        )}
      </button>

      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Clear conversation"
        message={
          exchanges.length === 1
            ? 'This deletes the one question in this thread. It cannot be undone.'
            : `This deletes all ${exchanges.length} questions in this thread, along with the answers already paid for. It cannot be undone.`
        }
        confirmLabel="Clear conversation"
        cancelLabel="Keep it"
        loading={clearing}
        onConfirm={confirmClearThread}
      />
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
            {/* A request limit is not the same failure as a bad question, and
                treating them the same is what made this feel like a dead end:
                the answer clears by itself, so the row says when instead of
                offering a Retry button that would fail again immediately. */}
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

/**
 * A single spinner, used in the composer, the status line and each pending row.
 *
 * One component so the three cannot drift apart, and `role="status"` lives on
 * the caller's element because three separate live regions announcing the same
 * thing is worse than one.
 */
function Spinner({ className }) {
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
