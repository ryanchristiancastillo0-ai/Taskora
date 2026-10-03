import { api } from '@/shared/api/client'

// The admin console's data access layer, pointed at the real API.
//
// Every page reaches the network through this file, so the console has exactly
// one place where a backend contract is translated into the shape the UI reads.
// The responses need almost no reshaping — the backend returns the same field
// names the tables already use — with ONE deliberate exception, documented on
// normalizeUser below.
//
//   getOverview()          ->  GET  /api/admin/overview
//   getUsers(query)        ->  GET  /api/admin/users         { items, pagination }
//   getUser(id)            ->  GET  /api/admin/users/:id
//   updateUser(id, patch)  ->  PATCH /api/admin/users/:id
//   getTasks(query)        ->  GET  /api/admin/tasks         { items, pagination }
//   getProjects(query)     ->  GET  /api/admin/projects      { items, pagination }
//   getAiUsage(query)      ->  GET  /api/admin/ai-usage      { summary, items, pagination }
//   getNotifications(query)->  GET  /api/admin/notifications { items, summary, pagination }
//   getAuditLogs(query)    ->  GET  /api/admin/audit-logs    { items, pagination }
//   getReports(months)     ->  GET  /api/admin/reports
//   getGrowth(months)      ->  GET  /api/admin/growth
//   getTaskMix()           ->  GET  /api/admin/task-mix
//   getWeekly()            ->  GET  /api/admin/weekly
//   getActivity()          ->  GET  /api/admin/activity
//   getSearch(query)       ->  GET  /api/admin/search       { q, users, tasks, projects }
//
// All of them are behind authMiddleware + adminGuard server-side, so a non-admin
// gets 403 from the API and the page's own error state, not a broken table.
//
// The shared client already unwraps the { success, data } envelope these handlers
// return, and every list response carries `pagination` ({ page, limit, total,
// totalPages }) under exactly the key the pages read, so none of that needs
// handling here.

/**
 * Drops the params that mean "no filter".
 *
 * Axios already omits `undefined`, but it happily sends an empty string, and
 * `?q=&status=&role=` is noise the validators then have to re-interpret. It
 * matters most for `overdue`, which is a real enum value rather than a boolean:
 * 'false' has to survive this filter even though it reads as falsy, which is why
 * the test is a strict comparison rather than a truthiness check.
 */
function clean(params = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  )
}

/**
 * Flattens one account into the shape the users table and detail modal read.
 *
 * The only endpoint whose response is reshaped. The detail modal wants a flat
 * row — `user.tasks`, `user.aiProvider`, `user.joinedAt` — and the handler
 * returns Prisma's own select: counts nested under `_count`, the provider and
 * onboarding flag nested under `personalizationProfile`, and the signup date
 * named `createdAt` where the list endpoint calls it `joinedAt`. Read raw, the
 * modal silently renders an Invalid Date, five zeroed usage bars, an OpenRouter
 * badge on every account and a "has not finished onboarding" warning on
 * everyone. `_count` and `personalizationProfile` are dropped rather than spread,
 * so nothing downstream can reach the nested copies and get a different answer
 * from the flat one.
 *
 * An account with no personalization profile is reported as GEMINI, matching
 * adminService.aiUsage(), which counts profile-less accounts under the schema
 * default rather than leaving them in a bucket that does not add up.
 */
function normalizeUser(user) {
  const counts = user._count ?? {}
  const profile = user.personalizationProfile

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    role: user.role,
    status: user.status,
    activity: user.activity,
    joinedAt: user.createdAt,
    lastActiveAt: user.lastActiveAt,
    aiProvider: profile?.aiProvider ?? 'GEMINI',
    onboardingCompleted: profile?.onboardingCompleted ?? false,
    tasks: counts.tasks ?? 0,
    projects: counts.projects ?? 0,
    notes: counts.notes ?? 0,
    goals: counts.goals ?? 0,
    habits: counts.habits ?? 0,
  }
}

export function getOverview(query) {
  return api.get('/admin/overview', { params: clean(query) })
}

export function getGrowth(months) {
  return api.get('/admin/growth', { params: clean({ months }) })
}

export function getTaskMix() {
  return api.get('/admin/task-mix')
}

export function getWeekly() {
  return api.get('/admin/weekly')
}

export function getActivity() {
  return api.get('/admin/activity')
}

export function getUsers(query) {
  return api.get('/admin/users', { params: clean(query) })
}

export function getUser(id) {
  return api.get(`/admin/users/${id}`).then(normalizeUser)
}

// Role and status only. The handler refuses to let an admin demote or suspend
// themselves and revokes the target's refresh tokens on suspension; the pages
// refetch after this call rather than trusting the response.
export function updateUser(id, patch) {
  return api.patch(`/admin/users/${id}`, patch)
}

