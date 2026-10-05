import { api } from '@/services/api/client'
import { buildPath } from '@/services/api/paths'

const USERS_ME = '/users/me'
const PROFILE = '/profile'

export const accountApi = {
  updateUser: (patch) => api.patch(USERS_ME, patch),
  uploadAvatar: (file) => api.upload(buildPath(USERS_ME, 'avatar'), file),
  deleteAccount: () => api.del(USERS_ME),

  updateProfile: (patch) => api.patch(PROFILE, patch),
  completeOnboarding: (payload) => api.post(buildPath(PROFILE, 'onboarding'), payload),

  requestPasswordCode: () => api.post(buildPath(USERS_ME, 'password', 'code')),
  changePasswordWithCode: (code, newPassword) =>
    api.post(buildPath(USERS_ME, 'password', 'verify'), { code, newPassword }),
  requestEmailChangeCode: (newEmail, currentPassword) =>
    api.post(buildPath(USERS_ME, 'email', 'code'), { newEmail, currentPassword }),
  verifyEmailChange: (newEmail, code) =>
    api.post(buildPath(USERS_ME, 'email', 'verify'), { newEmail, code }),
}
