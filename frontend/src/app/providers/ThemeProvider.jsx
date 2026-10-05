import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useApp } from './AppContext'

const ThemeContext = createContext(null)

const THEME_STORAGE_KEY = 'taskora_theme'
const COMPACT_STORAGE_KEY = 'taskora_compact'

const THEME_OPTION_VALUES = ['LIGHT', 'DARK', 'SYSTEM']

function readPref(key, fallback) {
  try {
    const value = window.localStorage.getItem(key)
    return value == null ? fallback : value
  } catch {
    return fallback
  }
}

function readCompact() {
  try {
    return window.localStorage.getItem(COMPACT_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function writePref(key, value) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* storage unavailable — the DB save is the source of truth */
  }
}

function useSystemPrefersDark() {
  const [prefersDark, setPrefersDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ?? false
  )
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!media) return
    const onChange = (event) => setPrefersDark(event.matches)
    media.addEventListener?.('change', onChange)
    return () => media.removeEventListener?.('change', onChange)
  }, [])
  return prefersDark
}

function resolveTheme(preference, prefersDark) {
  if (preference === 'DARK') return 'dark'
  if (preference === 'SYSTEM') return prefersDark ? 'dark' : 'light'
  return 'light'
}

export function ThemeProvider({ children }) {
  const { data, actions, pushToast } = useApp()
  const prefersDark = useSystemPrefersDark()

  // Seed from localStorage for an instant first paint (no flash), falling back
  // to whatever the backend delivered. Persisted back on every change.
  const [theme, setThemeState] = useState(() => {
    const stored = readPref(THEME_STORAGE_KEY)
    return THEME_OPTION_VALUES.includes(stored) ? stored : data.settings.theme
  })
  const [compactMode, setCompactModeState] = useState(() =>
    readCompact() ?? Boolean(data.settings.compactMode)
  )

  // Keep committed (last-known-good) values for optimistic rollback.
  const committedThemeRef = useRef(theme)
  const committedCompactRef = useRef(compactMode)

  useEffect(() => {
    committedThemeRef.current = theme
  }, [theme])
  useEffect(() => {
    committedCompactRef.current = compactMode
  }, [compactMode])

  // Re-resolve + re-apply each time the preference or the OS scheme changes.
  useEffect(() => {
    const resolved = resolveTheme(theme, prefersDark)
    document.documentElement.dataset.theme = resolved
    document.documentElement.dataset.compact = String(compactMode)
  }, [theme, compactMode, prefersDark])

  // Persist locally and to the backend. On failure, roll the UI back to the
  // last committed value and surface an error — never let the app drift from
  // what is actually stored.
  const commitSettings = useCallback(
    (patch) => {
      const rollback = {}
      return actions
        .updateSettings(patch)
        .catch((error) => {
          if (patch.theme !== undefined) rollback.theme = committedThemeRef.current
          if (patch.compactMode !== undefined)
            rollback.compactMode = committedCompactRef.current
          if (rollback.theme !== undefined) setThemeState(rollback.theme)
          if (rollback.compactMode !== undefined)
            setCompactModeState(rollback.compactMode)
          pushToast(error.message, 'danger')
          throw error
        })
    },
    [actions, pushToast]
  )

  const setTheme = useCallback(
    (next) => {
      setThemeState(next)
      writePref(THEME_STORAGE_KEY, next)
      commitSettings({ theme: next })
    },
    [commitSettings]
  )

  const setCompactMode = useCallback(
    (next) => {
      setCompactModeState(Boolean(next))
      writePref(COMPACT_STORAGE_KEY, String(Boolean(next)))
      commitSettings({ compactMode: Boolean(next) })
    },
    [commitSettings]
  )

  const value = useMemo(
    () => ({ theme, compactMode, prefersDark, setTheme, setCompactMode }),
    [theme, compactMode, prefersDark, setTheme, setCompactMode]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within ThemeProvider')
  return context
}
