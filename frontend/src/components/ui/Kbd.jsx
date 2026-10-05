export default function Kbd({ children }) {
  return (
    <kbd className="inline-flex min-w-5 items-center justify-center rounded-[5px] border border-border-subtle bg-surface-card px-1.5 py-0.5 font-sans text-[11px] font-medium text-ink-faint shadow-sm">
      {children}
    </kbd>
  )
}