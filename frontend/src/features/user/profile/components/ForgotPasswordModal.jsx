import { KeyRound, Mail, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import Button from '@/shared/components/ui/Button'
import Input from '@/shared/components/ui/Input'
import Modal from '@/shared/components/ui/Modal'

const MIN_PASSWORD_LENGTH = 8

function validate({ code, newPassword, confirmPassword }) {
  if (!/^\d{6}$/.test(code.trim())) {
    return 'Enter the 6-digit code we emailed you.'
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return `Your new password must be at least ${MIN_PASSWORD_LENGTH} characters.`
  }
  if (newPassword !== confirmPassword) return 'The two passwords do not match.'
  return ''
}

/**
 * Reset a password from inside the app for a user who is signed in but has
 * forgotten it.
 *
 * Deliberately reuses POST /auth/forgot-password, /auth/verify-reset-code and
 * /auth/reset-password rather than a signed-in variant, so this is literally the
 * same function the Login -> Forgot Password page runs. The only difference is
 * the address: it comes from the session, so the modal never asks for it and
 * cannot be pointed at somebody else's inbox.
 *
 * Successful reset revokes every refresh token on the account, so the provider
 * tears the session down and the user lands back on the login screen.
 */
export default function ForgotPasswordModal({
  open,
  onClose,
  email,
  actions,
  pushToast,
}) {
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [stage, setStage] = useState('send')
  const [sending, setSending] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const reset = () => {
    setCode('')
    setNewPassword('')
    setConfirmPassword('')
    setStage('send')
    setSending(false)
    setSubmitting(false)
    setError('')
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const sendCode = async (isResend = false) => {
    setSending(true)
    setError('')
    try {
      await actions.sendPasswordResetCode(email)
      setStage('code')
      pushToast(
        isResend
          ? 'Code resent — check your inbox'
          : 'Reset code sent — check your inbox',
        'info'
      )
    } catch (err) {
      setError(err.message || 'Could not send the reset code.')
    } finally {
      setSending(false)
    }
  }

  const submit = async (event) => {
    event?.preventDefault?.()

    const message = validate({ code, newPassword, confirmPassword })
    if (message) {
      setError(message)
      return
    }

    setSubmitting(true)
    setError('')
    try {
      await actions.verifyPasswordResetCode(email, code.trim())
      await actions.resetPassword(email, code.trim(), newPassword)
      pushToast('Password reset — sign in with your new password')
      handleClose()
    } catch (err) {
      setError(err.message || 'Could not reset your password.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Forgot password"
      subtitle="We'll email you a code to set a new password."
      size="sm"
    >
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        {stage === 'send' ? (
          <>
            <div className="flex items-start gap-3 rounded-xl bg-surface-soft p-3.5">
              <Mail className="mt-0.5 size-4 shrink-0 text-ink-muted" strokeWidth={2} />
              <p className="text-[13px] leading-relaxed text-ink-soft">
                A 6-digit code will be sent to{' '}
                <span className="font-medium text-ink">{email}</span>. It expires
                in 10 minutes.
              </p>
            </div>
            <Button
              type="button"
              onClick={() => sendCode(false)}
              disabled={sending}
              loading={sending}
              icon={Mail}
              fullWidth
            >
              {sending ? 'Sending…' : 'Send reset code'}
            </Button>
          </>
        ) : (
          <>
            <div className="flex items-start gap-3 rounded-xl bg-primary-soft p-3.5">
              <Mail className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={2} />
              <p className="text-[13px] leading-relaxed text-ink-soft">
                Code sent to{' '}
                <span className="font-medium text-ink">{email}</span>. Enter it
                below to choose a new password.
              </p>
            </div>
            <Input
              label="6-digit code"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => {
                setCode(event.target.value.replace(/\D/g, ''))
                setError('')
              }}
            />
            <Input
              label="New password"
              type="password"
              placeholder="At least 8 characters"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => {
                setNewPassword(event.target.value)
                setError('')
              }}
            />
            <Input
              label="Confirm new password"
              type="password"
              placeholder="Re-enter your new password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => {
                setConfirmPassword(event.target.value)
                setError('')
              }}
            />
            {error && <p className="text-xs text-error">{error}</p>}
            <div className="mt-1 flex items-center justify-between gap-3">
              <Button
                variant="ghost"
                type="button"
                onClick={() => sendCode(true)}
                disabled={sending}
              >
                {sending ? 'Resending…' : 'Resend code'}
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                loading={submitting}
                icon={KeyRound}
              >
                {submitting ? 'Resetting…' : 'Reset password'}
              </Button>
            </div>
          </>
        )}

        {stage === 'send' && error && (
          <p className="text-xs text-error">{error}</p>
        )}

        <p className="flex items-start gap-2 text-xs leading-relaxed text-ink-faint">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} />
          Resetting your password signs you out on every device.
        </p>
      </form>
    </Modal>
  )
}
