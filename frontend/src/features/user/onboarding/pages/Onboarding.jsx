import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AuthShell from '@/features/auth/components/AuthShell'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { cx } from '@/utils/format'
import {
  AI_PROVIDER_OPTIONS,
  AI_RESPONSE_STYLES,
  PLANNING_STYLES,
  REMINDER_PREFERENCES,
  TIME_OF_DAY,
  WORK_STYLES,
} from '@/constants/index'
import { useApp } from '@/app/providers/AppContext'

export default function Onboarding() {
  const navigate = useNavigate()
  const { data, actions, pushToast } = useApp()

  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [values, setValues] = useState({
    preferredName: '',
    occupationOrRole: 'FRONTEND',
    workStyle: '',
    planningStyle: '',
    mostProductiveTime: '',
    breakPreference: '',
    reminderPreference: '',
    difficultyStartingTasks: '',
    preferredAIResponseStyle: '',
    aiProvider: 'GEMINI',
  })

  // An administrator has no user onboarding to do, but this route is mounted
  // outside AppLayout so it is reachable on its own. Bouncing them to '/' would
  // dump them on the user dashboard, so the destination follows the role the
  // same way every other redirect in the app does.
  const homePath = data.user?.role === 'ADMIN' ? '/admin' : '/'

  useEffect(() => {
    if (data.profile.onboardingCompleted) {
      navigate(homePath, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.profile.onboardingCompleted])

  const totalSteps = 4
  const canContinue =
    step === 0
      ? values.preferredName.trim().length > 0
      : step === 1
        ? values.workStyle && values.planningStyle
        : step === 2
          ? values.preferredAIResponseStyle
          : true

  const buildPayload = (skip = false) => ({
    skipped: skip,
    preferredName: values.preferredName.trim() || (skip ? data.user.firstName : ''),
    occupationOrRole: values.occupationOrRole || null,
    workStyle: values.workStyle || null,
    planningStyle: values.planningStyle || null,
    mostProductiveTime: values.mostProductiveTime || null,
    breakPreference: values.breakPreference || null,
    reminderPreference: values.reminderPreference || null,
    difficultyStartingTasks: values.difficultyStartingTasks || null,
    preferredAIResponseStyle: values.preferredAIResponseStyle || null,
    aiProvider: values.aiProvider,
  })

  const complete = (payload, message) =>
    actions
      .completeOnboarding(payload)
      .then(() => {
        pushToast(message)
        navigate(homePath, { replace: true })
      })
      .catch((error) => {
        pushToast(error.message, 'danger')
        setSubmitting(false)
      })

  const finish = () => {
    if (submitting) return
    setSubmitting(true)
    complete(buildPayload(), 'Onboarding complete')
  }

  const skip = () => {
    if (submitting) return
    setSubmitting(true)
    complete(buildPayload(true), "Skipped — you can set preferences later in Profile")
  }

  const next = () => {
    if (!canContinue) return
    if (step === totalSteps - 1) {
      finish()
      return
    }
    setStep((value) => value + 1)
  }

  return (
    <AuthShell
      title={step === totalSteps - 1 ? "You're all set" : `Let's personalise Taskora`}
      subtitle={
        step === totalSteps - 1
          ? 'Your preferences are tuned and ready.'
          : 'A few quick questions help the assistant plan around you.'
      }
    >
      <div className="mb-6 flex items-center gap-1.5">
        {Array.from({ length: totalSteps }).map((_, index) => (
          <span
            key={index}
            className={cx(
              'h-1.5 flex-1 rounded-full transition-colors',
              index <= step ? 'bg-primary-container' : 'bg-surface-high'
            )}
          />
        ))}
      </div>

      {step === 0 && (
        <StepShell title="How should we call you?" description="This name shows across the app and in assistant replies.">
          <Input
            label="Preferred name"
            required
            placeholder="e.g. Alex"
            value={values.preferredName}
            onChange={(event) => setValues({ ...values, preferredName: event.target.value })}
            autoFocus
          />
        </StepShell>
      )}

      {step === 1 && (
        <StepShell title="How do you like to work?" description="Used to shape realistic scheduling and suggestions.">
          <div className="grid grid-cols-1 gap-4">
            <Select
              label="Work style"
              value={values.workStyle}
              onChange={(event) => setValues({ ...values, workStyle: event.target.value })}
            >
              <option value="">Select one</option>
              {WORK_STYLES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select
              label="Planning style"
              value={values.planningStyle}
              onChange={(event) =>
                setValues({ ...values, planningStyle: event.target.value })
              }
            >
              <option value="">Select one</option>
              {PLANNING_STYLES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select
              label="Most productive time"
              value={values.mostProductiveTime}
              onChange={(event) =>
                setValues({ ...values, mostProductiveTime: event.target.value })
              }
            >
              <option value="">Select one</option>
              {TIME_OF_DAY.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
        </StepShell>
      )}

      {step === 2 && (
        <StepShell title="How should I help?" description="Tune how the assistant communicates and reminds you.">
          <div className="grid grid-cols-1 gap-4">
            <Select
              label="Response style"
              value={values.preferredAIResponseStyle}
              onChange={(event) =>
                setValues({ ...values, preferredAIResponseStyle: event.target.value })
              }
            >
              <option value="">Select one</option>
              {AI_RESPONSE_STYLES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select
              label="Reminder preference"
              value={values.reminderPreference}
              onChange={(event) =>
                setValues({ ...values, reminderPreference: event.target.value })
              }
            >
              <option value="">Select one</option>
              {REMINDER_PREFERENCES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select
              label="AI provider"
              value={values.aiProvider}
              onChange={(event) => setValues({ ...values, aiProvider: event.target.value })}
            >
              {AI_PROVIDER_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option.charAt(0) + option.slice(1).toLowerCase()}
                </option>
              ))}
            </Select>
          </div>
        </StepShell>
      )}

      {step === 3 && (
        <div className="flex flex-col items-center py-4 text-center">
          <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-success-soft text-emerald-600">
            <Check className="size-7" strokeWidth={2.5} />
          </div>
          <h3 className="text-lg font-semibold text-ink">
            Nice to meet you, {values.preferredName || 'friend'}!
          </h3>
          <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-muted">
            You can always tune these preferences later in Profile or Settings.
          </p>
        </div>
      )}

      <div className="mt-6 flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          onClick={() => setStep((value) => Math.max(0, value - 1))}
          disabled={step === 0}
        >
          Back
        </Button>
        <div className="flex items-center gap-2">
          {step < totalSteps - 1 && (
            <Button
              variant="ghost"
              onClick={skip}
              disabled={submitting}
              className="text-ink-muted hover:text-ink"
            >
              {submitting ? 'Skipping…' : 'Skip'}
            </Button>
          )}
          <Button onClick={next} disabled={!canContinue || submitting}>
            {step === totalSteps - 1
              ? submitting
                ? 'Saving…'
                : 'Start using Taskora'
              : 'Continue'}
          </Button>
        </div>
      </div>
    </AuthShell>
  )
}

function StepShell({ title, description, children }) {
  return (
    <div>
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      <p className="mb-4 mt-0.5 text-[13px] text-ink-muted">{description}</p>
      {children}
    </div>
  )
}