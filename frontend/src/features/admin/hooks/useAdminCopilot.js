import { useCallback, useEffect, useRef, useState } from 'react'
import { askAdmin, clearCopilotThread, getCopilotThread } from '@/features/admin/services/adminApi'

// How often the thread is re-read while something is unanswered. The socket
// normally delivers the answer first, so this is the fallback for a dropped
// connection or a tab that was closed — not the primary path.
const POLL_INTERVAL_MS = 3000

// Backoff ceiling. Grows while the network is refusing, so a server that is
// down is not hammered at a fixed rate for as long as the tab is open.
const MAX_BACKOFF_MS = 30_000

// The socket is created by AppContext once auth resolves, which is not
// guaranteed to have happened by the time the copilot mounts. These bound how
// long the push listener waits for it to appear before falling back to polling
// for good.
const SOCKET_ATTACH_RETRY_MS = 250
const SOCKET_ATTACH_ATTEMPTS = 20

// A fetch that never resolves is indistinguishable from a slow one from the
// caller's side, so every request gets a deadline. Without it a request fired
// just before a network drop can hang for the browser's own multi-minute
// timeout and the "Answering…" state outlives any reasonable wait.
const REQUEST_TIMEOUT_MS = 15_000

// The thread reads oldest-first, so a question asked now lands at the bottom of
// the panel where the eye already is. Every list is normalized through this
// before it is stored or rendered, so display order can never depend on which
// code path produced it: the poll returns the server's slice, the socket pushes
// a single row, and the optimistic row is built locally. `createdAt` is the
// sort key rather than array position because the three disagree about
// position but not about time, and an optimistic row has to sort against real
// server rows that were created microseconds earlier.
const byOldestFirst = (a, b) => new Date(a.createdAt) - new Date(b.createdAt)

/**
 * The admin copilot's state, as a durable conversation rather than a
 * request/response pair.
 *
 * The contract this hook exists to provide:
 *
 *  - An ask survives the widget unmounting. The server stores the question and
 *    queues the answer, so navigating to another admin page does not cancel it.
 *  - An ask survives the tab closing. On mount the thread is re-read, so an
 *    answer that landed while the tab was shut is on screen immediately.
 *  - An ask survives losing the network. The question is already stored before
 *    the request is sent, so a failed send is recoverable rather than lost, and
 *    polling resumes by itself when connectivity returns.
 *  - A failure is never dressed up as an answer. A question that failed shows
 *    as failed, with a retry, and never as an empty or invented reply.
 *
 * Progress is a single `pending` set of exchange ids rather than a boolean,
 * because two questions can be in flight at once (one from this tab, one from a
 * previous visit) and a boolean would animate the wrong row.
 */
