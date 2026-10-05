// Notification sound.
//
// Uses the Web Audio API rather than an HTMLAudioElement on purpose: a single
// shared element can only ever play once, so N notifications arriving together
// would restart one clip and be heard as a single beep. Here the file is
// fetched and decoded exactly once, and every notification gets its own
// AudioBufferSourceNode, so three notifications are genuinely heard three
// times even when they land in the same tick.
//
// The clip itself is not hardcoded. The backend owns the catalogue and the
// user's choice, and AppContext pushes the resolved URL in via
// setNotificationSoundUrl() during bootstrap. Until that arrives there is
// nothing to play, which is also why playback is never triggered from render.

const STAGGER_SECONDS = 0.3
const MAX_BACKLOG_BEEPS = 10
// How many auditioned clips stay decoded. Auditioning a long catalogue should
// not grow without bound, but re-decoding on every click sounds laggy.
const PREVIEW_CACHE_LIMIT = 8

let context = null
let currentUrl = null
let buffer = null
let bufferUrl = null
let loading = null
let unlocked = false
// Master mute. Defaults to OFF, matching the database default: a browser that
// reaches the engine before bootstrap has resolved the user's own preference is
// not a reason to make noise on someone's behalf. bootstrap() sets the real
// value before anything can ring, and auditioning is routed through a separate
// function that deliberately ignores this flag.
let soundEnabled = false
// Session suspension, deliberately separate from the master mute above. The mute
// is a preference the user owns; this is a temporary hold placed by the router
// on screens that are not part of the app (today: the 404 page, which is where a
// stale or mistyped link lands). Without it a bad URL was the loudest screen in
// Taskora: the provider sits above the router, so a page load of /404 still ran
// bootstrap - which beeps once per unread notification - and kept the socket
// live, so alerts kept ringing on a page that offers nothing to do about them.
// Auditioning still ignores this, so previewing a clip in Settings works.
let soundBlocked = false

// Audition state, deliberately separate from the active sound above so
// previewing a clip in Settings never changes what a real notification plays.
const previewBuffers = new Map()
const previewLoads = new Map()
let previewSource = null

// Autoplay policies start the context suspended until the user interacts with
// the page. A suspended context has a frozen currentTime, so anything scheduled
// still lines up once it resumes; it just needs the resume to happen.
function unlock() {
  if (unlocked) return
  unlocked = true

  const resume = () => {
    if (context && context.state === 'suspended') {
      context.resume().catch(() => {})
    }
  }

  const events = ['pointerdown', 'keydown', 'touchstart']
  events.forEach((event) =>
    window.addEventListener(event, resume, { capture: true, passive: true })
  )
  resume()
}

function getContext() {
  if (context) return context
  const Ctor = window.AudioContext || window.webkitAudioContext || null
  if (!Ctor) return null
  try {
    context = new Ctor()
  } catch {
    context = null
  }
  return context
}

function createVoice(ctx, decoded) {
  const source = ctx.createBufferSource()
  source.buffer = decoded
  source.connect(ctx.destination)
  return source
}

function disconnect(source) {
  try {
    source.disconnect()
  } catch {
    // Already torn down.
  }
}

function loadBuffer(ctx, url) {
  // Cached only for the clip it was decoded from, so switching sounds mid
  // session re-fetches instead of replaying the previous file.
  if (buffer && bufferUrl === url) return Promise.resolve(buffer)
  // De-duplicate concurrent callers so a burst of notifications decodes once.
  if (loading && loading.url === url) return loading.promise

  const promise = fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`sound ${response.status}`)
      return response.arrayBuffer()
    })
    .then((raw) => ctx.decodeAudioData(raw))
    .then((decoded) => {
      // A different sound may have been selected while this was decoding, in
      // which case the result is already stale — drop it rather than cache it.
      if (url !== currentUrl) return null
      buffer = decoded
      bufferUrl = url
      return decoded
    })
    .catch(() => null)
    .finally(() => {
      if (loading && loading.promise === promise) loading = null
    })

  loading = { url, promise }

  return promise
}

// Same shape as loadBuffer but keyed per URL, so auditioning several sounds in
// a row does not re-download and re-decode each one.
function loadPreviewBuffer(ctx, url) {
  if (previewBuffers.has(url)) {
    const cached = previewBuffers.get(url)
    // Re-insert to mark it as most recently used.
    previewBuffers.delete(url)
    previewBuffers.set(url, cached)
    return Promise.resolve(cached)
  }
  if (previewLoads.has(url)) return previewLoads.get(url)

  const promise = fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`sound ${response.status}`)
      return response.arrayBuffer()
    })
    .then((raw) => ctx.decodeAudioData(raw))
    .then((decoded) => {
      previewBuffers.set(url, decoded)
      while (previewBuffers.size > PREVIEW_CACHE_LIMIT) {
        previewBuffers.delete(previewBuffers.keys().next().value)
      }
      return decoded
    })
    .catch(() => null)
    .finally(() => {
      previewLoads.delete(url)
    })

  previewLoads.set(url, promise)

  return promise
}

