import { useEffect, useState } from 'react'

/**
 * Whether the browser currently believes it has a network.
 *
 * `navigator.onLine` is not a connectivity test — it only reports whether an
 * interface is up, so a laptop on wifi with no route to the server reports
 * `true`. It is still the right signal for one specific decision: whether to
 * offer a send button that cannot work. An actual request failure is the
 * authoritative signal, and that is handled where the request is made.
 *
 * Starts at `true` rather than reading `navigator.onLine` during the initial
 * render, because a false first value would disable a composer for a frame on
 * every load and flash a warning that was not true. The effect corrects it
 * immediately, before anything can be sent.
 */
export function useOnlineStatus() {
  const [online, setOnline] = useState(true)

  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false)

    // Correct the optimistic initial value on mount.
    update()

    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  return online
}

export default useOnlineStatus
