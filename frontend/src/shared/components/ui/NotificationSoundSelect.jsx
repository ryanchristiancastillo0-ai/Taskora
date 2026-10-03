import { Square, Volume2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  previewNotificationSound,
  stopNotificationSoundPreview,
} from '../../utils/notificationSound'
import { cx } from '../../utils/format'
import IconButton from './IconButton'
import Select from './Select'

/**
 * Compact dropdown for the notification sound.
 *
 * Every name and path comes from the backend catalogue, so the client keeps no
 * list of its own. Selection is optimistic (the caller applies it to the store
 * and rolls back on failure); the play button only auditions the current choice,
 * it never changes it. Auditioning is routed through the sound engine directly
 * and therefore still works while the tone itself is switched off - that is the
 * only way to hear a clip on an account that is muted by default.
 *
 * Lives in shared/ui because the user Settings page and the admin console both
 * render it against the same settings payload; one implementation means the two
 * can never disagree about what a sound choice does.
 */
export default function NotificationSoundSelect({
  sounds,
  selectedId,
  onSelect,
  pushToast,
}) {
  const [auditioning, setAuditioning] = useState(false)
  // Mirrors `auditioning` so the audio callback can read it without
  // re-subscribing on every click.
  const auditioningRef = useRef(false)

  // Never leave audio running after the page goes away.
  useEffect(() => () => stopNotificationSoundPreview(), [])

  const selected = sounds.find((sound) => sound.id === selectedId)

  const toggleAudition = () => {
    if (auditioningRef.current) {
      stopNotificationSoundPreview()
      auditioningRef.current = false
      setAuditioning(false)
      return
    }
    if (!selected) return

    auditioningRef.current = true
    setAuditioning(true)

    previewNotificationSound(selected.path, () => {
      auditioningRef.current = false
      setAuditioning(false)
    }).then((started) => {
      // The file is listed in the database, so a failure here means the upload
      // is missing on the server rather than the entry being invalid.
      if (!started) {
        auditioningRef.current = false
        setAuditioning(false)
        pushToast(`"${selected.name}" could not be played`, 'danger')
      }
    })
  }

  if (sounds.length === 0) {
    return (
      <p className="text-[13px] text-ink-muted">
        No notification sounds available yet.
      </p>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Select
        value={selectedId}
        onChange={(event) => onSelect(event.target.value)}
        disabled={!selected}
        aria-label="Notification sound"
        className="w-52 sm:w-60"
      >
        {sounds.map((sound) => (
          <option key={sound.id} value={sound.id}>
            {sound.name}
          </option>
        ))}
      </Select>
      <IconButton
        icon={auditioning ? Square : Volume2}
        label={auditioning ? 'Stop preview' : `Play ${selected?.name ?? 'notification sound'}`}
        disabled={!selected}
        onClick={toggleAudition}
        className={cx('flex-shrink-0', auditioning && 'text-primary')}
      />
    </div>
  )
}
