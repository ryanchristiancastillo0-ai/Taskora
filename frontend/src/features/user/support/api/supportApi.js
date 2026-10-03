import { api } from '@/shared/api/client'

/**
 * The signed-in user's side of the help centre.
 *
 *   getMyRequests(query)  ->  GET  /api/support/requests        { items, pagination }
 *   getRequest(id)        ->  GET  /api/support/requests/:id    { request }
 *   createRequest(body)   ->  POST /api/support/requests        { request }
 *   submitFeedback(body)  ->  POST /api/support/feedback       { feedback }
 *   getMyFeedback(query)  ->  GET  /api/support/feedback/mine   { items }
 *
 * Every one of these is behind authMiddleware server-side, and the handler
 * scopes each query to the caller's own userId rather than filtering after the
 * fact — so another account's ticket id is answered with the same 404 as one
 * that never existed. Nothing here takes a userId: the server already knows who
 * is asking, and a parameter that could select someone else's tickets would be
 * one more thing to get right on every call.
 *
 * The admin equivalents live in features/admin/api/adminApi.js, because the
 * console keeps exactly one data-access file.
 *
 * The shared client already unwraps the { success, data } envelope, so
 * `request` below is the ticket object itself and no reshaping is needed.
 */

/**
 * Drops the params that mean "no filter".
 *
 * Mirrors the admin console's helper. Axios omits `undefined` but happily sends
 * an empty string, and `?page=&limit=` is noise the validators then have to
 * re-interpret.
 */
function clean(params = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(
      ([, value]) => value !== undefined && value !== null && value !== ''
    )
  )
}

/**
 * The caller's own tickets, newest first.
 *
 * `category` and `status` are accepted by the backend and used only by the
 * history list's own filter chips — the server accepts and ignores them for this
 * route, and they are sent rather than filtered locally so the list and the
 * counts stay consistent if that ever stops being true.
 */
export function getMyRequests(query) {
  return api.get('/support/requests', { params: clean(query) })
}

export function getRequest(id) {
  return api.get(`/support/requests/${id}`).then((data) => data.request)
}

/**
 * Opens a ticket.
 *
 * `description` is genuinely optional and is the one field most likely to be an
 * empty string: the guided flow has already recorded the category, issue and
 * problem, so a user who was not asked to type anything still has a complete
 * ticket. It is omitted from the body entirely when blank rather than sent as
 * "", because the validator turns an empty box into null and there is no reason
 * to make the server do that work.
 */
export function createRequest(body) {
  const payload = {
    category: body.category,
    issue: body.issue,
    problem: body.problem,
  }

  const description = typeof body.description === 'string' ? body.description.trim() : ''
  if (description) payload.description = description

  return api.post('/support/requests', payload).then((data) => data.request)
}

/** A 1-5 rating of the help centre. `comment` is optional. */
export function submitFeedback(body) {
  const payload = { rating: body.rating }

  const comment = typeof body.comment === 'string' ? body.comment.trim() : ''
  if (comment) payload.comment = comment

  return api.post('/support/feedback', payload).then((data) => data.feedback)
}

export function getMyFeedback(query) {
  return api.get('/support/feedback/mine', { params: clean(query) })
}