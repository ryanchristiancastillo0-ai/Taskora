import { api } from '@/shared/api/client'
import { normalizeGoal, normalizeHabit, todayKey } from '@/shared/api/normalize'
import { unwrap } from '../shared'

export function createGoalActions({ setData, pushToast }) {
  // category is persisted on the Goal row, so it travels with the payload
  // instead of being re-attached locally. It used to be stripped here, which
  // left the server with nothing to store and every goal came back as the
  // CAREER fallback on reload.
  const addGoal = (goal) =>
    api
      .post('/goals', {
        title: goal.title.trim(),
        description: goal.description || null,
        category: goal.category || 'CAREER',
        targetDate: goal.targetDate || null,
      })
      .then((created) => {
        const normalized = normalizeGoal(unwrap(created, 'goal'))
        setData((prev) => ({
          ...prev,
          goals: [
            normalized,
            ...prev.goals.filter((item) => item.id !== normalized.id),
          ],
        }))
        return normalized
      })

  const updateGoal = (goalId, patch) =>
    api.patch(`/goals/${goalId}`, patch).then((updated) => {
      const normalized = normalizeGoal(unwrap(updated, 'goal'))
      setData((prev) => ({
        ...prev,
        goals: prev.goals.map((goal) =>
          goal.id === goalId ? normalized : goal
        ),
      }))
      return normalized
    })

  const deleteGoal = (goalId) =>
    api
      .del(`/goals/${goalId}`)
      .then(() => {
        setData((prev) => ({
          ...prev,
          goals: prev.goals.filter((item) => item.id !== goalId),
        }))
      })
      .catch((error) => {
        pushToast(error.message, 'danger')
        throw error
      })

  return { addGoal, updateGoal, deleteGoal }
}

export function createHabitActions({ setData }) {
  const addHabit = (habit) =>
    api
      .post('/habits', {
        name: habit.name.trim(),
        frequency: habit.frequency || 'DAILY',
      })
      .then((created) => {
        const normalized = normalizeHabit(unwrap(created, 'habit'), todayKey())
        setData((prev) => ({
          ...prev,
          habits: [
            normalized,
            ...prev.habits.filter((item) => item.id !== normalized.id),
          ],
        }))
        return normalized
      })

  const toggleHabit = (habitId) =>
    api
      .post(`/habits/${habitId}/toggle`)
      .then((updated) => {
        const normalized = normalizeHabit(unwrap(updated, 'habit'), todayKey())
        setData((prev) => ({
          ...prev,
          habits: prev.habits.map((habit) =>
            habit.id === habitId ? normalized : habit
          ),
        }))
        return normalized
      })
      .catch(() => {
        setData((prev) => ({
          ...prev,
          habits: prev.habits.map((habit) =>
            habit.id === habitId
              ? { ...habit, doneToday: !habit.doneToday }
              : habit
          ),
        }))
      })

  return { addHabit, toggleHabit }
}
