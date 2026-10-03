// Single source of truth for where the backend lives.
//
// Set VITE_BACKEND_URL in frontend/.env (see frontend/.env.example). Everything
// else — the REST base URL, the socket origin and the absolute asset URL — is
// derived from it, so moving from localhost to a deployed host is one env
// change and never a code edit.
//
// Use the bare origin with no trailing /api and no trailing slash, e.g.
//   VITE_BACKEND_URL=http://localhost:8080
//   VITE_BACKEND_URL=https://api.taskora.app
// VITE_API_URL is still read for older setups, but VITE_BACKEND_URL wins when
// both are present, and a full base URL (one that already ends in /api) is
// tolerated so an old value copied from a hosting dashboard keeps working.
const DEFAULT_BACKEND_URL = 'http://localhost:8080'

const configured = String(
  import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL || DEFAULT_BACKEND_URL
).trim()

// Trailing slashes are stripped here rather than at each use site, so joining
// with a path can never produce a double slash.
const withoutTrailingSlash = configured.replace(/\/+$/, '')

// Tolerate someone pasting the full API base instead of the bare origin.
export const BACKEND_URL = withoutTrailingSlash.replace(/\/api$/, '')

export const API_URL = `${BACKEND_URL}/api`

// The socket connects to the bare origin, not to /api.
export const API_ORIGIN = new URL(BACKEND_URL).origin
