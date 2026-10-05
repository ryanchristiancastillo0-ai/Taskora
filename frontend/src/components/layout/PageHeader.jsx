export default function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {actions && (
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  )
}