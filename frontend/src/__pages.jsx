// TEMPORARY: renders the real admin pages inside the real AppShell and reports
// anything that overflows, is clipped, or fails to pick up a ?q= deep link.
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import './styles/globals.css'
import { AppProvider } from './__mockApp'
// Not aliased, and genuinely required: components call useTheme, which throws
// outside the provider. Mirrors the real composition in App.jsx.
import { ThemeProvider } from '@/app/providers/ThemeProvider'
import AppShell from '@/components/layout/AppShell'
import AdminDashboard from '@/features/admin/dashboard/Dashboard'
import AdminUsers from '@/features/admin/users/pages/Users'
import AdminTasks from '@/features/admin/tasks/pages/Tasks'
import AdminProjects from '@/features/admin/projects/pages/Projects'
import AdminAiUsage from '@/features/admin/ai-usage/pages/AiUsage'
import AdminNotifications from '@/features/admin/notifications/pages/Notifications'
import AdminReports from '@/features/admin/reports/pages/Reports'
import AdminSettings from '@/features/admin/settings/pages/Settings'
import AdminProfile from '@/features/admin/profile/pages/Profile'

const post = (name, body) =>
  fetch(`http://localhost:5198/report?as=${encodeURIComponent(name)}`, {
    method: 'POST',
    body,
  })

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const PAGES = {
  '/admin': AdminDashboard,
  '/admin/users': AdminUsers,
  '/admin/tasks': AdminTasks,
  '/admin/projects': AdminProjects,
  '/admin/ai-usage': AdminAiUsage,
  '/admin/notifications': AdminNotifications,
  '/admin/reports': AdminReports,
  '/admin/settings': AdminSettings,
  '/admin/profile': AdminProfile,
}

// Text that is actually cut off, as opposed to a table that scrolls on purpose
// or a name that is deliberately ellipsised. Anything reported here is a person
// unable to read something they are meant to be able to read.
function ClippedText() {
  const out = []
  for (const el of document.querySelectorAll('*')) {
    if (el.children.length > 0) continue
    const text = (el.textContent || '').trim()
    if (!text) continue
    const cs = getComputedStyle(el)
    const ellipsised = cs.textOverflow === 'ellipsis'
    const scrolls = cs.overflowX === 'auto' || cs.overflowX === 'scroll'
    if (ellipsised || scrolls) continue
    if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
      out.push(
        `      "${text.slice(0, 48)}" client=${el.clientWidth} scroll=${el.scrollWidth} .${el.className.toString().slice(0, 48)}`
      )
    }
    if (out.length >= 12) break
  }
  return out
}

// Elements that push the page wider than the viewport. The check is on the
// document, not the element, because only that is a real scrollbar.
function PageOverflow() {
  const out = []
  const de = document.documentElement
  if (de.scrollWidth > de.clientWidth + 1) {
    out.push(`      PAGE SCROLLS HORIZONTALLY: scrollWidth=${de.scrollWidth} clientWidth=${de.clientWidth}`)
    for (const el of document.querySelectorAll('*')) {
      const r = el.getBoundingClientRect()
      if (r.right > de.clientWidth + 1 || r.left < -1) {
        out.push(
          `      escapes viewport: left=${Math.round(r.left)} right=${Math.round(r.right)} .${el.className.toString().slice(0, 60)}`
        )
      }
      if (out.length >= 10) break
    }
  }
  return out
}

function Probe() {
  const [done, setDone] = useState(false)
  useEffect(() => {
    ;(async () => {
      await wait(1400)
      const route = new URLSearchParams(location.search).get('route') || '/admin'
      const lines = [`== ${route}${new URLSearchParams(location.search).get('q') ? `?q=${new URLSearchParams(location.search).get('q')}` : ''} == ${window.innerWidth}x${window.innerHeight}`]

      const toolbarSearch = document.querySelector(
        'main input[type="search"], main input[placeholder*="earch" i]'
      )
      lines.push(`  toolbar search value = "${toolbarSearch?.value ?? 'NO SEARCH BOX'}"`)

      const headerSearch = document.querySelector('header input[type="search"]')
      lines.push(`  header search present = ${headerSearch ? 'yes' : 'no'}`)

      const bottomNav = document.querySelector('nav[aria-label*="avigation" i], nav.fixed')
      lines.push(
        `  bottom nav present = ${bottomNav ? `yes (${Math.round(bottomNav.getBoundingClientRect().width)}px)` : 'no'}`
      )
      const bell = document.querySelector('header button[aria-haspopup="dialog"]')
      lines.push(`  header bell present = ${bell ? 'yes' : 'no'}`)

      const main = document.querySelector('main')
      lines.push(`  main client=${main?.clientWidth} scroll=${main?.scrollWidth}`)

      const clipped = ClippedText()
      lines.push(`  clipped text nodes: ${clipped.length}`)
      lines.push(...clipped)

      const overflow = PageOverflow()
      lines.push(`  page horizontal overflow: ${overflow.length === 0 ? 'none' : 'FOUND'}`)
      lines.push(...overflow)

      lines.push(`  rendered text length = ${(document.body.innerText || '').length}`)
      post(new URLSearchParams(location.search).get('as') || 'pages', lines.join('\n'))
      setDone(true)
    })()
  }, [])

  return <div>{done ? null : <span>loading</span>}</div>
}

const params = new URLSearchParams(location.search)
// Same guard as the other probe: the outer page only builds the fixed-width
// iframe, so rendering a second copy here would measure the 1280px window and
// overwrite the narrow report.
if (!params.get('w')) {
  const route = params.get('route') || '/admin'
  const Page = PAGES[route] || AdminDashboard
  const query = params.get('q')
  const initialEntry = query ? `${route}?q=${encodeURIComponent(query)}` : route

  createRoot(document.getElementById('root')).render(
    <ThemeProvider>
      <AppProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <AppShell>
            <Page />
          </AppShell>
          {/* Mounted for real, inside the providers, so it measures the same DOM
              the page just painted. */}
          <Probe />
        </MemoryRouter>
      </AppProvider>
    </ThemeProvider>
  )
  window.addEventListener('error', (e) => post('pageerror', String(e.message)))
}