export default function useAdminCopilot() {
  const [exchanges, setExchanges] = useState([])
  const [pending, setPending] = useState(() => new Set())
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  // Ids that failed to send, as opposed to failing to be answered. These are the
  // ones worth offering a retry for, and they are cleared the moment a retry
  // succeeds.
  const [sendFailures, setSendFailures] = useState(() => new Map())

  // Refs rather than state for anything the socket and poll callbacks read, so
  // a listener never closes over a stale copy and a change to one does not
  // re-register the other.
  const exchangesRef = useRef([])
  const pendingRef = useRef(new Set())
  const mountedRef = useRef(true)
  const backoffRef = useRef(0)
  const pollTimerRef = useRef(null)
  const inflightRef = useRef(0)

  const applyThread = useCallback((items) => {
    const list = Array.isArray(items) ? [...items].sort(byOldestFirst) : []
    exchangesRef.current = list
    if (mountedRef.current) setExchanges(list)

    // The server's own status is the source of truth for what is outstanding.
    // Recomputing from it, rather than patching locally, is what keeps a row
    // that failed in a background worker from spinning forever: the poll that
    // observes FAILED clears the id and the row stops animating.
    const stillPending = new Set(
      list.filter((item) => item.status === 'PENDING').map((item) => item.id)
    )
    pendingRef.current = stillPending
    if (mountedRef.current) setPending(stillPending)
  }, [])

  const markFailedToSend = useCallback((id, message) => {
    if (!mountedRef.current) return
    setSendFailures((prev) => {
      const next = new Map(prev)
      next.set(id, message)
      return next
    })
  }, [])

  const clearSendFailure = useCallback((id) => {
    if (!mountedRef.current) return
    setSendFailures((prev) => {
      if (!prev.has(id)) return prev
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }, [])

  /**
   * Merges an exchange in without disturbing the rest of the list.
   *
   * `upsert` rather than a replace is what makes the socket push safe to apply
   * at any time: the same exchange can arrive as an optimistic local row, as a
   * socket push, and as a poll result, and the last one to arrive must win
   * without duplicating the row.
   */
  const upsertExchange = useCallback((exchange) => {
    if (!exchange?.id) return
    const list = exchangesRef.current
    const index = list.findIndex((item) => item.id === exchange.id)
    const next =
      index === -1
        ? [...list, exchange]
        : list.map((item, i) => (i === index ? { ...item, ...exchange } : item))

    next.sort(byOldestFirst)
    exchangesRef.current = next
    if (mountedRef.current) setExchanges(next)

    // A push that carries a finished row also ends the wait. `pending` is what
    // drives the spinner, so without this the socket delivered the answer and
    // the row still read "Reading the numbers…" until the next poll noticed.
    if (exchange.status && exchange.status !== 'PENDING' && pendingRef.current.has(exchange.id)) {
      const remaining = new Set(pendingRef.current)
      remaining.delete(exchange.id)
      pendingRef.current = remaining
      if (mountedRef.current) setPending(remaining)
    }
  }, [])

  /**
   * Re-reads the thread. Safe to call from anywhere; concurrent calls share one
   * in-flight request so a socket push landing mid-poll cannot start a second
   * round trip for data that is seconds old.
   */
  const refresh = useCallback(async () => {
    if (inflightRef.current > 0) return null
    inflightRef.current += 1
    try {
      const data = await getCopilotThread(50)
      if (mountedRef.current) {
        setLoadError(null)
        backoffRef.current = 0
      }
      applyThread(data?.items)
      return data
    } catch (error) {
      // A failed read is only worth showing when there is nothing on screen yet.
      // Once a thread is loaded, a blip while polling must not replace a
      // conversation with an error page.
      if (mountedRef.current && exchangesRef.current.length === 0) {
        setLoadError(error?.message || 'Could not load the conversation')
      }
      return null
    } finally {
      inflightRef.current -= 1
      // The first read is what `loading` is for. It is cleared here rather than
      // after `applyThread` so that an empty thread also stops spinning, and so a
      // failed first read falls through to the error/empty state instead of
      // leaving a spinner over a blank panel forever.
      if (mountedRef.current) setLoading(false)
    }
  }, [applyThread])

  // Mount: load the thread, then keep polling only while something is
  // outstanding. The interval is torn down the moment nothing is pending, so an
  // idle console makes no requests at all.
  useEffect(() => {
    mountedRef.current = true
    refresh()

    return () => {
      mountedRef.current = false
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
    }
  }, [refresh])

  useEffect(() => {
    if (pending.size === 0) {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current)
        pollTimerRef.current = null
      }
      return undefined
    }

    // An unanswered question from a previous visit may be sitting behind a
    // worker that is still retrying, so the poll keeps going. The backoff caps
    // the cost of a provider that is down.
    //
    // The next tick is armed from inside the tick, never by this effect
    // re-running. Its only dependency that moves while a question is
    // outstanding is `pending.size`, so a tick that found the size unchanged
    // used to be the last one ever scheduled: the row then sat on "Reading the
    // numbers…" until a reload, because the reload was the only thing that read
    // the thread again.
    let cancelled = false

    const tick = async () => {
      if (cancelled || !mountedRef.current) return

      const wait = Math.min(backoffRef.current || POLL_INTERVAL_MS, MAX_BACKOFF_MS)
      const data = await refresh()
      if (cancelled || !mountedRef.current) return

      // Back off only when the read itself failed. `pending > 0` is a healthy
      // state, not a sick server, and treating it as one doubled the interval
      // every round until it hit the ceiling.
      backoffRef.current = data
        ? 0
        : Math.min(Math.max(wait * 2, POLL_INTERVAL_MS), MAX_BACKOFF_MS)

      pollTimerRef.current = setTimeout(
        tick,
        Math.min(backoffRef.current || POLL_INTERVAL_MS, MAX_BACKOFF_MS)
      )
    }

    pollTimerRef.current = setTimeout(
      tick,
      Math.min(backoffRef.current || POLL_INTERVAL_MS, MAX_BACKOFF_MS)
    )

    return () => {
      cancelled = true
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current)
        pollTimerRef.current = null
      }
    }
  }, [pending.size, refresh])

  // The socket push is the fast path; the poll above is the fallback. Both apply
  // the same upsert, so a duplicated arrival is harmless.
  useEffect(() => {
    let socket = null
    let detach = null
    let cancelled = false
    let retryTimer = null

    const attach = async (attempt) => {
      if (cancelled) return

      const { getSocket } = await import('@/services/api/socket')
      if (cancelled) return
      socket = getSocket()

      // AppContext only creates the socket once auth resolves, which can land
      // after this effect runs. Retrying is what keeps the fast path alive: a
      // single null here used to disable the push permanently, leaving the poll
      // as the only route an answer could take.
      if (!socket) {
        if (attempt < SOCKET_ATTACH_ATTEMPTS) {
          retryTimer = setTimeout(() => attach(attempt + 1), SOCKET_ATTACH_RETRY_MS)
        }
        return
      }

      const onAnswer = (payload) => {
        if (payload?.exchange) upsertExchange(payload.exchange)
      }

      // Reconnecting is exactly when the thread is most likely to be stale:
      // anything that answered while this tab was disconnected arrived as a
      // push nobody was listening for.
      const onConnect = () => refresh()

      socket.on('admin:copilot:answer', onAnswer)
      socket.on('connect', onConnect)

      // Covers the case where the socket was already live before this effect
      // ran, which is the normal case in the console.
      if (socket.connected) onConnect()

      detach = () => {
        socket.off('admin:copilot:answer', onAnswer)
        socket.off('connect', onConnect)
      }
    }

    attach(0)

    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
      if (detach) detach()
    }
  }, [refresh, upsertExchange])

  const send = useCallback(
    async (question) => {
      const text = String(question ?? '').trim()
      if (!text) return null

      // A local id for the optimistic row. Deliberately not a cuid and not the
      // server's id: the row exists only until the server's own row replaces it,
      // and prefixing it makes the swap obvious in devtools.
      const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

      const optimistic = {
        id: localId,
        question: text,
        answer: null,
        status: 'PENDING',
        error: null,
        provider: null,
        createdAt: new Date().toISOString(),
        answeredAt: null,
        optimistic: true,
      }

      applyThread([...exchangesRef.current, optimistic])

      try {
        const data = await withTimeout(askAdmin(text), REQUEST_TIMEOUT_MS)

        // Replace the local row with the server's. The id changes here, so the
        // optimistic row has to be dropped by identity rather than by id.
        const list = exchangesRef.current.filter((item) => item.id !== localId)
        exchangesRef.current = list
        if (mountedRef.current) setExchanges(list)

        const exchangeId = data?.exchangeId ?? data?.id ?? null

        if (data?.status === 'done' && data?.answer) {
          // The inline fallback (Redis was down) answered in the same request.
          upsertExchange({
            id: exchangeId || localId,
            question: text,
            answer: data.answer,
            status: 'ANSWERED',
            provider: data.provider ?? null,
            error: null,
            createdAt: new Date().toISOString(),
            answeredAt: new Date().toISOString(),
          })
          return data
        }

        // The normal case: accepted and queued. Mark the id pending so the poll
        // loop starts, and reconcile from the server so the row carries the
        // real id rather than the local one.
        if (exchangeId) {
          const next = new Set(pendingRef.current)
          next.add(exchangeId)
          pendingRef.current = next
          if (mountedRef.current) setPending(next)
        }

        // Read the thread straight back so the queued question renders from
        // server state, with its real id, instead of from a local guess.
        refresh()
        return data
      } catch (error) {
        // The send failed, so the server may never have heard the question.
        // The row is left in place, marked FAILED, with the reason and a retry —
        // deleting it would silently drop what the admin typed, and leaving it
        // PENDING would spin forever.
        markFailedToSend(localId, error?.message || 'Could not reach the server')
        applyThread(
          exchangesRef.current.map((item) =>
            item.id === localId
              ? { ...item, status: 'FAILED', error: error?.message || 'Could not reach the server' }
              : item
          )
        )
        return null
      }
    },
    [applyThread, markFailedToSend, refresh, upsertExchange]
  )

  const retry = useCallback(
    async (exchange) => {
      if (!exchange?.question) return
      applyThread(exchangesRef.current.filter((item) => item.id !== exchange.id))
      clearSendFailure(exchange.id)
      return send(exchange.question)
    },
    [applyThread, clearSendFailure, send]
  )

  const clear = useCallback(async () => {
    try {
      await clearCopilotThread()
    } catch {
      // The clear button is a convenience. If the delete fails, the local list
      // is still cleared so the admin gets what they asked for on screen, and
      // the next poll re-reads the server's version, which is the truth.
    }
    backoffRef.current = 0
    applyThread([])
  }, [applyThread])

  return {
    exchanges,
    pending,
    loading,
    loadError,
    sendFailures,
    isEmpty: exchanges.length === 0,
    isThinking: pending.size > 0,
    send,
    retry,
    clear,
    refresh,
  }
}

function withTimeout(promise, ms) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('The server did not respond')), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}
