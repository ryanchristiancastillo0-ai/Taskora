import { normalizeGoal, normalizeHabit, todayKey } from '@/services/api/normalize'
import { goalsApi } from '@/features/user/goals/api/goalsApi'
import { habitsApi } from '@/features/user/habits/api/habitsApi'
import { unwrap } from '../entityHelpers'

export function createGoalActions({ setData, pushToast }) {
  // category travels with the payload because it is persisted on the Goal row.
  const addGoal = (goal) =>
    goalsApi
      .create({
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
    goalsApi.update(goalId, patch).then((updated) => {
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
    goalsApi
      .remove(goalId)
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
    habitsApi
      .create({
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
    habitsApi
      .toggle(habitId)
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
