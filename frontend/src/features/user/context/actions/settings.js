import { api } from '@/shared/api/client'
import { normalizeNotificationSound, normalizeSettings } from '@/shared/api/normalize'
import { setNotificationSoundUrl, setNotificationSoundEnabled } from '@/shared/utils/notificationSound'

export function createSettingsActions({ data, setData, pushToast }) {
  const updateSettings = (patch) =>
    api.patch('/settings', patch).then((settings) => {
      setData((prev) => ({
        ...prev,
        settings: normalizeSettings(
          settings,
          prev.settings.notifications,
          prev.settings.notificationSound
        ),
      }))
    })

  const updateNotificationSettings = (patch) =>
    api.patch('/settings/notifications', patch).then((result) => {
      const notificationSettings = result?.notificationSettings ?? result ?? {}
      setData((prev) => ({
        ...prev,
        settings: {
          ...prev.settings,
          // Only the boolean toggles are coerced; the selected sound is an
          // object and must survive untouched.
          notifications: {
            ...prev.settings.notifications,
            ...Object.fromEntries(
              Object.entries(notificationSettings)
                .filter(([, value]) => typeof value === 'boolean')
                .map(([key, value]) => [key, Boolean(value)])
            ),
          },
        },
      }))
    })

  // Sends one real email to the signed-in user's own inbox.
  //
  // The api client unwraps the `{ success, data }` envelope, so `sentTo` and
  // `enabledTypes` arrive as the result itself. The toast is deliberate: unlike
  // every other switch in this screen, this one has no visible effect in the
  // app, so the only confirmation a user gets is the message and the inbox.
  const sendTestEmail = () =>
    api.post('/settings/notifications/test-email').then((result) => {
      pushToast(
        `Test email sent to ${result?.sentTo ?? 'your inbox'}. Check your spam folder if it has not arrived.`,
        'success'
      )
      return result
    })

  // Optimistic sound selection.
  //
  // The store is updated to the newly picked sound before the request is sent
  // so the dropdown and the next notification both reflect the choice
  // immediately. If the write fails the previous sound is put back, the sound
  // engine is re-pointed at it, and the error is surfaced — the UI is never
  // left showing a value the backend rejected.
  const setNotificationSound = (notificationSoundId) => {
    // `actions` is rebuilt whenever `data` changes, so this snapshot is the
    // currently-committed selection and is safe to read outside the updater.
    const previousSound = data.settings.notificationSound
    const optimisticSound =
      data.notificationSounds.find((sound) => sound.id === notificationSoundId) ?? null

    if (optimisticSound) {
      setData((prev) => ({
        ...prev,
        settings: { ...prev.settings, notificationSound: optimisticSound },
      }))
      setNotificationSoundUrl(optimisticSound.path)
    }

    return api
      .patch('/settings/notifications', { notificationSoundId })
      .then((result) => {
        // Trust the server's resolution over the guess: it also folds in the
        // default-sound fallback when the id was cleared.
        const confirmed = normalizeNotificationSound(result?.notificationSound)
        setData((prev) => ({
          ...prev,
          settings: { ...prev.settings, notificationSound: confirmed },
        }))
        setNotificationSoundUrl(confirmed?.path)
        return confirmed
      })
      .catch((error) => {
        setData((prev) => ({
          ...prev,
          settings: { ...prev.settings, notificationSound: previousSound },
        }))
        setNotificationSoundUrl(previousSound?.path)
        pushToast(error.message, 'danger')
        throw error
      })
  }

  // Mute is optimistic for the same reason the sound choice is: the switch has
  // to feel instant, and the engine must react before the request resolves or
  // the next notification would still ring.
  const setSoundEnabled = (soundEnabled) => {
    const previous = data.settings.notifications.soundEnabled !== false

    setData((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        notifications: { ...prev.settings.notifications, soundEnabled },
      },
    }))
    setNotificationSoundEnabled(soundEnabled)

    return api
      .patch('/settings/notifications', { soundEnabled })
      .then((result) => {
        const confirmed = result?.notificationSettings?.soundEnabled ?? result?.soundEnabled
        setData((prev) => ({
          ...prev,
          settings: {
            ...prev.settings,
            notifications: {
              ...prev.settings.notifications,
              // Fall back to what was sent if the server omits the field.
              soundEnabled: confirmed === undefined ? soundEnabled : Boolean(confirmed),
            },
          },
        }))
        setNotificationSoundEnabled(confirmed === undefined ? soundEnabled : Boolean(confirmed))
        return confirmed
      })
      .catch((error) => {
        setData((prev) => ({
          ...prev,
          settings: {
            ...prev.settings,
            notifications: { ...prev.settings.notifications, soundEnabled: previous },
          },
        }))
        setNotificationSoundEnabled(previous)
        pushToast(error.message, 'danger')
        throw error
      })
  }

  return {
    updateSettings,
    updateNotificationSettings,
    sendTestEmail,
    setNotificationSound,
    setSoundEnabled,
  }
}

