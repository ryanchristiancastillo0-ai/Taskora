import { Lock, Mail, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'

const MIN_PASSWORD_LENGTH = 8

function validate({ code, newPassword, confirmPassword }) {
  if (!/^\d{6}$/.test(code.trim())) return 'Enter the 6-digit code from your email.'
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return `Your new password must be at least ${MIN_PASSWORD_LENGTH} characters.`
  }
  if (newPassword !== confirmPassword) return 'The two passwords do not match.'
  return ''
}

/**
 * Confirms a signed-in password change with the code emailed by
 * POST /users/me/password/code. Kept self-contained so Profile and Settings can
 * both mount it without duplicating the code/password/confirm states.
 */
export default function ChangePasswordModal({ open, onClose, email, actions, pushToast }) {
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [stage, setStage] = useState('code')
  const [sending, setSending] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const reset = () => {
    setCode('')
    setNewPassword('')
    setConfirmPassword('')
    setStage('code')
    setSending(false)
    setSubmitting(false)
    setError('')
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const sendCode = async () => {
    setSending(true)
    try {
      await actions.requestChangePasswordCode()
      setStage('password')
      setError('')
      pushToast('Verification code sent — check your inbox', 'info')
    } catch (err) {
      setError(err.message || 'Could not send the verification code.')
    } finally {
      setSending(false)
    }
  }

  const submit = async (event) => {
    event?.preventDefault?.()

    if (stage === 'code') {
      if (!/^\d{6}$/.test(code.trim())) {
        setError('Enter the 6-digit code from your email.')
        return
      }
      // The code is only checked when the new password is submitted, so a typo
      // costs one request instead of forcing a separate verify step.
      setStage('password')
      setError('')
      return
    }

    const message = validate({ code, newPassword, confirmPassword })
    if (message) {
      setError(message)
      return
    }

    setSubmitting(true)
    try {
      await actions.changePasswordWithCode(code.trim(), newPassword)
      pushToast('Password changed — please sign in again')
      handleClose()
    } catch (err) {
      setError(err.message || 'Could not change your password.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Change password"
      subtitle="We'll email you a verification code to confirm it's you."
      size="sm"
    >
      <form className="flex flex-col gap-4" onSubmit={submit}>
        {stage === 'code' ? (
          <>
            <div className="flex items-start gap-3 rounded-xl bg-surface-soft p-3.5">
              <Mail className="mt-0.5 size-4 shrink-0 text-ink-muted" strokeWidth={2} />
              <p className="text-[13px] leading-relaxed text-ink-soft">
                A 6-digit code will be sent to{' '}
                <span className="font-medium text-ink">{email}</span>. It expires in 10
                minutes.
              </p>
            </div>
            <Button type="button" onClick={sendCode} disabled={sending} icon={Mail}>
              {sending ? 'Sending…' : 'Send verification code'}
            </Button>
          </>
        ) : (
          <>
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
              <Button variant="ghost" type="button" onClick={sendCode} disabled={sending}>
                {sending ? 'Resending…' : 'Resend code'}
              </Button>
              <Button type="submit" onClick={submit} disabled={submitting} icon={Lock}>
                {submitting ? 'Updating…' : 'Change password'}
              </Button>
            </div>
          </>
        )}

        {stage === 'code' && error && <p className="text-xs text-error">{error}</p>}

        <p className="flex items-start gap-2 text-xs leading-relaxed text-ink-faint">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} />
          Changing your password signs you out on every device.
        </p>
      </form>
    </Modal>
  )
}
