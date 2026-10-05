import { useEffect } from 'react'
import { disconnectSocket } from '@/services/api/socket'
import { registerUnauthorizedHandler } from '@/services/api/client'

/**
 * Runs the initial data load once per session and wires the 401 handler.
 *
 * The `cancelled` flag stops a slow bootstrap from resolving after unmount and
 * setting auth state on a torn-down tree.
 */
export function useBootstrapOnMount({
  bootstrap,
  resetSessionState,
  setAuthState,
}) {
  useEffect(() => {
    registerUnauthorizedHandler(() => {
      resetSessionState()
    })

    let cancelled = false
    bootstrap()
      .then(() => {
        if (!cancelled) setAuthState('ready')
      })
      .catch(() => {
        if (!cancelled) setAuthState('guest')
      })
    return () => {
      cancelled = true
      disconnectSocket()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrap, resetSessionState])
}