export function createAccountActions({
  data,
  setUser,
  setProfile,
  resetSessionState,
}) {
  // PATCH /users/me answers `{ user }` rather than the record itself — the same
  // envelope `verifyEmailChange` below already unwraps. Both profile saves pass
  // through here so a stored name can never be overwritten by the wrapper.
  const applyUser = (payload) => {
    const user = payload?.user ?? payload
    setUser(user)
    return user
  }

  const updateUser = (patch) => api.patch('/users/me', patch).then(applyUser)

  // POST /users/me/avatar answers with the stored URL alone, so the identity in
  // hand is patched rather than refetched — the header avatar, the drawer and
  // both profile pages read from this one store record.
  const uploadAvatar = (file) =>
    api.upload('/users/me/avatar', file).then((result) => {
      const user = { ...data.user, avatarUrl: result?.avatarUrl ?? null }
      setUser(user)
      return user
    })

  // Clearing the avatar is the other half of the same picker, so it is the same
  // profile write rather than a second endpoint.
  const removeAvatar = () => api.patch('/users/me', { avatarUrl: null }).then(applyUser)

  const updateProfile = (patch) =>
    api.patch('/profile', patch).then((result) => {
      setProfile(result.profile ?? result)
      return result
    })

  const completeOnboarding = (payload) =>
    api.post('/profile/onboarding', payload).then((result) => {
      setProfile(result.profile ?? result)
      return result
    })

  const deleteAccount = () =>
    api.del('/users/me').then((result) => {
      // setAuthState is owned by the provider, so hand the teardown back to it
      // rather than re-implementing the reset here.
      resetSessionState()
      return result
    })

  const requestChangePasswordCode = () => api.post('/users/me/password/code')

  const changePasswordWithCode = (code, newPassword) =>
    api.post('/users/me/password/verify', { code, newPassword }).then((result) => {
      // Changing the password revokes every refresh token, so the local
      // session can no longer be renewed and has to be torn down.
      resetSessionState()
      return result
    })

  const requestEmailChangeCode = (newEmail, currentPassword) =>
    api.post('/users/me/email/code', { newEmail, currentPassword })

  const verifyEmailChange = (newEmail, code) =>
    api.post('/users/me/email/verify', { newEmail, code }).then((result) => {
      // The session survives an email change, so only the cached identity is
      // refreshed here rather than the whole session.
      if (result?.user) setUser(result.user)
      return result
    })

  // Profile's "Forgot password" runs the exact same endpoints as
  // Login -> Forgot Password; the address comes from the signed-in user, so the
  // modal never asks for it.
  const sendPasswordResetCode = (email) =>
    api.post('/auth/forgot-password', { email })

  const verifyPasswordResetCode = (email, code) =>
    api.post('/auth/verify-reset-code', { email, code })

  const resetPassword = (email, code, newPassword) =>
    api.post('/auth/reset-password', { email, code, newPassword }).then((result) => {
      // reset-password revokes every refresh token for the account, including
      // this session's, so the user is signed out and must sign in again.
      resetSessionState()
      return result
    })

  return {
    updateUser,
    uploadAvatar,
    removeAvatar,
    updateProfile,
    completeOnboarding,
    deleteAccount,
    requestChangePasswordCode,
    changePasswordWithCode,
    requestEmailChangeCode,
    verifyEmailChange,
    sendPasswordResetCode,
    verifyPasswordResetCode,
    resetPassword,
  }
}
