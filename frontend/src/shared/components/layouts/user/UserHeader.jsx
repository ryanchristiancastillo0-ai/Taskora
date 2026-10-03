import { useEffect, useRef, useState } from 'react'
import { Search, Sparkles } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '@/features/user/context/AppContext'
import { buttonClasses } from '../../ui/Button'
import Avatar from '../../ui/Avatar'
import IconButton from '../../ui/IconButton'
import SearchSuggest from '../../ui/SearchSuggest'
import SearchResultsModal from '../../ui/SearchResultsModal'
import NotificationBell from '../NotificationBell'
import { api } from '../../../api/client'
import { normalizeProject, normalizeTask } from '../../../api/normalize'
import { useDebouncedValue } from '../../../hooks/useDebouncedValue'
import { cx, personName } from '../../../utils/format'

export default function UserHeader({ onProfileClick, drawerOpen = false }) {
  const { data } = useApp()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [resultsOpen, setResultsOpen] = useState(false)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState({ tasks: [], projects: [] })
  const requestRef = useRef(0)

  const debouncedQuery = useDebouncedValue(query, 300)

  useEffect(() => {
    const term = debouncedQuery.trim()
    if (!term) {
      requestRef.current += 1
      setLoading(false)
      setError('')
      setResults({ tasks: [], projects: [] })
      return
    }

    const requestId = requestRef.current + 1
    requestRef.current = requestId
    setResultsOpen(true)
    setLoading(true)
    setError('')
    setResults({ tasks: [], projects: [] })

    api
      .get(`/search?q=${encodeURIComponent(term)}`)
      .then((payload) => {
        if (requestRef.current !== requestId) return
        const dataRes = payload ?? {}
        setResults({
          tasks: (dataRes.tasks || []).map(normalizeTask).filter(Boolean),
          projects: (dataRes.projects || []).map(normalizeProject).filter(Boolean),
        })
      })
      .catch((requestError) => {
        if (requestRef.current !== requestId) return
        setError(requestError.message || 'Search failed. Please try again.')
      })
      .finally(() => {
        if (requestRef.current !== requestId) return
        setLoading(false)
      })
  }, [debouncedQuery])

  const closeSearch = () => setResultsOpen(false)

  const submitSearch = (term) => {
    setQuery(term)
    // On mobile the field is a temporary reveal; once the term is committed the
    // results modal takes over, so put the header back to its normal shape.
    setMobileSearchOpen(false)
    if (term.trim()) setResultsOpen(true)
  }

  const toggleMobileSearch = () => setMobileSearchOpen((open) => !open)

  const openTask = (task) => {
    closeSearch()
    setMobileSearchOpen(false)
    navigate(`/tasks?taskId=${encodeURIComponent(task.id)}`)
  }

  const openProject = (project) => {
    closeSearch()
    setMobileSearchOpen(false)
    navigate(`/tasks?project=${encodeURIComponent(project.id)}`)
  }

  return (
    <header className="fixed left-0 right-0 top-0 z-30 flex h-16 items-center justify-between gap-2 border-b border-border-subtle bg-surface-card/85 px-4 backdrop-blur-xl sm:gap-3 sm:px-6 lg:left-64">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {/* The sidebar carries the brand from `lg` up, so the header only shows
            it below `lg` — otherwise phones and tablets would have no logo or
            app name at all. A touch smaller than the sidebar mark: the header
            has four controls competing for the same row, and at 360px the full
            size left no slack at all. While the phone search is open the brand
            steps aside so the field gets the full width. */}
        <div
          className={cx(
            'flex shrink-0 items-center gap-2 lg:hidden',
            mobileSearchOpen && 'hidden sm:flex'
          )}
        >
          <div className="flex size-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <Sparkles className="size-4" strokeWidth={2} />
          </div>
          <span className="text-sm font-bold tracking-tight text-ink">
            Taskora
          </span>
        </div>
        {/* Search is full-width from `sm` up, and `flex-1 min-w-0` lets it give
            width back to the brand as the header narrows. Below that the search
            icon reveals this same field instead, so the field never permanently
            squeezes the bell and avatar on a narrow phone. One search
            implementation either way. */}
        <div
          className={cx(
            'min-w-0 max-w-md flex-1',
            mobileSearchOpen ? 'block' : 'hidden sm:block'
          )}
        >
          <SearchSuggest
            value={query}
            onChange={setQuery}
            onSubmit={submitSearch}
            placeholder="Search tasks, projects..."
            showKbd
            enableShortcut
          />
        </div>
      </div>

      <div className="flex flex-shrink-0 items-center gap-1.5 sm:gap-3">
        {/* One button at every width, but the sparkle and the roomier padding
            only come back at `lg` — the same breakpoint where the sidebar
            appears. Below it the icon cost ~25px and squeezed the search field
            until it collided with the brand and the right-hand controls. The
            button also steps aside while the phone search is open so the field
            keeps the full width. */}
        <Link
          to="/ai"
          className={cx(
            buttonClasses({ size: 'sm' }),
            'lg:h-10 lg:gap-2 lg:px-4 lg:text-sm',
            mobileSearchOpen ? 'hidden sm:inline-flex' : 'inline-flex'
          )}
        >
          <Sparkles className="hidden size-4 lg:block" strokeWidth={2} />
          Ask AI
        </Link>
        <IconButton
          icon={Search}
          label={mobileSearchOpen ? 'Close search' : 'Search'}
          onClick={toggleMobileSearch}
          aria-expanded={mobileSearchOpen}
          className={cx('sm:hidden', mobileSearchOpen && 'bg-primary-soft text-primary')}
        />
        {/* The same rule as the admin header: while the phone search is open the
            row belongs to the field. With the bell and the avatar still on the
            row there were four 36px controls fighting for 288px and the field
            ended up ~70px wide. They return the moment it closes. */}
        {!mobileSearchOpen && <NotificationBell />}
        {/* The avatar is the mobile menu trigger. On desktop it stays a plain
            link to the profile, exactly as before. */}
        <Link to="/profile" aria-label="Profile" className="hidden lg:block">
          <Avatar name={personName(data.user)} src={data.user.avatarUrl} status="online" />
        </Link>
        {!mobileSearchOpen && (
          <button
            type="button"
            onClick={onProfileClick}
            aria-label="Open account menu"
            aria-haspopup="dialog"
            aria-expanded={drawerOpen}
            className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 lg:hidden"
          >
            <Avatar name={personName(data.user)} src={data.user.avatarUrl} status="online" />
          </button>
        )}
      </div>

      <SearchResultsModal
        open={resultsOpen}
        onClose={closeSearch}
        query={query}
        loading={loading}
        error={error}
        tasks={results.tasks}
        projects={results.projects}
        onSelectTask={openTask}
        onSelectProject={openProject}
      />
    </header>
  )
}