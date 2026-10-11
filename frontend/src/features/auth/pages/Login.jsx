import { Eye, EyeOff, Lock, Mail } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '@/services/api/client'
import AuthLayout, {
  SocialAuthButtons,
  authError,
  authField,
  authPrimaryButton,
  readAuthError,
  startGitHubSignIn,
  startGoogleSignIn,
} from '@/features/auth/components/AuthLayout'
import { useApp } from '@/app/providers/AppContext'

// Only the email is persisted. A password in localStorage is readable by any
// script on the origin, so the user retypes it each visit.
const REMEMBERED_EMAIL_KEY = 'taskora:remembered-email'

const readRememberedEmail = () => {
  try {
    return localStorage.getItem(REMEMBERED_EMAIL_KEY) ?? ''
  } catch {
    // Private browsing / blocked storage - prefill just stays blank.
    return ''
  }
}

const writeRememberedEmail = (email, remember) => {
  try {
    if (remember) {
      localStorage.setItem(REMEMBERED_EMAIL_KEY, email)
    } else {
      localStorage.removeItem(REMEMBERED_EMAIL_KEY)
    }
  } catch {
    // Non-fatal: the login itself already succeeded.
  }
}

export default function Login() {
  const navigate = useNavigate()
  const { actions, pushToast } = useApp()
  const [values, setValues] = useState(() => ({
    email: readRememberedEmail(),
    password: '',
  }))
  const [rememberMe, setRememberMe] = useState(
    () => readRememberedEmail().length > 0
  )
  const [showPassword, setShowPassword] = useState(false)
  // Seeded from the URL rather than from an effect, which is the same trick the
  // remembered email above uses: it is a one-time read of something outside React
  // (the query string here, localStorage there). A Google or GitHub sign-in that
  // failed comes back to this page as a redirect carrying a code, and the form
  // has to be able to explain it. Submitting clears it, so typing does not leave
  // a stale complaint above the fields.
  const [error, setError] = useState(() => readAuthError())
  const [loading, setLoading] = useState(false)

  // Shared by both social buttons: a starter resolves false when its health
  // probe found no backend. Say so here rather than letting the browser navigate
  // to a dead port, which is what used to happen.
  const handleSocialStart = async (start) => {
    if (!(await start())) {
      setError(
        'Could not reach the Taskora server. Make sure the backend is running, then try again.'
      )
    }
  }

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const email = values.email.trim()
      await api.post('/auth/login', {
        email,
        password: values.password,
        rememberMe,
      })
      writeRememberedEmail(email, rememberMe)
      const me = await actions.bootstrap()
      // An administrator lands in the console, everyone else in their own app.
      // bootstrap() returns /auth/me, so the role is already here — no second
      // request. Admins also skip onboarding: it collects personal preferences
      // for the user's own task list, and forcing an admin through it before
      // they can reach the console only ever got in the way.
      //
      // '/' for everyone else rather than reading isNew here: bootstrap returns
      // the raw profile, and the derived flag lives in AppLayout, which already
      // owns that redirect. Deciding it in two places is how they drift.
      navigate(me?.user?.role === 'ADMIN' ? '/admin' : '/', { replace: true })
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout title="Sign in">
      <form className="space-y-5" onSubmit={submit} noValidate>
        <div>
          <label className="mb-2 block text-xs font-semibold text-auth-ink-soft">
            Email Address
          </label>
          <div className="relative flex items-center">
            <span className="absolute left-4 text-auth-ink-faint">
              <Mail className="h-4 w-4" strokeWidth={1.8} />
            </span>
            <input
              className={authField}
              type="email"
              placeholder="johndoe@gmail.com"
              value={values.email}
              onChange={(event) => setValues({ ...values, email: event.target.value })}
            />
          </div>
        </div>
        <div>
          <label className="mb-2 block text-xs font-semibold text-auth-ink-soft">
            Password
          </label>
          <div className="relative flex items-center">
            <span className="absolute left-4 text-auth-ink-faint">
              <Lock className="h-4 w-4" strokeWidth={1.8} />
            </span>
            <input
              className={`${authField} pr-11`}
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••"
              value={values.password}
              onChange={(event) => setValues({ ...values, password: event.target.value })}
            />
            <button
              type="button"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowPassword((value) => !value)}
              className="absolute right-4 text-auth-ink-faint transition-colors hover:text-auth-ink-soft"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" strokeWidth={1.8} />
              ) : (
                <Eye className="h-4 w-4" strokeWidth={1.8} />
              )}
            </button>
          </div>
        </div>
        <div className="flex items-center pt-1">
          <input
            id="remember-me"
            name="remember-me"
            type="checkbox"
            checked={rememberMe}
            onChange={(event) => setRememberMe(event.target.checked)}
            className="h-4 w-4 cursor-pointer rounded border-auth-line accent-auth-btn focus:ring-auth-btn"
          />
          <label
            htmlFor="remember-me"
            className="ml-2.5 block cursor-pointer text-xs font-medium text-auth-ink-soft"
          >
            Remember me
          </label>
        </div>
        {error && <p className={authError}>{error}</p>}
        <div className="pt-2">
          <button className={authPrimaryButton} type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
        <div className="space-y-1 pt-2 text-xs font-normal text-auth-ink-muted">
          <p>
            Don't have an account?{' '}
            <Link to="/register" className="font-medium text-auth-ink-soft hover:underline">
              Sign up
            </Link>
          </p>
          <p>
            <Link
              to="/forgot-password"
              className="font-medium text-auth-ink-soft hover:underline"
            >
              Forgot Password
            </Link>
          </p>
        </div>
        <SocialAuthButtons
          onGoogle={() => handleSocialStart(startGoogleSignIn)}
          onGitHub={() => handleSocialStart(startGitHubSignIn)}
          onDisabled={(provider) =>
            pushToast(`${provider} sign-in isn't available yet`, 'info')
          }
        />
      </form>
    </AuthLayout>
  )
}