export function getTasks(query) {
  return api.get('/admin/tasks', { params: clean(query) })
}

export function getProjects(query) {
  return api.get('/admin/projects', { params: clean(query) })
}

export function getAiUsage(query) {
  return api.get('/admin/ai-usage', { params: clean(query) })
}

export function getNotifications(query) {
  return api.get('/admin/notifications', { params: clean(query) })
}

export function getReports(months) {
  return api.get('/admin/reports', { params: clean({ months }) })
}

/**
 * The audit trail, newest first.
 *
 * Read-only, and there is deliberately no matching create/update/delete function
 * in this file. The rows are the record: an admin console that can edit or clear
 * its own audit log is not an audit log, so the only write path anywhere is
 * AuditService.record() on the backend, and the table is append-only.
 *
 * `action` and `entity` are the raw stored strings (see AUDIT_ACTIONS in the
 * shared constants), not the display labels. Filtering on the label would silently
 * match nothing, because the column holds the verb.
 *
 * The date window is passed as an explicit `from`/`to` ISO instant rather than a
 * `days` count like the other endpoints take. Audit events are point-in-time facts
 * an admin is usually chasing around one incident, so the console would otherwise
 * have to offer relative windows and then be unable to answer "what happened on
 * the 14th". `clean()` drops the pair when the control is set to "All time".
 */
export function getAuditLogs(query) {
  return api.get('/admin/audit-logs', { params: clean(query) })
}

// The support desk.
//
//   getSupportRequests(query)->  GET   /api/admin/support/requests        { items, pagination }
//   getSupportRequest(id)    ->  GET   /api/admin/support/requests/:id    { request }
//   updateSupportRequest(id) ->  PATCH /api/admin/support/requests/:id    { request }
//   getSupportSummary()      ->  GET   /api/admin/support/summary
//   getSupportFeedback(query)->  GET   /api/admin/support/feedback        { items, pagination }
//
// `status` and `category` accept the literal "ALL" as a UI sentinel. The backend
// treats it as "no filter" rather than as a value to match, but it is stripped
// here anyway so the query string stays readable in the network tab and no
// validator has to know the word exists.
//
// Status and resolution note go out as ONE patch rather than as a separate
// status sub-path, because an admin changes both in a single edit of a single
// form and two round trips could disagree about what was saved.
//
// Every route here is behind authMiddleware + adminGuard, so an ordinary account
// gets a 403 from the API and the page's own error state.
export function getSupportRequests(query) {
  const params = clean(query)
  if (params.status === 'ALL') delete params.status
  if (params.category === 'ALL') delete params.category
  return api.get('/admin/support/requests', { params })
}

export function getSupportRequest(id) {
  return api.get(`/admin/support/requests/${id}`).then((data) => data.request)
}

export function updateSupportRequest(id, patch) {
  const body = {}
  if (patch.status) body.status = patch.status
  if (patch.resolutionNote !== undefined) body.resolutionNote = patch.resolutionNote
  return api.patch(`/admin/support/requests/${id}`, body).then((data) => data.request)
}

// Queue figures plus how users are rating the help centre. Read once for the
// stat cards above the triage table.
export function getSupportSummary() {
  return api.get('/admin/support/summary')
}

export function getSupportFeedback(query) {
  return api.get('/admin/support/feedback', { params: clean(query) })
}

// The header's grouped preview. `q` is required by the endpoint, and the caller
// only asks once the term is long enough to be worth a round trip.
export function getSearch(query) {
  return api.get('/admin/search', { params: clean(query) })
}

/**
 * Asks the copilot. Answers are generated from a snapshot of the same admin
 * figures the dashboard renders, so a reply can be checked against the cards.
 *
 * The response is a 202 and carries no answer: the question is stored and a
 * job is queued. The reply arrives later over the socket, or on the next poll
 * of getCopilotThread. Asking again is safe — each call creates its own
 * exchange, so a double-submit is two questions rather than one overwritten.
 */
export function askAdmin(question) {
  return api.post('/admin/ask', { question })
}

/**
 * The asking admin's own copilot history, newest first, plus a count of how many
 * are still unanswered.
 *
 * This is the call that makes a closed tab recoverable: the widget fetches it on
 * mount, so an answer that landed while the admin was on another page is already
 * on screen before they ask anything new.
 */
export function getCopilotThread(limit) {
  return api.get('/admin/copilot/thread', { params: clean({ limit }) })
}

/**
 * Clears this admin's copilot history. Scoped server-side to the asking admin,
 * so there is no id to pass and no way to clear anyone else's.
 */
export function clearCopilotThread() {
  return api.del('/admin/copilot/thread')
}
