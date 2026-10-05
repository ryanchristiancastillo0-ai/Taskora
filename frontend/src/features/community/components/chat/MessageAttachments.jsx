import { FileText } from 'lucide-react'
import Avatar from '@/components/ui/Avatar'
import { cx } from '@/utils/format'
import { formatBytes } from './messageFormat'

export function TypingBubble() {
  return (
    <div className="flex items-end gap-2">
      <Avatar name="" size="sm" />
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-border-subtle bg-surface-soft px-4 py-3">
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            className="size-1.5 animate-pulse rounded-full bg-ink-faint"
            style={{ animationDelay: `${dot * 150}ms` }}
          />
        ))}
      </div>
    </div>
  )
}

export default function MessageAttachments({ attachments, mine }) {
  if (!attachments?.length) return null

  const images = attachments.filter((item) => item.kind === 'IMAGE')
  const files = attachments.filter((item) => item.kind !== 'IMAGE')

  return (
    <div className="space-y-1.5">
      {images.length > 0 && (
        <div
          className={cx(
            'grid gap-1',
            images.length > 1 && 'grid-cols-2'
          )}
        >
          {images.map((item) => (
            <a
              key={item.id ?? item.url}
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="block overflow-hidden rounded-xl"
            >
              <img
                src={item.url}
                alt={item.fileName ?? 'Shared image'}
                loading="lazy"
                className={cx(
                  'w-full object-cover',
                  images.length === 1 ? 'max-h-56' : 'h-28'
                )}
              />
            </a>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className={cx('space-y-1.5', images.length > 0 && 'p-2.5')}>
          {files.map((item) => (
            <a
              key={item.id ?? item.url}
              href={item.url}
              target="_blank"
              rel="noreferrer"
              download={item.fileName ?? undefined}
              className={cx(
                'flex items-center gap-2 rounded-lg px-2.5 py-2 transition-opacity hover:opacity-80',
                mine ? 'bg-white/15' : 'bg-black/5'
              )}
            >
              <FileText
                className={cx(
                  'size-4 flex-shrink-0',
                  mine ? 'text-white/80' : 'text-ink-soft'
                )}
                strokeWidth={2}
              />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium">
                  {item.fileName ?? 'Attachment'}
                </p>
                {item.fileSize ? (
                  <p
                    className={cx(
                      'text-[11px]',
                      mine ? 'text-white/70' : 'text-ink-muted'
                    )}
                  >
                    {formatBytes(item.fileSize)}
                  </p>
                ) : null}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
