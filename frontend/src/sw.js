// Taskora service worker (built by vite-plugin-pwa, injectManifest strategy).
//
// Two jobs:
//  1. Offline/SPA precaching, so the app shell loads without a network. This is
//     the default the plugin ships; it is written out here because switching to
//     injectManifest means we own the file.
//  2. Browser push: show a system notification when the server pushes, and take
//     the user to the app when they click it.
//
// The push payload is JSON { title, body, url, tag } produced by the backend's
// PushService. Icons reference files that actually exist in public/.

import { clientsClaim } from 'workbox-core'
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

// Activates the new worker for every open tab instead of waiting for a reload,
// so a push update is never stuck behind stale clients.
clientsClaim()

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// SPA fallback: any navigation that the precache does not answer is handled by
// the app shell, letting client-side routing work offline.
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')))

// ------------------------------------------------------------------ push

const NOTIFICATION_ICON = '/pwa-512x512.png'

// When the app is already open on a visible, focused tab the socket has already
// shown the in-app bell (and played its sound), so a system notification would
// be a duplicate of something the user is literally looking at. Only surface
// the push when no focused window is watching.
async function anyFocusedWindow() {
  const clientsList = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  })
  return clientsList.some(
    (client) => client.focused && client.visibilityState === 'visible'
  )
}

self.addEventListener('push', (event) => {
  if (!(self.Notification && self.Notification.permission === 'granted')) return

  let payload = {}
  try {
    payload = event.data?.json() ?? {}
  } catch {
    // The push service dropped a plain-text message; still show it.
    payload = { body: event.data?.text() ?? '' }
  }

  const title = payload.title || 'Taskora'
  const options = {
    body: payload.body || '',
    icon: NOTIFICATION_ICON,
    badge: '/pwa-192x192.png',
    data: { url: payload.url || '/' },
    tag: payload.tag || 'taskora',
  }

  event.waitUntil(
    anyFocusedWindow().then((focused) => {
      if (focused) return
      return self.registration
        .showNotification(title, options)
        .catch(() => {})
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  const url = event.notification.data?.url || '/'
  event.notification.close()

  event.waitUntil(
    (async () => {
      const targetPath = new URL(url, self.registration.scope).pathname
      const clientsList = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })

      // Prefer the tab already on the right page; otherwise focus any open
      // Taskora tab (the app reappears, route included via the SPA). Open a new
      // window only when the app is not running at all.
      const matching = clientsList.find(
        (client) => new URL(client.url).pathname === targetPath
      )
      const target = matching || clientsList[0]

      if (target && 'focus' in target) {
        await target.focus()
        return
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(url)
      }
    })()
  )
})