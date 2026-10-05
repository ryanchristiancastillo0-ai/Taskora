import { Check, Flame, Plus } from 'lucide-react'
import { useState } from 'react'
import PageHeader from '@/components/layout/PageHeader'
import Button from '@/components/ui/Button'
import EmptyStateModal from '@/components/ui/EmptyStateModal'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import Select from '@/components/ui/Select'
import { useApp } from '@/app/providers/AppContext'
import { cx } from '@/utils/format'

const FREQUENCY_OPTIONS = [
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'CUSTOM', label: 'Custom' },
]

export default function HabitsPage() {
  const { data, actions, pushToast } = useApp()
  const [showNew, setShowNew] = useState(false)
  const [emptyDismissed, setEmptyDismissed] = useState(false)
  const [values, setValues] = useState({ name: '', frequency: 'DAILY' })

  const submit = (event) => {
    event.preventDefault()
    if (!values.name.trim()) return
    actions.addHabit({ name: values.name.trim(), frequency: values.frequency })
    pushToast('Habit added')
    setValues({ name: '', frequency: 'DAILY' })
    setShowNew(false)
  }

  return (
    <div>
      <PageHeader
        title="Habits"
        subtitle={`${data.habits.length} ${data.habits.length === 1 ? 'habit' : 'habits'}`}
        actions={
          <Button onClick={() => setShowNew(true)} icon={Plus}>
            New habit
          </Button>
        }
      />

      {data.habits.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-border-subtle bg-surface-card/50 px-6 py-16 text-center">
          <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary shadow-card">
            <Flame className="size-7" strokeWidth={2} />
          </div>
          <h3 className="text-base font-semibold text-ink">Build good habits</h3>
          <p className="mt-1 max-w-sm text-sm leading-relaxed text-ink-muted">
            Track daily or weekly habits, keep your streaks alive, and see your
            consistency at a glance.
          </p>
          <Button onClick={() => setShowNew(true)} icon={Plus} className="mt-5">
            Create your first habit
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {data.habits.map((habit) => {
            const doneToday = habit.doneToday
            return (
              <div
                key={habit.id}
                className="flex items-center gap-4 rounded-card border border-border-subtle bg-surface-card px-5 py-4 shadow-card transition-colors hover:bg-surface-soft"
              >
                <button
                  type="button"
                  onClick={() => actions.toggleHabit(habit.id)}
                  aria-label={doneToday ? 'Mark incomplete' : 'Mark done today'}
                  className={cx(
                    'flex size-9 flex-shrink-0 items-center justify-center rounded-full border-2 transition-all',
                    doneToday
                      ? 'border-primary-soft bg-primary-soft text-primary'
                      : 'border-border-subtle text-transparent hover:border-primary/40 hover:text-primary/40'
                  )}
                >
                  <Check className="size-5" strokeWidth={3} />
                </button>
                <div className="min-w-0 flex-1">
                  <p
                    className={cx(
                      'text-[15px] font-medium',
                      doneToday ? 'text-ink line-through' : 'text-ink'
                    )}
                  >
                    {habit.name}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-muted">
                    <Flame className={cx('size-3.5', habit.streak > 0 ? 'text-warning' : '')} strokeWidth={2} />
                    {habit.streak} day{habit.streak === 1 ? '' : 's'} streak ·{' '}
                    {habit.frequency.toLowerCase()}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <EmptyStateModal
        open={data.habits.length === 0 && !emptyDismissed}
        onClose={() => setEmptyDismissed(true)}
        icon={Flame}
        title="No habits yet"
        description="You have no habits yet. Click the button below to create your first habit and start building a streak."
        actionLabel="New habit"
        onAction={() => {
          setEmptyDismissed(true)
          setShowNew(true)
        }}
      />

      <Modal open={showNew} onClose={() => setShowNew(false)} title="New habit">
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <Input
            label="Habit name"
            required
            placeholder="e.g. Morning run"
            value={values.name}
            onChange={(event) => setValues({ ...values, name: event.target.value })}
            autoFocus
          />
          <Select
            label="Frequency"
            value={values.frequency}
            onChange={(event) => setValues({ ...values, frequency: event.target.value })}
          >
            {FREQUENCY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <div className="mt-1 flex flex-wrap justify-end gap-3">
            <Button variant="ghost" type="button" onClick={() => setShowNew(false)}>
              Cancel
            </Button>
            <Button type="submit">Add habit</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}