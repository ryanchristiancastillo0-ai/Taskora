import { useCallback, useEffect, useState } from 'react'

/**
 * Runs one of the adminApi functions and owns its loading and error state, so
 * nine pages do not each reimplement the same three states and get the
 * "forgot to clear the error on refetch" bug.
 *
 * The fetcher is passed in rather than imported so the same hook serves the
 * dashboard, the paginated tables and the detail modal. Deps are forwarded to
 * the effect the same way useEffect takes them, so a filter change re-runs the
 * query: `useAdminData(() => getUsers(filters), [filters.status, filters.q])`.
 *
 * Two details worth keeping:
 *
 *  - A response that arrives after the deps changed is discarded. Without the
 *    `cancelled` flag, a slow request for "Active" can land after a fast one for
 *    "Suspended" and overwrite the newer result with the older one.
 *  - `reload` bumps a nonce rather than re-running the effect, so a refresh
 *    after a mutation does not need the caller to restate the fetcher.
 */
export default function useAdminData(fetcher, deps = []) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [nonce, setNonce] = useState(0)

  const reload = useCallback(() => setNonce((value) => value + 1), [])

  useEffect(() => {
    let cancelled = false

    setLoading(true)
    setError(null)

    Promise.resolve()
      .then(fetcher)
      .then((result) => {
        if (cancelled) return
        setData(result)
      })
      .catch((cause) => {
        if (cancelled) return
        setError(cause instanceof Error ? cause : new Error('Something went wrong'))
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  return { data, loading, error, reload, setData }
}
