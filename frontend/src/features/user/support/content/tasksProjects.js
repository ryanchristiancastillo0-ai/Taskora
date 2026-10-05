import { ListChecks } from 'lucide-react'

export const tasksProjects = {
  id: 'TASKS_PROJECTS',
  label: 'Tasks & Projects',
  description: 'Creating, organising and finding your work.',
  icon: ListChecks,
  issues: [
    {
      slug: 'tasks-projects',
      label: 'Tasks & Projects',
      problems: [
        {
          slug: 'task-not-saving',
          label: 'Task is not saving',
          summary: 'Task edits are not being saved',
          description:
            'Changes to a task appear to be lost when you navigate away or refresh.',
          steps: [
            'Press Save and wait for the confirmation before closing the task.',
            'Check for a failed connection indicator — an unsaved edit is lost on refresh.',
            'Reopen the task to confirm whether the change took effect.',
          ],
        },
        {
          slug: 'task-missing',
          label: 'A task disappeared',
          summary: 'Task is missing from its list or project',
          description: 'A task that existed is no longer showing where you left it.',
          steps: [
            'Check the filters on the list — a status or date filter can hide a task that still exists.',
            'Use search with part of the task title.',
            'Check the project the task was moved to.',
          ],
          action: { label: 'Open my tasks', to: '/tasks' },
        },
        {
          slug: 'project-sync',
          label: 'Tasks not appearing in the project',
          summary: 'Tasks are not appearing under the expected project',
          description: 'A task exists but is not listed under the project you assigned it to.',
          steps: [
            'Open the task and confirm the project field actually saved.',
            'Check whether the project has been archived.',
            'Refresh the project view.',
          ],
          action: { label: 'Open my projects', to: '/projects' },
        },
        {
          slug: 'recurring-not-created',
          label: 'Recurring task was not created',
          summary: 'Recurring task was not generated for the next period',
          description:
            'A repeating task did not appear again on the schedule you expected.',
          steps: [
            'Confirm the task has a repeat rule set.',
            'Check whether the pattern suggestion was skipped rather than accepted.',
            'Look for the next occurrence on the calendar.',
          ],
          action: { label: 'Open the calendar', to: '/calendar' },
        },
      ],
    },
  ],
}
