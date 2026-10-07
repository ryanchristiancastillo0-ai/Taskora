import { normalizeNotificationSound, normalizeSettings } from '@/services/api/normalize'
import { setNotificationSoundUrl, setNotificationSoundEnabled } from '@/utils/notificationSound'
import { syncPushPreference } from '@/utils/notificationPush'
import { settingsApi } from '@/features/user/settings/api/settingsApi'
import { accountApi } from '@/features/user/profile/api/accountApi'
import { authApi } from '@/features/auth/api/authApi'

export function createSettingsActions({ data, setData, pushToast }) {
  const updateSettings = (patch) =>
    settingsApi.update(patch).then((settings) => {
      setData((prev) => ({
        ...prev,
        settings: normalizeSettings(
          settings,
          prev.settings.notifications,
          prev.settings.notificationSound
        ),
      }))
    })

  const updateNotificationSettings = (patch) => {
    const pushPref = patch?.pushNotifications

    // Push is the one switch with an effect beyond its row: it registers or
    // removes a browser subscription. Sync it BEFORE saving the preference, so
    // a denied permission prompt or an unconfigured server leaves the switch
    // off instead of a saved "on" that can never ring. Enabling throws on
    // failure (nothing is saved); disabling never throws, because turning off
    // must always work.
    const pushPrep =
      pushPref === true
        ? syncPushPreference(true)
        : pushPref === false
          ? syncPushPreference(false).catch(() => null)
          : Promise.resolve(null)

    return pushPrep
      .then(() => settingsApi.updateNotifications(patch))
      .then((result) => {
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
  }

  // Sends one real email to the signed-in user's own inbox. The toast is
  // deliberate: this is the only switch on the screen with no in-app effect,
  // so the message is the only confirmation the user gets.
  const sendTestEmail = () =>
    settingsApi.sendTestEmail().then((result) => {
      pushToast(
        `Test email sent to ${result?.sentTo ?? 'your inbox'}. Check your spam folder if it has not arrived.`,
        'success'
      )
      return result
    })

  // Optimistic sound selection: the store moves to the new sound before the
  // request so the dropdown and the next notification match immediately. On
  // failure the previous sound is restored, so the UI never shows a value the
  // backend rejected.
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

    return settingsApi
      .updateNotifications({ notificationSoundId })
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

  // Mute is optimistic for the same reason: the switch has to feel instant and
  // the engine must react before the request resolves, or the next
  // notification would still ring.
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

    return settingsApi
      .updateNotifications({ soundEnabled })
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
  // PATCH /users/me answers `{ user }` rather than the record itself, so both
  // profile saves go through here and a stored name can never be overwritten
  // by the wrapper.
  const applyUser = (payload) => {
    const user = payload?.user ?? payload
    setUser(user)
    return user
  }

  const updateUser = (patch) => accountApi.updateUser(patch).then(applyUser)

  // The avatar endpoint answers with the stored URL alone, so the identity in
  // hand is patched rather than refetched — the header avatar, the drawer and
  // both profile pages read from this one store record.
  const uploadAvatar = (file) =>
    accountApi.uploadAvatar(file).then((result) => {
      const user = { ...data.user, avatarUrl: result?.avatarUrl ?? null }
      setUser(user)
      return user
    })

  // Clearing the avatar is the other half of the same picker, so it is the same
  // profile write rather than a second endpoint.
  const removeAvatar = () => accountApi.updateUser({ avatarUrl: null }).then(applyUser)

  const updateProfile = (patch) =>
    accountApi.updateProfile(patch).then((result) => {
      setProfile(result.profile ?? result)
      return result
    })

  const completeOnboarding = (payload) =>
    accountApi.completeOnboarding(payload).then((result) => {
      setProfile(result.profile ?? result)
      return result
    })

  const deleteAccount = () =>
    accountApi.deleteAccount().then((result) => {
      // setAuthState is owned by the provider, so hand the teardown back to it
      // rather than re-implementing the reset here.
      resetSessionState()
      return result
    })

  const requestChangePasswordCode = () => accountApi.requestPasswordCode()

  const changePasswordWithCode = (code, newPassword) =>
    accountApi.changePasswordWithCode(code, newPassword).then((result) => {
      // Changing the password revokes every refresh token, so the local
      // session can no longer be renewed and has to be torn down.
      resetSessionState()
      return result
    })

  const requestEmailChangeCode = (newEmail, currentPassword) =>
    accountApi.requestEmailChangeCode(newEmail, currentPassword)

  const verifyEmailChange = (newEmail, code) =>
    accountApi.verifyEmailChange(newEmail, code).then((result) => {
      // The session survives an email change, so only the cached identity is
      // refreshed here rather than the whole session.
      if (result?.user) setUser(result.user)
      return result
    })

  // Profile's "Forgot password" runs the exact same endpoints as
  // Login -> Forgot Password; the address comes from the signed-in user, so the
  // modal never asks for it.
  const sendPasswordResetCode = (email) => authApi.forgotPassword(email)

  const verifyPasswordResetCode = (email, code) => authApi.verifyResetCode(email, code)

  const resetPassword = (email, code, newPassword) =>
    authApi.resetPassword(email, code, newPassword).then((result) => {
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
