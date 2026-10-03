function BrandMark() {
  return (
    <div className="flex flex-col items-start">
      <svg className="h-8 w-8 text-auth-ink" fill="currentColor" viewBox="0 0 24 24">
        <polygon points="4,3 20,3 20,8 14,8 14,21 10,21 10,8 4,8" />
        <polygon opacity="0.3" points="4,3 12,3 8,8 4,8" />
      </svg>
      <span className="mt-2 text-xl font-bold tracking-tight text-auth-ink">
        Taskora
      </span>
    </div>
  )
}

function FacetedTMonolith() {
  return (
    <svg
      className="block h-[min(300px,36vh)] w-auto lg:h-full lg:max-h-[min(400px,42vh)]"
      fill="none"
      viewBox="0 0 400 400"
    >
      <defs>
        <linearGradient gradientUnits="userSpaceOnUse" id="facet-left" x1="120" x2="60" y1="40" y2="340">
          <stop offset="0%" stopColor="#73767c" />
          <stop offset="45%" stopColor="#4a4d52" />
          <stop offset="100%" stopColor="#2a2b2e" />
        </linearGradient>
        <linearGradient gradientUnits="userSpaceOnUse" id="facet-right" x1="200" x2="310" y1="40" y2="300">
          <stop offset="0%" stopColor="#232427" />
          <stop offset="60%" stopColor="#18191b" />
          <stop offset="100%" stopColor="#0f0f10" />
        </linearGradient>
        <linearGradient gradientUnits="userSpaceOnUse" id="highlight-beam" x1="120" x2="200" y1="30" y2="210">
          <stop offset="0%" stopColor="#a6abb3" />
          <stop offset="100%" stopColor="#3e4147" />
        </linearGradient>
      </defs>
      <ellipse cx="200" cy="318" fill="#000000" filter="blur(8px)" opacity="0.8" rx="140" ry="12" />
      <polygon fill="url(#facet-left)" points="60,55 340,55 340,150 60,150" />
      <polygon fill="url(#facet-right)" opacity="0.92" points="200,55 340,55 340,150 200,150" />
      <polygon fill="url(#highlight-beam)" opacity="0.8" points="60,55 340,55 340,92 60,92" />
      <polygon fill="url(#facet-left)" points="170,150 230,150 230,305 170,305" />
      <polygon fill="url(#facet-right)" opacity="0.95" points="200,150 230,150 230,305 200,305" />
      <polygon fill="url(#highlight-beam)" opacity="0.5" points="170,150 182,150 182,305 170,305" />
      <polygon fill="#070708" points="168,150 232,150 232,159 168,159" />
    </svg>
  )
}

const members = [
  { initials: 'AO', bg: '#b45b35' },
  { initials: 'MK', bg: '#0644db' },
  { initials: 'RS', bg: '#585b54' },
]

