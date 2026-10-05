import { CheckCircle2, Info, AlertTriangle, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useApp } from '@/app/providers/AppContext'
import { cx } from '@/utils/format'

const tones = {
  success: { icon: CheckCircle2, classes: 'text-emerald-600', bg: 'bg-white' },
  info: { icon: Info, classes: 'text-primary', bg: 'bg-white' },
  warn: { icon: AlertTriangle, classes: 'text-amber-600', bg: 'bg-white' },
  danger: { icon: AlertTriangle, classes: 'text-rose-600', bg: 'bg-white' },
}

export default function Toaster() {
  const { toasts, dismissToast } = useApp()

  return createPortal(
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-[70] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4">
      {toasts.map((toast) => {
        const tone = tones[toast.tone] ?? tones.success
        const Icon = tone.icon
        return (
          <div
            key={toast.id}
            className={cx(
              'pointer-events-auto flex items-center gap-3 rounded-card border border-border-subtle px-4 py-3 shadow-lifted',
              tone.bg
            )}
          >
            <Icon className={cx('size-[18px] flex-shrink-0', tone.classes)} strokeWidth={2} />
            <p className="flex-1 text-[13px] font-medium text-ink">{toast.message}</p>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismissToast(toast.id)}
              className="text-ink-faint transition-colors hover:text-ink"
            >
              <X className="size-4" strokeWidth={2} />
            </button>
          </div>
        )
      })}
    </div>,
    document.body
  )
}