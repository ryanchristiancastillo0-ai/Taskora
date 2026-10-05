import { Minus, Plus, Target } from 'lucide-react'
import { useState } from 'react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import ProgressBar from '@/components/ui/ProgressBar'

// Coarse nudges for the common case, plus the usual milestones for setting a
// round number in one tap.
const STEPS = [-10, -5, 5, 10]
const PRESETS = [25, 50, 75, 100]

const clamp = (value) => Math.max(0, Math.min(100, Math.round(value) || 0))

/**
 * Sets a goal's progress. Opened by clicking the progress row on a goal card.
 *
 * A slider alone is awkward for an exact value on touch, and typing alone gives
 * no sense of scale, so this offers both plus one-tap nudges, and previews the
 * real bar before anything is saved.
 *
 * Progress is the only field sent. Status is deliberately left alone: the
 * service decides how progress and status interact, so setting 100 here does
 * not silently mark the goal complete.
 *
 * Mounted only while a goal is selected, and keyed by goal id, so the initial
 * value is read straight from props and a cancelled edit can never leak into
 * the next open.
 */
export default function GoalProgressModal({ open, onClose, goal, actions, pushToast }) {
  const [value, setValue] = useState(() => clamp(goal.progress))

  const save = async () => {
    const next = clamp(value)
    if (next === goal.progress) {
      onClose()
      return
    }
    try {
      await actions.updateGoal(goal.id, { progress: next })
      pushToast(`Progress updated to ${next}%`)
      onClose()
    } catch (error) {
      pushToast(error.message || 'Could not update progress', 'danger')
    }
  }

  const nudge = (delta) => setValue((current) => clamp(current + delta))

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Update progress"
      subtitle={goal.title}
      size="sm"
    >
      <div className="flex flex-col gap-5">
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-muted">
              <Target className="size-3.5" strokeWidth={2} />
              Progress
            </span>
            <span className="text-2xl font-semibold tabular-nums text-ink">
              {value}%
            </span>
          </div>
          <ProgressBar value={value} className="h-2" />
        </div>

        <div>
          <label
            htmlFor="goal-progress-slider"
            className="mb-2 block text-[13px] font-medium text-ink-soft"
          >
            Drag to adjust
          </label>
          <input
            id="goal-progress-slider"
            type="range"
            min={0}
            max={100}
            step={1}
            value={value}
            onChange={(event) => setValue(clamp(event.target.value))}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-high accent-primary-container"
          />
          <div className="mt-1.5 flex justify-between text-[11px] text-ink-faint">
            <span>0%</span>
            <span>50%</span>
            <span>100%</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => nudge(-5)}
            disabled={value === 0}
            aria-label="Decrease by 5"
          >
            <Minus className="size-4" strokeWidth={2} />
          </Button>
          <Input
            aria-label="Progress percentage"
            inputMode="numeric"
            className="flex-1 text-center"
            value={value}
            onChange={(event) => {
              const digits = event.target.value.replace(/\D/g, '').slice(0, 3)
              setValue(digits === '' ? 0 : clamp(digits))
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => nudge(5)}
            disabled={value === 100}
            aria-label="Increase by 5"
          >
            <Plus className="size-4" strokeWidth={2} />
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {STEPS.map((step) => (
            <button
              key={step}
              type="button"
              onClick={() => nudge(step)}
              disabled={step < 0 ? value === 0 : value === 100}
              className="rounded-lg border border-border-subtle bg-surface-card px-2.5 py-1.5 text-[13px] font-medium text-ink-soft transition-colors hover:bg-surface-soft hover:text-ink disabled:pointer-events-none disabled:opacity-40"
            >
              {step > 0 ? `+${step}` : step}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setValue(preset)}
              className={
                value === preset
                  ? 'rounded-lg bg-primary-soft px-2.5 py-1.5 text-[13px] font-semibold text-primary transition-colors'
                  : 'rounded-lg border border-border-subtle bg-surface-card px-2.5 py-1.5 text-[13px] font-medium text-ink-muted transition-colors hover:bg-surface-soft hover:text-ink'
              }
            >
              {preset}%
            </button>
          ))}
        </div>

        <div className="flex flex-wrap justify-end gap-3 border-t border-border-subtle pt-4">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={save}>
            Save progress
          </Button>
        </div>
      </div>
    </Modal>
  )
}
