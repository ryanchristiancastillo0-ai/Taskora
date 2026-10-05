import {
  ArrowLeft,
  MessageCirclePlus,
  Sparkles,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useApp } from '@/app/providers/AppContext'
import NotificationBell from '@/components/layout/NotificationBell'
import Avatar from '@/components/ui/Avatar'
import { buttonClasses } from '@/components/ui/Button'
import { personName } from '@/utils/format'

/**
 * The chat page's own top bar.
 *
 * `/community` deliberately sits outside AppShell: a messenger is a focus
 * surface, and the app sidebar plus the mobile bottom bar would each take a
 * quarter of a phone screen for navigation that has nothing to do with the
 * conversation in front of you. That makes this bar responsible for identity
 * and for the way back, so it carries the Taskora mark, the Dashboard link, the
 * page name, and the two controls that would otherwise have come from the shell
 * (the notification bell and the account avatar).
 */
export default function CommunityHeader({ unreadTotal, onNew }) {
  const { data } = useApp()

  return (
    <header className="z-20 flex h-16 flex-shrink-0 items-center gap-2 border-b border-border-subtle bg-surface-card px-3 sm:gap-3 sm:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        {/*
          Always visible. This used to be `hidden ... sm:flex`, which did not
          make the control smaller on a phone — it deleted it, leaving Community
          with no way back to the dashboard at all below 640px. Community sits
          outside AppShell, so there is no sidebar and no bottom bar to fall back
          on either.

          It is now compacted rather than removed, using the same idiom as the
          "New chat" button below: the arrow is always shown, the word only from
          `sm` up. That costs 32px instead of the ~90px the full label needed,
          which is what actually made the label unaffordable on a phone.
        */}
        <Link
          to="/"
          aria-label="Back to dashboard"
          className="flex flex-shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] font-medium text-ink-muted transition-colors hover:bg-surface-container hover:text-ink"
        >
          <ArrowLeft className="size-4" strokeWidth={2} />
          <span className="hidden sm:inline">Dashboard</span>
        </Link>
        {/* The brand is hidden below `sm` because the back arrow above now
            carries the way home, and two adjacent controls that both point at
            `/` read as a mistake rather than as two ways to do the same thing.
            The mark returns at `sm`, where there is room for it again. */}
        <Link
          to="/"
          aria-label="Taskora dashboard"
          className="hidden flex-shrink-0 items-center gap-2 rounded-lg px-1 py-1 sm:flex"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <Sparkles className="size-4" strokeWidth={2} />
          </span>
          <span className="hidden text-sm font-bold tracking-tight text-ink lg:block">
            Taskora
          </span>
        </Link>

        <span
          aria-hidden="true"
          className="hidden h-6 w-px flex-shrink-0 bg-border-subtle lg:block"
        />
        <h1 className="min-w-0 truncate text-sm font-semibold text-ink sm:text-[15px]">
          Community
        </h1>
        {unreadTotal > 0 && (
          <span className="hidden flex-shrink-0 items-center gap-1.5 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary sm:flex">
            {unreadTotal} unread
          </span>
        )}
      </div>

      <div className="flex flex-shrink-0 items-center gap-1 sm:gap-2">
        {/* Label from `sm` up; a bare icon button on a phone so the bell and the
            avatar keep their room. */}
        <button
          type="button"
          onClick={onNew}
          aria-label="New chat"
          className={buttonClasses({ size: 'sm' })}
        >
          <MessageCirclePlus className="size-4" strokeWidth={2} />
          <span className="hidden sm:inline">New chat</span>
        </button>
        <NotificationBell />
        <Link to="/profile" aria-label="Your profile">
          <Avatar name={personName(data.user)} size="sm" />
        </Link>
      </div>
    </header>
  )
}
