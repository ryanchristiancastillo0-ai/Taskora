import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUp, Lightbulb, Loader2, Sparkles, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import InlineRichText from '@/shared/components/ui/InlineRichText'
import { api } from '@/shared/api/client'
import { normalizeAiMessage } from '@/shared/api/normalize'
import { cx } from '@/shared/utils/format'

const STORAGE_KEY = 'taskora:dashboard-ai-thread'

// The assistant runs through a job queue, so a reply can arrive either in the
// POST response (queue disabled) or later over the socket (queue enabled).
// Without this ceiling a dropped or failed job would leave the card spinning
// forever with no explanation.
const REPLY_TIMEOUT_MS = 90_000

const STARTERS = [
  'How many tasks do I have?',
  "What's due today?",
  'How do I change dark mode?',
]

function readThread() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.slice(-12) : []
  } catch {
    return []
  }
}

export default function AiAssistantCard() {
  const { data, actions, pushToast } = useApp()
  const navigate = useNavigate()

  const [prompt, setPrompt] = useState('')
  const [thread, setThread] = useState(readThread)
  const [pending, setPending] = useState(false)
  const [awaiting, setAwaiting] = useState(null)
  const [insight, setInsight] = useState(null)
  const [loadingInsight, setLoadingInsight] = useState(true)

  const scrollRef = useRef(null)
  const inputRef = useRef(null)
  // Monotonic counter for locally-created message ids. A ref rather than
  // Date.now() so the value is deterministic and does not read the clock from
  // inside a state updater.
  const localIdRef = useRef(0)
  const nextLocalId = useCallback((kind) => {
    localIdRef.current += 1
    return `${kind}-${localIdRef.current}`
  }, [])

  // Counts and the smart suggestion come from the server so they use the user's
  // stored timezone and the same snapshot the assistant reads. Deriving them in
  // the browser is what previously made the card disagree with reality.
  //
  // Deliberately does not flip back to the loading state on refresh: state
  // already starts as loading, and blanking the card after every reply would
  // make the numbers flicker for no reason.
  const loadInsight = useCallback(async () => {
    try {
      // The api client already unwraps the backend's { success, data } envelope,
      // so this is the payload itself, not res.data.
      const res = await api.get('/ai/dashboard')
      setInsight(res ?? null)
    } catch {
      setInsight(null)
    } finally {
      setLoadingInsight(false)
    }
  }, [])

  useEffect(() => {
    loadInsight()
  }, [loadInsight])

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(thread))
    } catch {
      /* storage full or blocked; the thread still works in-memory */
    }
  }, [thread])

  useEffect(() => {
    const node = scrollRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [thread, pending])

  // Queued replies land in data.aiMessages via the socket rather than in the
  // POST response, so watch for the answer arriving there.
  //
  // Two guards matter here:
  //  - only replies newer than the question, otherwise an assistant message left
  //    over from an earlier session matches immediately, the spinner is
  //    cancelled before it ever paints, and stale text appears as the answer
  //  - only the newest reply, and only once
  useEffect(() => {
    if (!awaiting || !Array.isArray(data.aiMessages)) return

    const reply = data.aiMessages
      .filter((message) => {
        if (message.role !== 'ASSISTANT') return false
        if (message.conversationId !== awaiting.conversationId) return false
        if (awaiting.since == null) return true
        return new Date(message.createdAt ?? 0).getTime() > awaiting.since
      })
      .sort((a, b) => new Date(a.createdAt ?? 0) - new Date(b.createdAt ?? 0))
      .pop()

    if (!reply) return

    setThread((prev) =>
      prev.some((message) => message.id === reply.id)
        ? prev
        : [...prev, { id: reply.id, role: 'ASSISTANT', content: reply.content }].slice(-12)
    )
    setAwaiting(null)
    setPending(false)
  }, [data.aiMessages, awaiting, nextLocalId])

  // Safety net so a failed or dropped job cannot strand the spinner.
  useEffect(() => {
    if (!awaiting) return undefined
    const timer = setTimeout(() => {
      setAwaiting(null)
      setPending(false)
      setThread((prev) => [
        ...prev,
        {
          id: nextLocalId('local-timeout'),
          role: 'ASSISTANT',
          content:
            'That is taking longer than expected. You can see the full conversation on the AI Assistant page.',
          isError: true,
        },
      ])
    }, REPLY_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [awaiting, nextLocalId])

  const send = async (text) => {
    const content = String(text ?? '').trim()
    if (!content || pending) return

    setPrompt('')
    setPending(true)
    setThread((prev) => [
      ...prev,
      { id: nextLocalId('local'), role: 'USER', content },
    ])

    try {
      // Posts into the user's most recent AI conversation, so the exchange is
      // persisted in the database and also visible on the full /ai page.
      const result = await actions.sendMessage(content)

      const reply = normalizeAiMessage(result?.assistantMessage)

      if (reply?.content) {
        // Queue disabled: the answer came back in the response.
        setThread((prev) => [
          ...prev,
          { id: reply.id, role: 'ASSISTANT', content: reply.content },
        ])
        setPending(false)
      } else {
        // Queue enabled: wait for the socket to deliver it.
        //
        // The cutoff is the user message's own server-assigned createdAt rather
        // than the browser clock, so this stays correct even when the two clocks
        // disagree. Anything not strictly newer is an older reply being reused.
        const askedAt = result?.userMessage?.createdAt
          ? new Date(result.userMessage.createdAt).getTime()
          : null

        setAwaiting({
          conversationId: result?.userMessage?.conversationId ?? null,
          since: askedAt,
        })
      }

      loadInsight()
    } catch (error) {
      pushToast(error.message || 'Could not reach the assistant', 'danger')
      setAwaiting(null)
      setPending(false)
      setThread((prev) => [
        ...prev,
        {
          id: nextLocalId('local-error'),
          role: 'ASSISTANT',
          content: `Sorry, that did not go through: ${error.message}. Please try again.`,
          isError: true,
        },
      ])
    } finally {
      // Deliberately does not clear `pending`: on the queued path the spinner
      // must stay up until the socket delivers the reply.
      inputRef.current?.focus()
    }
  }

  const clearThread = () => {
    setThread([])
    setAwaiting(null)
    setPending(false)
    window.localStorage.removeItem(STORAGE_KEY)
    inputRef.current?.focus()
  }

  const counts = insight?.counts

  // Distinguish "no tasks due" (a real 0) from "could not load" — showing 0 for
  // a failed fetch reads as a confident wrong answer.
  const unknown = loadingInsight || !insight

  return (
    // Not a flex column on purpose. The dashboard lays these cards out in a
    // `flex flex-col` column, so a flex child stretches to match its
    // neighbour's height — an `mt-auto` composer then gets pushed to the bottom
    // of the stretched card, detached from the content above it. Sizing to
    // content keeps the composer directly under the thread.
    <div className="relative flex flex-col overflow-hidden rounded-card border border-primary-container/20 bg-surface-card shadow-lifted">
      <div
        className="pointer-events-none absolute -right-14 -top-14 size-44 rounded-full blur-2xl"
        style={{
          background:
            'linear-gradient(135deg, rgba(102,89,226,0.28), rgba(238,237,252,0))',
        }}
      />

      {/* Header + one-line summary */}
      <div className="relative z-10 px-5 pt-5 sm:px-6 sm:pt-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary-container text-white shadow-primary-glow">
              <Sparkles className="size-[18px]" strokeWidth={2} />
            </div>
            <div>
              <p className="text-[15px] font-semibold leading-tight text-ink">
                AI Assistant
              </p>
              <p className="flex items-center gap-1.5 text-xs text-emerald-600">
                <span className="size-1.5 animate-pulse rounded-full bg-success" />
                Online &amp; ready
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {thread.length > 0 && (
              <button
                type="button"
                onClick={clearThread}
                aria-label="Clear this card's conversation"
                title="Clear conversation"
                className="flex size-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-primary-soft hover:text-primary"
              >
                <Trash2 className="size-4" strokeWidth={2} />
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate('/ai')}
              aria-label="Open full assistant"
              title="Open full assistant"
              className="flex size-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-primary-soft hover:text-primary"
            >
              <ArrowUp className="size-4 rotate-45" strokeWidth={2} />
            </button>
          </div>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-ink">
          {loadingInsight
            ? 'Checking your day…'
            : (insight?.summary ??
              'Ask me about your tasks, goals, deadlines, or how something in Taskora works.')}
        </p>
      </div>

      {/* Compact stat strip instead of two large tiles */}
      <div className="relative z-10 mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-y border-border-subtle bg-surface-container/40 px-5 py-2.5 text-[12px] sm:px-6">
        <Stat label="Due today" value={unknown ? '–' : counts.dueToday} tone="text-primary" />
        <Stat label="Overdue" value={unknown ? '–' : counts.overdue} tone="text-danger" />
        {!unknown && (
          <>
            <Stat label="Open" value={counts.openTasks} tone="text-ink-soft" />
            <Stat label="Goals" value={counts.goalsActive} tone="text-ink-soft" />
            <Stat label="Habits" value={counts.habitsActive} tone="text-ink-soft" />
          </>
        )}
      </div>

      {insight?.suggestion && !loadingInsight && (
        <div className="relative z-10 flex items-start gap-2.5 px-5 py-3 text-[13px] leading-snug text-ink-soft sm:px-6">
          <Lightbulb className="mt-0.5 size-4 flex-shrink-0 text-primary" strokeWidth={2} />
          <span>{insight.suggestion}</span>
        </div>
      )}

      {/* Chat thread takes the focus once it exists */}
      {thread.length > 0 && (
        <div
          ref={scrollRef}
          className="relative z-10 max-h-72 space-y-3 overflow-y-auto border-t border-border-subtle px-5 py-4 sm:px-6"
        >
          {thread.map((message) => (
            <Bubble key={message.id} message={message} />
          ))}
        </div>
      )}

      {pending && (
        <div className="relative z-10 flex items-center gap-2 border-t border-border-subtle px-5 py-2.5 text-[13px] text-ink-faint sm:px-6">
          <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />
          Thinking…
        </div>
      )}

      {thread.length === 0 && !pending && (
        <div className="relative z-10 flex flex-wrap gap-1.5 px-5 pt-1 sm:px-6">
          {STARTERS.map((starter) => (
            <button
              key={starter}
              type="button"
              onClick={() => send(starter)}
              className="rounded-full border border-border-subtle bg-surface-container/60 px-2.5 py-1 text-[12px] text-ink-soft transition-colors hover:border-primary-container/40 hover:bg-primary-soft hover:text-primary"
            >
              {starter}
            </button>
          ))}
        </div>
      )}

      <div className="relative z-10 flex items-center gap-1 border-t border-border-subtle bg-canvas p-1 pl-3.5">
        <input
          ref={inputRef}
          type="text"
          value={prompt}
          disabled={pending}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') send(prompt)
          }}
          placeholder="Ask about your tasks, goals or settings…"
          aria-label="Ask the assistant"
          className="w-full bg-transparent py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none disabled:opacity-60"
        />
        <button
          type="button"
          aria-label="Send prompt"
          onClick={() => send(prompt)}
          className="flex size-8 items-center justify-center rounded-full bg-primary-container text-white shadow-primary-glow transition-colors hover:bg-primary disabled:opacity-50"
          disabled={!prompt.trim() || pending}
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" strokeWidth={2.5} />
          ) : (
            <ArrowUp className="size-4" strokeWidth={2.5} />
          )}
        </button>
      </div>
    </div>
  )
}

function Bubble({ message }) {
  const isUser = message.role === 'USER'

  return (
    <div className={cx('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cx(
          'max-w-[88%] rounded-field px-3 py-2 text-[13px] leading-relaxed',
          isUser
            ? 'bg-primary-container text-white'
            : message.isError
              ? 'bg-danger-soft text-danger'
              : 'bg-surface-container text-ink-soft'
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <InlineRichText text={message.content} />
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, tone }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cx('size-1.5 flex-shrink-0 rounded-full bg-current', tone)} />
      <span className="text-ink-faint">{label}</span>
      <span className={cx('font-semibold', tone)}>{value}</span>
    </span>
  )
}
