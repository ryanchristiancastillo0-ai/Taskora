import { useCallback, useEffect, useState } from 'react'

/**
 * Loads the signed-in user's own support requests.
 *
 * Deliberately not the admin console's useAdminData. That hook lives under
 * features/admin because the console is the only place it was needed, and
 * promoting it to shared/ would mean touching nine admin pages to move a file
 * this feature does not otherwise share anything with.
 *
 * What this adds over a generic fetch-state hook is `reload`, used the moment a
 * ticket is submitted: the new row has to appear in the history below the
 * confirmation without the user navigating away and back. `reload` bumps a nonce
 * so the effect refetches without the caller restating the fetcher, and a
 * response that arrives after the deps changed is discarded so a slow request
 * cannot overwrite a newer one.
 */
export default function useSupportRequests(fetcher, deps = []) {
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

  return { data, loading, error, reload }
}