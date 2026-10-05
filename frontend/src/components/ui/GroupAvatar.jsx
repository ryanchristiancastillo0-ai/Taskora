import { Users } from 'lucide-react'
import { cx, initials } from '@/utils/format'

const MAX_TILES = 4

// How the member avatars tile inside the circle. Mirrors what modern chat apps
// do: one face, a row for two or three, a 2x2 grid from four upwards.
function gridFor(count) {
  if (count <= 1) return 'grid-cols-1'
  if (count === 2) return 'grid-cols-2'
  if (count === 3) return 'grid-cols-3'
  return 'grid-cols-2 grid-rows-2'
}

function nameOf(member) {
  return `${member.firstName ?? ''} ${member.lastName ?? ''}`.trim()
}

/**
 * Group avatar. Uses the uploaded icon when there is one, otherwise composes a
 * collage from the member profile pictures, so a group always has a face and
 * the collage updates by itself as people join or leave.
 */
export default function GroupAvatar({
  name = '',
  iconUrl,
  members = [],
  className,
}) {
  if (iconUrl) {
    return (
      <img
        src={iconUrl}
        alt={name}
        className={cx('flex-shrink-0 rounded-full object-cover', className)}
      />
    )
  }

  const people = members.filter(Boolean)

  if (people.length === 0) {
    return (
      <span
        className={cx(
          'flex flex-shrink-0 items-center justify-center rounded-full bg-surface-container text-ink-soft',
          className
        )}
      >
        <Users className="size-1/2" strokeWidth={2} />
      </span>
    )
  }

  const shown = people.slice(0, MAX_TILES)
  const overflow = people.length - shown.length
  const compact = people.length >= 3

  return (
    <span
      className={cx(
        'grid flex-shrink-0 gap-px overflow-hidden rounded-full bg-surface-card p-px',
        gridFor(people.length),
        className
      )}
    >
      {shown.map((member, index) => (
        <span
          key={member.id ?? index}
          className="relative flex min-h-0 min-w-0 items-center justify-center overflow-hidden bg-surface-container"
        >
          {member.avatarUrl ? (
            <img
              src={member.avatarUrl}
              alt={nameOf(member)}
              loading="lazy"
              className="size-full object-cover"
            />
          ) : (
            <span
              aria-label={nameOf(member)}
              className={cx(
                'flex size-full items-center justify-center bg-primary-soft font-semibold leading-none text-primary',
                compact ? 'text-[8px]' : 'text-[10px]'
              )}
            >
              {initials(nameOf(member))}
            </span>
          )}
          {index === shown.length - 1 && overflow > 0 && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-[9px] font-semibold leading-none text-white">
              +{overflow}
            </span>
          )}
        </span>
      ))}
    </span>
  )
}
