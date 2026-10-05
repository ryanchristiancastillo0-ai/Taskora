/**
 * Endpoint builder shared by every feature API module.
 *
 * The point is that a feature never hand-writes `/tasks/${id}`: ids come from
 * user input and route params, so a stray slash or a missing encode turns a
 * 404 into a request against the wrong collection. Trailing slashes on the base
 * are trimmed, empty segments are dropped, and everything else is encoded.
 */
export const buildPath = (base, ...segments) => {
  const head = String(base).replace(/\/+$/, '')
  const tail = segments
    .filter((segment) => segment !== null && segment !== undefined && segment !== '')
    .map((segment) => encodeURIComponent(String(segment)))
  return [head, ...tail].join('/')
}

/** Appends a query string, skipping params that are null, undefined or empty. */
export const withQuery = (path, params = {}) => {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return
    if (Array.isArray(value)) {
      value.filter((v) => v !== null && v !== undefined && v !== '').forEach((v) => search.append(key, v))
      return
    }
    search.append(key, value)
  })
  const qs = search.toString()
  return qs ? `${path}?${qs}` : path
}
