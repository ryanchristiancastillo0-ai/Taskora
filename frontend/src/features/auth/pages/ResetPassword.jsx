import { ArrowLeft, Eye, EyeOff, Lock } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '@/services/api/client'
import AuthLayout, {
  authError,
  authField as field,
  authPrimaryButton,
} from '@/features/auth/components/AuthLayout'
import { useApp } from '@/app/providers/AppContext'

function PasswordField({ label, value, onChange, placeholder }) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <label className="mb-2 block text-xs font-semibold text-auth-ink-soft">{label}</label>
      <div className="relative flex items-center">
        <span className="absolute left-4 text-auth-ink-faint">
          <Lock className="h-4 w-4" strokeWidth={1.8} />
        </span>
        <input
          className={`${field} pr-11`}
          type={show ? 'text' : 'password'}
          placeholder={placeholder}
          autoComplete="new-password"
          value={value}
          onChange={onChange}
        />
        <button
          type="button"
          aria-label={show ? 'Hide password' : 'Show password'}
          onClick={() => setShow((value) => !value)}
          className="absolute right-4 text-auth-ink-faint transition-colors hover:text-auth-ink-soft"
        >
          {show ? (
            <EyeOff className="h-4 w-4" strokeWidth={1.8} />
          ) : (
            <Eye className="h-4 w-4" strokeWidth={1.8} />
          )}
        </button>
      </div>
    </div>
  )
}

export default function ResetPassword() {
  const navigate = useNavigate()
  const { pushToast } = useApp()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const stored = sessionStorage.getItem('taskora_reset')
    if (!stored) {
      navigate('/forgot-password', { replace: true })
      return
    }
    try {
      const parsed = JSON.parse(stored)
      if (!parsed?.email || !parsed?.code) {
        sessionStorage.removeItem('taskora_reset')
        navigate('/forgot-password', { replace: true })
        return
      }
      setEmail(parsed.email)
      setCode(parsed.code)
    } catch {
      sessionStorage.removeItem('taskora_reset')
      navigate('/forgot-password', { replace: true })
    }
  }, [navigate])

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    try {
      await api.post('/auth/reset-password', {
        email,
        code,
        newPassword: password,
      })
      sessionStorage.removeItem('taskora_reset')
      pushToast('Password reset — sign in with your new password')
      navigate('/login', { replace: true })
    } catch (err) {
      setError(err.message || 'Could not reset the password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title="Set a new password"
      subtitle="Create a strong new password for your Taskora account."
      split={false}
    >
      <form className="space-y-5" onSubmit={submit} noValidate>
        <div className="rounded-xl border border-auth-line bg-auth-card px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-auth-ink-faint">
            Reset code verified for
          </p>
          <p className="mt-0.5 text-sm font-semibold text-auth-ink-soft">{email}</p>
        </div>
        <PasswordField
          label="New Password"
          value={password}
          placeholder="At least 8 characters"
          onChange={(event) => setPassword(event.target.value)}
        />
        <PasswordField
          label="Confirm Password"
          value={confirm}
          placeholder="Repeat your new password"
          onChange={(event) => setConfirm(event.target.value)}
        />
        {error && <p className={authError}>{error}</p>}
        <div className="pt-2">
          <button className={authPrimaryButton} type="submit" disabled={loading}>
            {loading ? 'Resetting…' : 'Reset password'}
          </button>
        </div>
        <div className="pt-2 text-xs font-normal text-auth-ink-muted">
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 font-medium text-auth-ink-soft hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
            Back to sign in
          </Link>
        </div>
      </form>
    </AuthLayout>
  )
}