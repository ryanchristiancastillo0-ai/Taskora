import { FileText } from 'lucide-react'
import { resolveAssetUrl } from '@/services/api/client'
import { cx, formatBytes } from '@/utils/format'

export default function FileChip({ attachment, bubble }) {
  const isImage = (attachment.fileType || '').startsWith('image/')
  const href = attachment.url ? resolveAssetUrl(attachment.url) : null
  return (
    <div
      className={cx(
        'flex items-center gap-2 rounded-lg px-2 py-1.5',
        bubble ? 'bg-black/10' : 'border border-border-subtle bg-surface-soft'
      )}
    >
      {isImage && (href || attachment.preview) ? (
        <img
          src={href || attachment.preview}
          alt=""
          className="size-7 shrink-0 rounded object-cover"
        />
      ) : (
        <FileText className="size-4 shrink-0" strokeWidth={2} />
      )}
      <span className="max-w-[180px] truncate text-xs font-medium">
        {attachment.fileName || 'file'}
      </span>
      {attachment.fileSize != null && (
        <span className="shrink-0 text-[11px] opacity-70">
          {formatBytes(attachment.fileSize)}
        </span>
      )}
    </div>
  )
}
