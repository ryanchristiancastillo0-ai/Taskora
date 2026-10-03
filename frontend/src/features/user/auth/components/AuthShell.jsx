import { Sparkles } from 'lucide-react'

export default function AuthShell({ title, subtitle, children }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary shadow-card">
            <Sparkles className="size-6" strokeWidth={2} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Taskora</h1>
          <p className="mt-1 text-sm text-ink-muted">Personal task manager</p>
        </div>
        <div className="rounded-card border border-border-subtle bg-surface-card p-6 shadow-card sm:p-8">
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  )
}