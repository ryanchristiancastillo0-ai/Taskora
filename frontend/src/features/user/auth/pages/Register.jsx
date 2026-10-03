import { Eye, EyeOff, Lock, Mail, User } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '@/shared/api/client'
import AuthLayout, {
  SocialAuthButtons,
  authError,
  authField as field,
  authPrimaryButton,
} from '../components/AuthLayout'
import { useApp } from '../../context/AppContext'

export default function Register() {
  const navigate = useNavigate()
  const { actions, pushToast } = useApp()
  const [values, setValues] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const set = (key) => (event) => setValues({ ...values, [key]: event.target.value })

  const submit = async (event) => {
    event.preventDefault()
    if (loading) return
    setError('')
    setLoading(true)
    try {
      await api.post('/auth/register', {
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim() || undefined,
        email: values.email.trim(),
        password: values.password,
      })
      const me = await actions.bootstrap()
      navigate(me?.isNew ? '/onboarding' : '/')
    } catch (err) {
      setError(err.message || 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout title="Create account" subtitle="Start organizing your life in minutes.">
      <form className="space-y-5" onSubmit={submit} noValidate>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label className="mb-2 block text-xs font-semibold text-auth-ink-soft">
              First Name
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-4 text-auth-ink-faint">
                <User className="h-4 w-4" strokeWidth={1.8} />
              </span>
              <input
                className={field}
                placeholder="Jane"
                autoComplete="given-name"
                value={values.firstName}
                onChange={set('firstName')}
              />
            </div>
          </div>
          <div>
            <label className="mb-2 block text-xs font-semibold text-auth-ink-soft">
              Last Name
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-4 text-auth-ink-faint">
                <User className="h-4 w-4" strokeWidth={1.8} />
              </span>
              <input
                className={field}
                placeholder="Doe"
                autoComplete="family-name"
                value={values.lastName}
                onChange={set('lastName')}
              />
            </div>
          </div>
        </div>
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
              value={values.email}
              onChange={set('email')}
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
              className={`${field} pr-11`}
              type={showPassword ? 'text' : 'password'}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              value={values.password}
              onChange={set('password')}
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
        {error && <p className={authError}>{error}</p>}
        <div className="pt-2">
          <button className={authPrimaryButton} type="submit" disabled={loading}>
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </div>
        <div className="space-y-1 pt-2 text-xs font-normal text-auth-ink-muted">
          <p>
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-auth-ink-soft hover:underline">
              Sign in
            </Link>
          </p>
        </div>
        <SocialAuthButtons
          onDisabled={(provider) =>
            pushToast(`${provider} sign-in isn't available yet`, 'info')
          }
        />
      </form>
    </AuthLayout>
  )
}