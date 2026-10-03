import { ArrowLeft, ArrowRight, Mail, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '@/shared/api/client'
import AuthLayout, {
  authError,
  authField as field,
  authPrimaryButton,
} from '../components/AuthLayout'
import { useApp } from '../../context/AppContext'

export default function ForgotPassword() {
  const navigate = useNavigate()
  const { pushToast } = useApp()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [showCode, setShowCode] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [codeError, setCodeError] = useState('')
  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState(false)

  const sendCode = async (silent = false) => {
    if (!email.trim()) {
      setError('Enter your email address first.')
      return
    }
    setError('')
    if (!silent) setLoading(true)
    try {
      await api.post('/auth/forgot-password', { email: email.trim() })
      if (!silent) {
        setSent(true)
        pushToast('Reset code sent — check your inbox', 'info')
      } else {
        pushToast('Code resent — check your inbox', 'info')
      }
    } catch (err) {
      setError(err.message || 'Could not send the reset code.')
    } finally {
      setLoading(false)
    }
  }

  const verify = async () => {
    if (code.trim().length < 6) {
      setCodeError('Enter the 6-digit code we emailed you.')
      return
    }
    setCodeError('')
    setVerifying(true)
    try {
      await api.post('/auth/verify-reset-code', {
        email: email.trim(),
        code: code.trim(),
      })
      sessionStorage.setItem(
        'taskora_reset',
        JSON.stringify({ email: email.trim(), code: code.trim() })
      )
      navigate('/reset-password')
    } catch (err) {
      setCodeError(err.message || 'That code is invalid or expired.')
    } finally {
      setVerifying(false)
    }
  }

  return (
    <AuthLayout
      title="Forgot Password"
      subtitle="Enter the email on your account and we'll send you a secure reset code."
      split={false}
    >
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault()
          if (!sent) sendCode()
        }}
        noValidate
      >
        <div>
          <label className="mb-2 block text-xs font-semibold text-auth-ink-soft">
            Email Address
          </label>
          <div className="relative flex items-center">
            <span className="absolute left-4 text-auth-ink-faint">
              <Mail className="h-4 w-4" strokeWidth={1.8} />
            </span>
            <input
              className={field}
              type="email"
              placeholder="johndoe@gmail.com"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
        </div>
        {error && <p className={authError}>{error}</p>}
        {!sent ? (
          <div className="pt-2">
            <button className={authPrimaryButton} type="submit" disabled={loading}>
              {loading ? 'Sending…' : 'Send reset code'}
            </button>
          </div>
        ) : (
          <div className="space-y-3 pt-2">
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                className={authPrimaryButton}
                type="button"
                disabled={loading}
                onClick={() => sendCode(true)}
              >
                {loading ? 'Resending…' : 'Resend code'}
              </button>
              <button
                className="w-full flex-1 rounded-xl border border-auth-line bg-auth-card py-3.5 px-4 text-center text-sm font-semibold text-auth-ink-soft shadow-sm transition-colors duration-150 hover:bg-auth-hover active:scale-[0.99]"
                type="button"
                onClick={() => setShowCode(true)}
              >
                Continue
                <ArrowRight className="ml-1.5 inline h-4 w-4" strokeWidth={2} />
              </button>
            </div>
          </div>
        )}
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

      {showCode && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowCode(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-auth-card p-7 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold tracking-tight text-auth-ink">
                  Enter reset code
                </h2>
                <p className="mt-1 text-xs font-normal leading-relaxed text-auth-ink-muted">
                  We sent a 6-digit code to{' '}
                  <span className="font-semibold text-auth-ink-soft">{email}</span>
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setShowCode(false)}
                className="rounded-full p-1.5 text-auth-ink-muted transition-colors hover:bg-auth-hover hover:text-auth-ink-soft"
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
            <label className="mb-2 block text-xs font-semibold text-auth-ink-soft">
              6-digit code
            </label>
            <input
              className="w-full rounded-xl border border-transparent bg-auth-field py-3 px-4 text-center text-base font-semibold tracking-[0.4em] text-auth-ink shadow-sm outline-none transition-colors placeholder:font-normal placeholder:tracking-normal placeholder:text-auth-ink-faint focus:border-auth-ink-faint focus:bg-auth-field focus:ring-0"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={code}
              autoFocus
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
              onKeyDown={(event) => {
                if (event.key === 'Enter') verify()
              }}
            />
            {codeError && (
              <p className="mt-2.5 rounded-lg bg-auth-danger-soft px-3 py-2 text-xs font-medium text-auth-danger">
                {codeError}
              </p>
            )}
            <div className="mt-5 flex items-center justify-between gap-3">
              <button
                type="button"
                className="rounded-xl px-4 py-3 text-sm font-semibold text-auth-ink-soft transition-colors hover:bg-auth-hover"
                onClick={() => setShowCode(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-xl bg-auth-btn px-6 py-3 text-sm font-semibold text-auth-on-btn shadow-md transition-colors duration-150 hover:bg-auth-btn-hover active:scale-[0.99] disabled:opacity-60"
                onClick={verify}
                disabled={verifying}
              >
                {verifying ? 'Verifying…' : 'Verify'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthLayout>
  )
}