// `offset` is expressed on the AudioContext clock rather than in wall-clock
// time, which is what keeps a burst sequential even while the context is still
// suspended waiting for a user gesture.
function playAt(offset) {
  // Both the single notification and the login backlog funnel through here, so
  // this is the one place that has to honour the mute switch.
  if (!soundEnabled || soundBlocked) return

  const url = currentUrl
  if (!url) return

  const ctx = getContext()
  if (!ctx) return

  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {})
  }

  loadBuffer(ctx, url)
    .then((decoded) => {
      if (!decoded || ctx.state === 'closed') return
      const source = createVoice(ctx, decoded)
      source.onended = () => disconnect(source)
      source.start(ctx.currentTime + Math.max(0, offset))
    })
    .catch(() => {})
}

/**
 * Point playback at a different clip. Passing the same URL is a no-op, so this
 * is safe to call on every settings load. Changing the URL drops the decoded
 * buffer so the next notification uses the new file.
 */
export function setNotificationSoundUrl(url) {
  const next = url || null
  if (next === currentUrl) return

  currentUrl = next
  buffer = null
  bufferUrl = null
}

/**
 * Turn the alert tone on or off for incoming notifications. Independent of which
 * clip is selected, so unmuting restores the previous choice. Auditioning in
 * Settings is unaffected and still plays.
 */
export function setNotificationSoundEnabled(enabled) {
  soundEnabled = enabled !== false
}

/** Current mute state, for callers that need to branch on it. */
export function isNotificationSoundEnabled() {
  return soundEnabled
}

/**
 * Hold playback for a screen that is outside the app, and release it on the way
 * out. Set by the router rather than by the provider: the provider mounts above
 * BrowserRouter, so it cannot read the current path itself. Independent of the
 * user's own mute switch - lifting the hold does not unmute anyone, and muting
 * while held is remembered when the hold is released.
 */
export function setNotificationSoundBlocked(blocked) {
  soundBlocked = blocked === true
}

/**
 * Play the notification sound once. Safe to call any number of times: each call
 * is an independent voice, so overlapping calls all sound.
 */
export function playNotificationSound() {
  try {
    unlock()
    playAt(0)
  } catch {
    // Audio is never allowed to break a notification.
  }
}

/**
 * Play the sound once per notification, staggered so a large backlog arrives
 * as a quick series of distinct beeps instead of one undifferentiated thud.
 * Used for notifications that were already waiting when the user logged in.
 */
export function playNotificationSounds(count = 1) {
  try {
    const total = Math.max(0, Math.min(Number(count) || 0, MAX_BACKLOG_BEEPS))
    for (let index = 0; index < total; index += 1) {
      playAt(index * STAGGER_SECONDS)
    }
  } catch {
    // Audio is never allowed to break a notification.
  }
}

/**
 * Audition a clip from the settings list without selecting it. Replaces any
 * preview already in flight. `onEnd` fires when the clip finishes (or fails to
 * start) so the caller can drive its button state. Resolves true when the clip
 * actually started.
 */
export function previewNotificationSound(url, onEnd) {
  try {
    stopNotificationSoundPreview()
    if (!url) {
      onEnd?.()
      return Promise.resolve(false)
    }

    unlock()
    const ctx = getContext()
    if (!ctx) {
      onEnd?.()
      return Promise.resolve(false)
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})

    return loadPreviewBuffer(ctx, url).then((decoded) => {
      if (!decoded || ctx.state === 'closed') {
        onEnd?.()
        return false
      }
      const source = createVoice(ctx, decoded)
      previewSource = source
      source.onended = () => {
        if (previewSource === source) previewSource = null
        disconnect(source)
        onEnd?.()
      }
      source.start(ctx.currentTime)
      return true
    })
  } catch {
    onEnd?.()
    return Promise.resolve(false)
  }
}

/** Cut off an audition early. */
export function stopNotificationSoundPreview() {
  if (!previewSource) return
  const source = previewSource
  previewSource = null
  try {
    // Drop onended first so tearing down does not look like a natural finish.
    source.onended = null
    source.stop()
  } catch {
    // Already stopped.
  }
  disconnect(source)
}
