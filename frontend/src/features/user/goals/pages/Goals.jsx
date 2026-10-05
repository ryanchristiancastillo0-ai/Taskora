import { Flag, Plus, Target } from 'lucide-react'
import { useState } from 'react'
import PageHeader from '@/components/layout/PageHeader'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import DataTable from '@/components/ui/DataTable'
import DatePicker from '@/components/ui/DatePicker'
import EmptyState from '@/components/ui/EmptyState'
import EmptyStateModal from '@/components/ui/EmptyStateModal'
import Input from '@/components/ui/Input'
import ItemActionsModal, {
  ItemActionsTrigger,
} from '@/components/ui/ItemActionsModal'
import Modal from '@/components/ui/Modal'
import ProgressBar from '@/components/ui/ProgressBar'
import SegmentedControl from '@/components/ui/SegmentedControl'
import Select from '@/components/ui/Select'
import Textarea from '@/components/ui/Textarea'
import useListView, {
  LIST_VIEW_OPTIONS,
} from '@/hooks/useListView'
import { useApp } from '@/app/providers/AppContext'
import GoalProgressModal from '@/features/user/goals/components/GoalProgressModal'
import { GOAL_CATEGORIES } from '@/constants/index'
import { cx, formatDate, timeAgo } from '@/utils/format'

const toneByCategory = {
  CAREER: 'indigo',
  HEALTH: 'green',
  LEARNING: 'amber',
  PERSONAL: 'red',
}

const EMPTY_FORM = {
  title: '',
  description: '',
  category: 'CAREER',
  targetDate: '',
}

