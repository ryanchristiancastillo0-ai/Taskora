// Browser push subscription lifecycle for the Push notifications switch.
//
// Three players cooperate:
//   - The browser holds a PushSubscription per device (via the service worker).
//   - The backend stores it (POST/DELETE .../push/subscribe) and sends pushes.
//   - The switch in Settings calls this module, never the push API directly.
//
// Enabling asks for notification permission first (a user gesture is why the
// store action runs this *before* saving the switch), then subscribes the
// current device and registers it with the server. Disabling removes it from
// the server and unsubscribes the browser. Multiple devices are independent:
// each device subscribing publishes its own endpoint, and turning the switch
// off for one device only removes that device's row.

import { settingsApi } from '@/features/user/settings/api/settingsApi'

// The applicationServerKey must be a Uint8Array, not the base64 string the
// server hands out. Standard Web Push encoding dance.
function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(normalized)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i)
  return output
}

async function currentRegistration() {
  if (!('serviceWorker' in navigator)) return null
  return navigator.serviceWorker.ready
}

/** True when the browser could realistically do push, regardless of config. */
async function isPushSupported() {
  return Boolean(
    typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      typeof Notification !== 'undefined' &&
      (await currentRegistration())
  )
}

/** What the server says it can do: the VAPID public key, or that push is off. */
export async function getPushAvailability() {
  try {
    const config = await settingsApi.getPushConfig()
    return {
      enabled: Boolean(config?.enabled && config?.publicKey),
      publicKey: config?.publicKey ?? null,
      supported: await isPushSupported(),
    }
  } catch {
    return { enabled: false, publicKey: null, supported: false }
  }
}

/**
 * Enable push for the current device. Throws a readable error on denial or
 * when the server cannot push, so the caller can refuse to save the switch.
 */
export async function enablePushOnDevice() {
  const availability = await getPushAvailability()
  if (!availability.enabled || !availability.publicKey) {
    throw new Error('Push is not enabled on this server yet')
  }
  if (!availability.supported) {
    throw new Error('This browser does not support push notifications')
  }

  let permission = Notification.permission
  if (permission === 'default') {
    permission = await Notification.requestPermission()
  }
  if (permission !== 'granted') {
    throw new Error(
      permission === 'denied'
        ? 'Notifications are blocked for this site. Allow them in your browser to receive push.'
        : 'You dismissed the notification request. Turn the switch on again to allow push.'
    )
  }

  const registration = await currentRegistration()

  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(availability.publicKey),
    })
  }

  const details = subscription.toJSON()
  await settingsApi.subscribePush({
    endpoint: details.endpoint,
    keys: { p256dh: details.keys.p256dh, auth: details.keys.auth },
  })

  return { enabled: true }
}

/**
 * Disable push for the current device. Best effort: even if the browser fights
 * us, turning the switch OFF must succeed, so failures here never throw to the
 * caller — an orphaned row is cheap (and the server drops it on first push).
 */
export async function disablePushOnDevice() {
  const registration = await currentRegistration()
  if (!registration) return { enabled: false }

  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return { enabled: false }

  const endpoint = subscription.endpoint
  try {
    await settingsApi.unsubscribePush(endpoint)
  } catch {
    // Server unreachable/stale — still remove it locally so we stop storing.
  }
  try {
    await subscription.unsubscribe()
  } catch {
    // Already torn down.
  }

  return { enabled: false }
}

/**
 * The single entry point the Settings action calls while saving the switch.
 * `pref === true`  enable; `pref === false` disable; unknown/undefined is a
 * no-change and resolves silently.
 */
export async function syncPushPreference(pref) {
  if (pref === true) return enablePushOnDevice()
  if (pref === false) return disablePushOnDevice()
  return null
}