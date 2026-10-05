import { api } from '@/services/api/client'
import { buildPath } from '@/services/api/paths'

const AUTH = '/auth'

export const authApi = {
  me: () => api.get(buildPath(AUTH, 'me')),
  logout: () => api.post(buildPath(AUTH, 'logout')),
  forgotPassword: (email) => api.post(buildPath(AUTH, 'forgot-password'), { email }),
  verifyResetCode: (email, code) =>
    api.post(buildPath(AUTH, 'verify-reset-code'), { email, code }),
  resetPassword: (email, code, newPassword) =>
    api.post(buildPath(AUTH, 'reset-password'), { email, code, newPassword }),
}
