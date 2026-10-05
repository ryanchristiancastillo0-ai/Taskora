import { Mail, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/**
 * Two-step change of the account email address.
 *
 * Step 1 asks for the new address plus the current password, which starts the
 * flow. Step 2 spends the 6-digit code that was mailed to the NEW address, so
 * the change only completes for someone who controls the mailbox being switched
 * to. The current address is shown next to the new one in step 2 so a typo is
 * obvious before the code is spent.
 *
 * The address cannot be changed by a plain profile save: PATCH /users/me rejects
 * an `email` key, so this modal is the only path.
 */
export default function ChangeEmailModal({
  open,
  onClose,
  currentEmail,
  actions,
  pushToast,
}) {
  const [newEmail, setNewEmail] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [code, setCode] = useState('')
  const [stage, setStage] = useState('request')
  const [sending, setSending] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const reset = () => {
    setNewEmail('')
    setCurrentPassword('')
    setCode('')
    setStage('request')
    setSending(false)
    setSubmitting(false)
    setError('')
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const target = newEmail.trim().toLowerCase()

  const sendCode = async (isResend = false) => {
    if (!EMAIL_PATTERN.test(target)) {
      setError('Enter a valid email address.')
      return
    }
    if (target === currentEmail) {
      setError('That is already your current email address.')
      return
    }

    setSending(true)
    setError('')
    try {
      await actions.requestEmailChangeCode(target, currentPassword)
      setStage('verify')
      pushToast(
        isResend ? 'Code resent — check your new inbox' : 'Code sent — check your new inbox',
        'info'
      )
    } catch (err) {
      setError(err.message || 'Could not send the verification code.')
    } finally {
      setSending(false)
    }
  }

  const submit = async (event) => {
    event?.preventDefault?.()

    if (!/^\d{6}$/.test(code.trim())) {
      setError('Enter the 6-digit code we emailed you.')
      return
    }

    setSubmitting(true)
    setError('')
    try {
      await actions.verifyEmailChange(target, code.trim())
      pushToast('Email address updated')
      handleClose()
    } catch (err) {
      setError(err.message || 'Could not change your email address.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Change email"
      subtitle="We'll verify the new address before switching over."
      size="sm"
    >
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        {stage === 'request' ? (
          <>
            <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-soft px-3.5 py-3">
              <span className="text-[13px] text-ink-muted">Current email</span>
              <span className="truncate text-[13px] font-medium text-ink">
                {currentEmail}
              </span>
            </div>
            <Input
              label="New email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              value={newEmail}
              onChange={(event) => {
                setNewEmail(event.target.value)
                setError('')
              }}
            />
            <Input
              label="Current password"
              type="password"
              placeholder="Confirm it's you"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => {
                setCurrentPassword(event.target.value)
                setError('')
              }}
            />
            {error && <p className="text-xs text-error">{error}</p>}
            <Button
              type="button"
              onClick={() => sendCode(false)}
              disabled={sending}
              loading={sending}
              icon={Mail}
              fullWidth
            >
              {sending ? 'Sending…' : 'Send verification code'}
            </Button>
          </>
        ) : (
          <>
            <div className="flex items-start gap-3 rounded-xl bg-primary-soft p-3.5">
              <Mail className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={2} />
              <p className="text-[13px] leading-relaxed text-ink-soft">
                A 6-digit code was sent to{' '}
                <span className="font-medium text-ink">{target}</span>. Your
                current address stays{' '}
                <span className="font-medium text-ink">{currentEmail}</span>{' '}
                until you confirm.
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
                icon={Mail}
              >
                {submitting ? 'Confirming…' : 'Confirm new email'}
              </Button>
            </div>
          </>
        )}

        <p className="flex items-start gap-2 text-xs leading-relaxed text-ink-faint">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} />
          Password resets and sign-in codes will go to the new address. You stay
          signed in on this device.
        </p>
      </form>
    </Modal>
  )
}