export default function Goals() {
  const { data, actions, pushToast } = useApp()
  const [view, selectView] = useListView()
  const [showNew, setShowNew] = useState(false)
  const [progressGoalId, setProgressGoalId] = useState(null)
  const [emptyDismissed, setEmptyDismissed] = useState(false)
  const [values, setValues] = useState(EMPTY_FORM)
  // The goal currently open in the edit form, or null when creating.
  const [editingId, setEditingId] = useState(null)
  // The goal whose action modal is open.
  const [actionsTarget, setActionsTarget] = useState(null)
  const isEditing = Boolean(editingId)

  const closeForm = () => {
    setShowNew(false)
    setEditingId(null)
    setValues(EMPTY_FORM)
  }

  const openCreate = () => {
    setValues(EMPTY_FORM)
    setEditingId(null)
    setShowNew(true)
  }

  const openEdit = (goal) => {
    setActionsTarget(null)
    setValues({
      title: goal.title ?? '',
      description: goal.description ?? '',
      category: goal.category ?? 'CAREER',
      // DatePicker speaks YYYY-MM-DD, but the API hands back a full ISO
      // timestamp. Same conversion TaskFormModal does for a task's due date.
      targetDate: goal.targetDate ? goal.targetDate.slice(0, 10) : '',
    })
    setEditingId(goal.id)
    setShowNew(true)
  }

  const submit = (event) => {
    event.preventDefault()
    if (!values.title.trim()) return

    if (isEditing) {
      actions
        .updateGoal(editingId, {
          title: values.title.trim(),
          description: values.description.trim(),
          category: values.category,
          targetDate: values.targetDate,
        })
        .then(() => pushToast('Goal updated'))
        .catch(() => pushToast('Could not update goal', 'danger'))
      closeForm()
      return
    }

    actions.addGoal({
      title: values.title.trim(),
      description: values.description.trim(),
      category: values.category,
      targetDate: values.targetDate,
    })
    pushToast('Goal added')
    closeForm()
  }

  const removeGoal = (goal) =>
    actions.deleteGoal(goal.id).then(() => {
      // Must clear the target here: the action modal stays mounted otherwise,
      // leaving it stuck on the spinner since the deleted item is gone.
      setActionsTarget(null)
      pushToast('Goal deleted')
    })

  const progressGoal = data.goals.find((goal) => goal.id === progressGoalId) ?? null

  const toggleComplete = (goal) =>
    actions.updateGoal(goal.id, {
      status: goal.status === 'COMPLETED' ? 'ACTIVE' : 'COMPLETED',
    })

  // Plain render helpers rather than nested components: declaring them inside
  // the component body would give React a new type on every render, remounting
  // the subtree and throwing away focus (e.g. on the 3-dot button) each time.
  const categoryBadge = (goal) => (
    <Badge tone={toneByCategory[goal.category] ?? 'indigo'}>
      {goal.category.toLowerCase()}
    </Badge>
  )

  const completeToggle = (goal) => (
    <button
      type="button"
      onClick={() => toggleComplete(goal)}
      aria-label={
        goal.status === 'COMPLETED'
          ? `Mark ${goal.title} active`
          : `Mark ${goal.title} complete`
      }
      title={goal.status === 'COMPLETED' ? 'Mark active' : 'Mark complete'}
      className="size-5 flex-shrink-0 rounded-full border transition-colors hover:border-primary"
    >
      {goal.status === 'COMPLETED' && (
        <span className="flex size-full items-center justify-center rounded-full bg-success text-white">
          <Flag className="size-3" strokeWidth={3} />
        </span>
      )}
    </button>
  )

  const progressCell = (goal) => (
    <div className="w-32">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-ink-faint">Progress</span>
        <span className="font-semibold tabular-nums text-ink">{goal.progress}%</span>
      </div>
      <ProgressBar
        value={goal.progress}
        tone={goal.status === 'COMPLETED' ? 'success' : 'primary'}
      />
    </div>
  )

  const goalCard = (goal) => (
    <div
      key={goal.id}
      className={cx(
        'flex flex-col rounded-card border p-5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-card-hover',
        goal.status === 'COMPLETED'
          ? 'border-success/30 bg-success-soft/40'
          : 'border-border-subtle bg-surface-card'
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        {categoryBadge(goal)}
        <div className="flex items-center gap-1">
          {completeToggle(goal)}
          <ItemActionsTrigger
            label={`Actions for ${goal.title}`}
            onClick={() => setActionsTarget(goal)}
          />
        </div>
      </div>
      <h3 className="text-[15px] font-semibold leading-snug text-ink">{goal.title}</h3>
      <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-ink-muted">
        {goal.description}
      </p>
      <div className="mt-4">
        {/* The whole row is the hit target, so progress is editable
            without adding another control competing with the title. */}
        <button
          type="button"
          onClick={() => setProgressGoalId(goal.id)}
          aria-label={`Update progress for ${goal.title}, currently ${goal.progress}%`}
          className="group block w-full rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="inline-flex items-center gap-1 font-medium text-ink-muted transition-colors group-hover:text-primary">
              <Target className="size-3.5" strokeWidth={2} />
              Progress
            </span>
            <span className="font-semibold tabular-nums text-ink">
              {goal.progress}%
            </span>
          </div>
          <ProgressBar
            value={goal.progress}
            tone={goal.status === 'COMPLETED' ? 'success' : 'primary'}
          />
        </button>
      </div>
      <div className="mt-4 flex items-center justify-between text-xs text-ink-muted">
        <span>{timeAgo(goal.createdAt)}</span>
        {goal.targetDate && (
          <span className="font-medium">Due {timeAgo(goal.targetDate)}</span>
        )}
      </div>
    </div>
  )

  const goalRow = (goal) => (
    <div
      key={goal.id}
      className={cx(
        'flex items-center gap-3 rounded-card border bg-surface-card px-4 py-3 shadow-card transition-colors hover:shadow-card-hover',
        goal.status === 'COMPLETED'
          ? 'border-success/30 bg-success-soft/40'
          : 'border-border-subtle'
      )}
    >
      {completeToggle(goal)}
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-semibold text-ink">{goal.title}</h3>
        <p className="mt-0.5 truncate text-[13px] text-ink-muted">
          {goal.description || 'No description'}
        </p>
      </div>
      <div className="hidden shrink-0 sm:block">
        {categoryBadge(goal)}
      </div>
      <div className="hidden shrink-0 md:block">
        {progressCell(goal)}
      </div>
      <span className="hidden w-24 shrink-0 text-right text-xs text-ink-muted lg:block">
        {goal.targetDate ? formatDate(goal.targetDate) : '—'}
      </span>
      <ItemActionsTrigger
        label={`Actions for ${goal.title}`}
        onClick={() => setActionsTarget(goal)}
      />
    </div>
  )

  const goalColumns = [
    {
      key: 'title',
      label: 'Goal',
      render: (goal) => (
        <div className="flex min-w-0 items-center gap-2">
          {completeToggle(goal)}
          <div className="min-w-0">
            <span
              className={cx(
                'block truncate font-medium',
                goal.status === 'COMPLETED' ? 'text-ink-muted line-through' : 'text-ink'
              )}
            >
              {goal.title}
            </span>
            <span className="mt-0.5 block max-w-[220px] truncate text-[12px] text-ink-muted">
              {goal.description || '—'}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: 'category',
      label: 'Category',
      render: (goal) => categoryBadge(goal),
    },
    {
      key: 'progress',
      label: 'Progress',
      render: (goal) => progressCell(goal),
    },
    {
      key: 'status',
      label: 'Status',
      render: (goal) => (
        <Badge tone={goal.status === 'COMPLETED' ? 'green' : 'neutral'}>
          {goal.status.toLowerCase()}
        </Badge>
      ),
    },
    {
      key: 'target',
      label: 'Target date',
      headerClassName: 'text-right',
      className: 'whitespace-nowrap text-right text-xs text-ink-muted',
      render: (goal) => (goal.targetDate ? formatDate(goal.targetDate) : '—'),
    },
    {
      key: 'actions',
      label: <span className="sr-only">Actions</span>,
      headerClassName: 'w-12',
      className: 'w-12 text-right',
      render: (goal) => (
        <div className="flex justify-end">
          <ItemActionsTrigger
            label={`Actions for ${goal.title}`}
            onClick={() => setActionsTarget(goal)}
          />
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Goals"
        subtitle={`${data.goals.length} ${data.goals.length === 1 ? 'goal' : 'goals'}`}
        actions={
          <div className="flex items-center gap-3">
            <SegmentedControl
              options={LIST_VIEW_OPTIONS}
              value={view}
              onChange={selectView}
            />
            <Button onClick={openCreate} icon={Plus}>
              New goal
            </Button>
          </div>
        }
      />

      {data.goals.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No goals yet"
          description="You have no goals yet. Click below to create your first goal and start tracking your progress."
          action={
            <Button onClick={openCreate} icon={Plus}>
              Create your first goal
            </Button>
          }
        />
      ) : view === 'card' ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {data.goals.map(goalCard)}
        </div>
      ) : view === 'list' ? (
        <div className="flex flex-col gap-2.5">
          {data.goals.map(goalRow)}
        </div>
      ) : (
        <DataTable columns={goalColumns} items={data.goals} getRowId={(goal) => goal.id} />
      )}

      <EmptyStateModal
        open={data.goals.length === 0 && !emptyDismissed}
        onClose={() => setEmptyDismissed(true)}
        icon={Target}
        title="No goals yet"
        description="You have no goals yet. Click the button below to create your first goal and start tracking your progress."
        actionLabel="Add new goal"
        onAction={() => {
          setEmptyDismissed(true)
          openCreate()
        }}
      />

      {/* Keyed and conditionally mounted so the modal always starts from the
          goal's real progress, with no state to resync on open. */}
      {progressGoal && (
        <GoalProgressModal
          key={progressGoal.id}
          open
          onClose={() => setProgressGoalId(null)}
          goal={progressGoal}
          actions={actions}
          pushToast={pushToast}
        />
      )}

      {/* Same keyed-mount trick as the progress modal: each goal's action modal
          always opens on the menu step rather than a stale confirm step. */}
      {actionsTarget && (
        <ItemActionsModal
          key={actionsTarget.id}
          open
          onClose={() => setActionsTarget(null)}
          itemName={actionsTarget.title}
          itemLabel="goal"
          onEdit={() => openEdit(actionsTarget)}
          onDelete={() => removeGoal(actionsTarget)}
        />
      )}

      <Modal
        open={showNew}
        onClose={closeForm}
        title={isEditing ? 'Edit goal' : 'New goal'}
      >
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <Input
            label="Title"
            required
            placeholder="e.g. Run 5k"
            value={values.title}
            onChange={(event) => setValues({ ...values, title: event.target.value })}
            autoFocus
          />
          <Textarea
            label="Description"
            rows={3}
            placeholder="What does success look like?"
            value={values.description}
            onChange={(event) => setValues({ ...values, description: event.target.value })}
          />
          <Select
            label="Category"
            value={values.category}
            onChange={(event) => setValues({ ...values, category: event.target.value })}
          >
            {GOAL_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category.charAt(0) + category.slice(1).toLowerCase()}
              </option>
            ))}
          </Select>
          <DatePicker
            label="Target date"
            value={values.targetDate}
            onChange={(next) => setValues({ ...values, targetDate: next })}
          />
          <div className="mt-1 flex flex-wrap justify-end gap-3">
            <Button variant="ghost" type="button" onClick={closeForm}>
              Cancel
            </Button>
            <Button type="submit">{isEditing ? 'Save changes' : 'Add goal'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