function ShowcasePanel() {
  return (
    <section className="relative flex h-full w-full flex-col justify-between gap-6 overflow-hidden rounded-[38px] bg-auth-showcase p-6 shadow-2xl sm:p-8 lg:min-w-0 lg:flex-1 lg:max-w-[720px] lg:rounded-[44px]">
      <div className="light-streak -right-[20%] top-[32%]" />
      <div className="light-streak-secondary -right-[10%] top-[38%]" />
      <div className="flex min-h-0 flex-1 items-center justify-center pt-2 lg:flex-1">
        <FacetedTMonolith />
      </div>
      <div className="relative z-10 max-w-xl">
        <span className="mb-3 block text-xs font-semibold tracking-wide text-neutral-300">
          Taskora
        </span>
        <h2 className="mb-3 text-xl font-bold leading-snug tracking-tight text-white sm:text-2xl lg:text-[28px]">
          Welcome to Taskora
        </h2>
        <p className="mb-4 max-w-lg text-xs font-normal leading-relaxed text-neutral-400 sm:text-[13px]">
          Taskora helps you organize tasks, projects, and goals in one calm,
          structured space. Plan your week, track your habits, and finally get
          things done.
        </p>
        <p className="text-xs font-medium text-neutral-300 sm:text-[13px]">
          More than 17k builders already trust it, it's your turn
        </p>
      </div>
      <div className="relative z-10">
        <div
          className="notched-corner relative w-full overflow-hidden rounded-3xl bg-auth-showcase-card p-5 shadow-lg sm:p-6"
          style={{ '--notch-w': '90px', '--notch-h': '56px', '--notch-r': '18px', '--notch-bg': 'var(--color-auth-showcase)' }}
        >
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div className="max-w-md">
              <h3 className="mb-2 text-base font-bold leading-snug text-white sm:text-lg">
                One place for your whole
                <br className="hidden sm:inline" /> day, sorted
              </h3>
              <p className="text-xs font-normal leading-relaxed text-neutral-400 sm:text-[13px]">
                Organize projects, break big goals into habits, and keep
                everything visible at a glance.
              </p>
            </div>
            <div className="mb-1 flex shrink-0 items-center self-end md:self-auto">
              {members.map((member) => (
                <div
                  key={member.initials}
                  style={{ backgroundColor: member.bg }}
                  className="-ml-2.5 flex size-8 items-center justify-center rounded-full text-[11px] font-semibold text-white ring-2 ring-auth-showcase-card first:ml-0"
                >
                  {member.initials}
                </div>
              ))}
              <div className="-ml-2.5 flex size-8 items-center justify-center rounded-full bg-black/40 text-[11px] font-semibold text-white ring-2 ring-auth-showcase-card">
                +2
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export const authField =
  'w-full rounded-xl border border-transparent bg-auth-field py-3 pl-11 pr-4 text-sm font-normal text-auth-ink-body shadow-sm outline-none transition-colors placeholder:text-auth-ink-faint focus:border-auth-ink-faint focus:bg-auth-field focus:ring-0'

export const authPrimaryButton =
  'w-full rounded-xl bg-auth-btn py-3.5 px-4 text-center text-sm font-semibold text-auth-on-btn shadow-md transition-colors duration-150 hover:bg-auth-btn-hover active:scale-[0.99] disabled:opacity-60'

export const authError =
  'rounded-xl bg-auth-danger-soft px-4 py-2.5 text-xs font-medium text-auth-danger'

export function SocialAuthButtons({ onDisabled }) {
  const provider = (label) => onDisabled?.(label)
  return (
    <div className="flex items-center gap-3 pt-6">
      <button
        type="button"
        aria-label="Sign in with Google"
        onClick={() => provider('Google')}
        className="flex size-12 items-center justify-center rounded-full border border-auth-line bg-auth-card shadow-sm transition-colors hover:bg-auth-hover"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24">
          <path d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z" fill="#4285F4" />
          <path d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z" fill="#34A853" />
          <path d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z" fill="#FBBC05" />
          <path d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z" fill="#EA4335" />
        </svg>
      </button>
      <button
        type="button"
        aria-label="Sign in with GitHub"
        onClick={() => provider('GitHub')}
        className="flex size-12 items-center justify-center rounded-full border border-auth-line bg-auth-card shadow-sm transition-colors hover:bg-auth-hover"
      >
        <svg className="h-5 w-5 text-auth-ink" fill="currentColor" viewBox="0 0 24 24">
          <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
        </svg>
      </button>
    </div>
  )
}

function AuthContent({ title, subtitle, children }) {
  return (
    <>
      <div className="mb-8">
        <BrandMark />
      </div>
      <h1 className="mb-6 text-3xl font-bold tracking-tight text-auth-ink sm:text-[34px]">
        {title}
      </h1>
      {subtitle && (
        <p className="-mt-3 mb-6 text-sm font-normal leading-relaxed text-auth-ink-muted">
          {subtitle}
        </p>
      )}
      {children}
    </>
  )
}

export default function AuthLayout({ title, subtitle, children, split = true }) {
  if (!split) {
    return (
      <div className="flex min-h-dvh w-full select-none items-center justify-center bg-auth-canvas p-3 transition-colors sm:p-6 lg:p-10">
        <section className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-[520px] flex-col overflow-y-auto px-4 py-8 sm:px-10 lg:px-0">
          <div className="my-auto">
            <AuthContent title={title} subtitle={subtitle}>
              {children}
            </AuthContent>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh w-full select-none items-center justify-center bg-auth-canvas p-3 transition-colors sm:p-6 lg:p-10">
      <main className="grid w-full max-w-[1440px] grid-cols-1 items-stretch lg:h-[calc(100dvh-5rem)] lg:grid-cols-2">
        <section className="flex w-full flex-col overflow-y-auto px-4 py-8 sm:px-12 lg:h-full lg:px-16 lg:py-8">
          <div className="my-auto w-full">
            <AuthContent title={title} subtitle={subtitle}>
              {children}
            </AuthContent>
          </div>
        </section>
        <div className="hidden p-3 sm:p-6 lg:block lg:p-8">
          <ShowcasePanel />
        </div>
      </main>
    </div>
  )
}