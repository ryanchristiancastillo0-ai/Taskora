import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUp, Sparkles, Trash2, X } from 'lucide-react'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { cx } from '@/utils/format'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import useAdminCopilot from '@/features/admin/hooks/useAdminCopilot'
import CopilotThread, {
  BADGE_TONES,
  Spinner,
  badgeState,
} from './ai/CopilotThread'

const MAX_INPUT_HEIGHT = 120

/**
 * Floating admin copilot.
 *
 * Same visual language as the user dashboard's AiAssistantCard — brand disc,
 * gradient bloom, primary-filled user bubbles, surface-container assistant
 * bubbles, `rounded-field` — so the two read as one product.
 *
 * The conversation lives on the server, not here: each question is stored, the
 * answer is queued, and it is pushed back over the socket, so this component only
 * renders. That is what lets an admin ask a question, go to /admin/users, and
 * find the answer waiting. Replies are written from a snapshot of the same admin
 * figures the dashboard renders, so a reply can be checked against the cards
 * above it.
 *
 * The panel's contents — banners, starter chips, exchanges — are in ./ai/CopilotThread.
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
                {/* Real state, not a permanent "Online & ready". This badge has to
                    admit a dropped connection, because the next thing the admin
                    does will be send a question that cannot reach the server. */}
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

          <CopilotThread
            exchanges={exchanges}
            pending={pending}
            loading={loading}
            loadError={loadError}
            isThinking={isThinking}
            online={online}
            scrollRef={scrollRef}
            onSubmitStarter={submit}
            onRetry={retry}
          />

          {/* The composer row. The status line under it is the loading state the
              request asked for: a question that was accepted but has no answer
              yet says so here, in words, next to the box it was typed in —
              rather than only as an animated dot in the scroll area. */}
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
            other indicator, and one unanswered question does not need a number on
            top of the panel's own status line. */}
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
