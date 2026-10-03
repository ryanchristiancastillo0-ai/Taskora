import axios from 'axios'
import { API_URL, API_ORIGIN, BACKEND_URL } from './config'

class ApiError extends Error {
  constructor(status, message, data = null) {
    super(message)
    this.status = status
    this.data = data
  }
}

const client = axios.create({
  baseURL: API_URL,
  withCredentials: true,
})

let refreshPromise = null
let lastRefreshAt = 0
let unauthorizedHandler = null

// Within this window after a successful rollover we treat a 401 as "the
// request was fired with the previous access token" and just retry with the
// already-rotated cookies instead of refreshing again. Refreshing twice in a
// row is what breaks sessions: the backend revokes the refresh token on every
// rollover, so the second call 401s and the interceptor force-logs you out.
const REFRESH_COOLDOWN_MS = 60_000

function failSession() {
  if (unauthorizedHandler) unauthorizedHandler()
}

async function refreshAccessToken() {
  if (Date.now() - lastRefreshAt < REFRESH_COOLDOWN_MS) {
    return Promise.resolve()
  }
  if (!refreshPromise) {
    refreshPromise = client
      .post('/auth/refresh')
      .then((response) => {
        lastRefreshAt = Date.now()
        return response.data
      })
      .catch((error) => {
        failSession()
        throw new ApiError(
          error.response?.status || 401,
          error.response?.data?.message || 'Session expired. Please sign in again.'
        )
      })
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

const SKIP_REFRESH = (pathname) =>
  pathname.startsWith('/auth/login') ||
  pathname.startsWith('/auth/register') ||
  pathname.startsWith('/auth/refresh') ||
  pathname.startsWith('/auth/forgot-password') ||
  pathname.startsWith('/auth/reset-password')

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { response, config } = error
    if (!response) throw error

    const pathname = config?.url || ''

    if (response.status === 401 && !SKIP_REFRESH(pathname) && !config?._retried) {
      try {
        await refreshAccessToken()
        config._retried = true
        return client(config)
      } catch (refreshError) {
        return Promise.reject(refreshError)
      }
    }

    if (response.status === 401 && SKIP_REFRESH(pathname)) {
      failSession()
    }

    throw new ApiError(
      response.status,
      response.data?.message || response.data?.error || `Request failed (${response.status})`,
      response.data
    )
  }
)

function toError(error) {
  if (error instanceof ApiError) return error
  return new ApiError(
    error.response?.status || 0,
    error.response?.data?.message || error.message || 'Network error',
    error.response?.data ?? null
  )
}

async function request(method, path, { body, formData, config } = {}) {
  try {
    const response = await client.request({
      method,
      url: path,
      data: formData || body,
      ...config,
    })
    return response.data?.data ?? response.data
  } catch (error) {
    throw toError(error)
  }
}

export const api = {
  get: (path, config) => request('GET', path, { config }),
  post: (path, body, config) => request('POST', path, { body, config }),
  patch: (path, body, config) => request('PATCH', path, { body, config }),
  del: (path, config) => request('DELETE', path, { config }),
  upload: (path, file, field = 'file') => {
    const formData = new FormData()
    formData.append(field, file)
    return request('POST', path, { formData })
  },
  // Multi-file multipart upload that can carry plain text fields in the same
  // request, so a caption and its attachments travel as one atomic message.
  uploadMany: (path, files, field = 'files', fields = {}) => {
    const list = Array.isArray(files) ? files : [files]
    const formData = new FormData()
    list.filter(Boolean).forEach((file) => formData.append(field, file))
    Object.entries(fields).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return
      formData.append(key, value)
    })
    return request('POST', path, { formData })
  },
  postAudio: async (path, body) => {
    try {
      const response = await client.request({
        method: 'POST',
        url: path,
        data: body,
        responseType: 'blob',
      })
      return {
        blob: response.data,
        contentType: response.headers?.['content-type'] || 'audio/mpeg',
      }
    } catch (error) {
      if (error.response?.data instanceof Blob) {
        try {
          const text = await error.response.data.text()
          const parsed = JSON.parse(text)
          throw new ApiError(
            error.response.status,
            parsed.message || `Request failed (${error.response.status})`,
            parsed
          )
        } catch (inner) {
          if (inner instanceof ApiError) throw inner
        }
      }
      throw toError(error)
    }
  },
}

export function registerUnauthorizedHandler(handler) {
  unauthorizedHandler = handler
}

export { refreshAccessToken }

export function resolveAssetUrl(value) {
  if (!value) return null
  if (value.startsWith('/uploads/') || value.startsWith('/api/uploads')) {
    return `${API_ORIGIN}${value}`
  }
  if (/^https?:\/\//.test(value)) return value
  return `${API_ORIGIN}${value.startsWith('/') ? '' : '/'}${value}`
}

export function uploadUrl() {
  return `${API_ORIGIN}/uploads`
}

// Re-exported so existing imports from this module keep working, but the
// values themselves now live in ./config.
export { ApiError, API_URL, API_ORIGIN, BACKEND_URL }