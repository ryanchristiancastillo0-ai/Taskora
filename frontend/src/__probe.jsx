// TEMPORARY probe page: measures the notification bell dropdown and the stat
// cards at a real narrow viewport. Results are POSTed to the temp collector.
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
import './index.css'
import { AppProvider } from './__mockApp'
import AdminHeader from '@/shared/components/layouts/admin/AdminHeader'
import StatCard from '@/features/admin/components/StatCard'
import { Users, UserCheck, Activity, MessageSquare } from 'lucide-react'

const post = (name, body) =>
  fetch(`http://localhost:5198/report?as=${encodeURIComponent(name)}`, {
    method: 'POST',
    body,
  })

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// React tracks the previous value on the DOM node, so assigning `input.value`
// directly is swallowed as a no-op. Going through the prototype setter and then
// dispatching `input` is what makes a controlled input actually register.
function typeInto(input, text) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  ).set
  setter.call(input, text)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

const CARDS = [
  { label: 'Total Registered Accounts', value: 84213, icon: Users, tone: 'slate' },
  { label: 'Pending Moderation Reviews', value: 37, icon: Activity, tone: 'amber' },
  { label: 'Open Conversations', value: 96, icon: MessageSquare, tone: 'primary' },
  { label: 'Active Users', value: 1284, icon: UserCheck, tone: 'success' },
]

function OverflowList(limit = 24) {
  const out = []
  for (const el of document.querySelectorAll('*')) {
    const style = getComputedStyle(el)
    if (style.overflowX !== 'visible' || style.overflowY !== 'visible') continue
    if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
      out.push(
        `      "${(el.textContent || '').trim().slice(0, 46)}" client=${el.clientWidth} scroll=${el.scrollWidth} .${el.className.toString().slice(0, 60)}`
      )
    }
    if (out.length >= limit) break
  }
  return out
}

// Stands in for the admin console's router so the probe can see where a click
// actually navigated to.
function LocationMarker() {
  const loc = useLocation()
  return <pre data-probe="loc">{`${loc.pathname}${loc.search}`}</pre>
}

function Probe() {
  const [phase, setPhase] = useState('idle')
  useEffect(() => {
    // 1. measure the stat cards
    const lines = []
    const card = document.querySelector('[data-probe="card"]')
    const label = card?.querySelector('span.block.truncate')
    const value = card?.querySelector('p')
    lines.push(`== StatCard == viewport=${window.innerWidth}`)
    lines.push(
      `  card client=${card?.clientWidth} scroll=${card?.scrollWidth} docScroll=${document.documentElement.scrollWidth}`
    )
    lines.push(
      `  value client=${value?.clientWidth} scroll=${value?.scrollWidth} fs=${getComputedStyle(value).fontSize} text="${value?.textContent}"`
    )
    lines.push(
      `  label client=${label?.clientWidth} scroll=${label?.scrollWidth} clipped=${label?.scrollWidth > label?.clientWidth + 1} text="${label?.textContent}"`
    )
    // Hover the label and see whether a tooltip actually materialises.
    label?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    label?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    document.body.appendChild(Object.assign(document.createElement('pre'), {
      id: 'out',
      style: 'white-space:pre-wrap;font:12px monospace',
      textContent: lines.join('\n'),
    }))

    // 2. open the notification dropdown, then re-measure
    setPhase('open')
  }, [])

  useEffect(() => {
    if (phase !== 'open') return
    ;(async () => {
      // Open it here rather than in the previous effect, then wait. The bell has
      // a 120ms open delay and the panel runs its own measure effect on open, so
      // measuring in the same tick as the click catches the panel before that
      // clamp is committed - which reads as a bug that is not there.
      const btn = document.querySelector('button[aria-haspopup="dialog"]')
      btn?.click()
      await wait(400)
    try {
      const lines = [document.getElementById('out')?.textContent ?? '', '']
      const label = document.querySelector('[data-probe="card"] span.block.truncate')
      const panel = document.querySelector('[role="dialog"][aria-label="Notifications"]')
      lines.push(`== Notification panel == viewport=${window.innerWidth}x${window.innerHeight}`)
      if (!panel) {
        lines.push('  panel NOT FOUND')
      } else {
        const r = panel.getBoundingClientRect()
        const cs = getComputedStyle(panel)
        lines.push(
          `  box w=${Math.round(r.width)} h=${Math.round(r.height)} left=${Math.round(r.left)} right=${Math.round(r.right)} top=${Math.round(r.top)} bottom=${Math.round(r.bottom)}`
        )
        lines.push(
          `  offRight=${Math.round(Math.max(0, r.right - window.innerWidth))} offLeft=${Math.round(Math.max(0, -r.left))} offBottom=${Math.round(Math.max(0, r.bottom - window.innerHeight))}`
        )
        lines.push(`  width=${cs.width} maxWidth=${cs.maxWidth} overflowY=${cs.overflowY}`)
        // Why is the panel where it is? The bell it is anchored to, and the
        // inline clamp the component computes from that.
        const bell = document.querySelector('button[aria-haspopup="dialog"]')
        const br = bell?.getBoundingClientRect()
        lines.push(
          `  bell rect left=${Math.round(br?.left)} right=${Math.round(br?.right)} w=${Math.round(br?.width)}`
        )
        lines.push(`  panel inline style="${panel.getAttribute('style') || 'none'}"`)
        // each direct child row of the panel, to find internal breakage
        for (const child of panel.children) {
          const cr = child.getBoundingClientRect()
          const ccs = getComputedStyle(child)
          lines.push(
            `  row h=${Math.round(cr.height)} w=${Math.round(cr.width)} client=${child.clientWidth} scroll=${child.scrollWidth} cls="${ccs.flexWrap} ${(child.className || '').toString().slice(0, 40)}"`
          )
        }
        // the tightest inner line: title / message / footer text
        for (const sel of ['p.text-sm.font-semibold', 'span.truncate', 'button']) {
          const el = panel.querySelector(sel)
          if (el) {
            lines.push(
              `  inner[${sel}] client=${el.clientWidth} scroll=${el.scrollWidth} h=${Math.round(el.getBoundingClientRect().height)} text="${(el.textContent || '').trim().slice(0, 30)}"`
            )
          }
        }
      }
      lines.push(`  doc scrollWidth=${document.documentElement.scrollWidth}`)
      // Did the hover put a tooltip on screen, and is it inside the viewport?
      const tip = document.querySelector('[role="tooltip"]')
      if (label?.scrollWidth > label?.clientWidth + 1) {
        if (!tip) {
          lines.push('  TOOLTIP: MISSING on a clipped label')
        } else {
          const tr = tip.getBoundingClientRect()
          lines.push(
            `  TOOLTIP: text="${tip.textContent}" w=${Math.round(tr.width)} left=${Math.round(tr.left)} right=${Math.round(tr.right)} offLeft=${Math.round(Math.max(0, -tr.left))} offRight=${Math.round(Math.max(0, tr.right - window.innerWidth))} aboveLabel=${tr.bottom <= label.getBoundingClientRect().top + 1}`
          )
        }
      } else {
        lines.push(`  TOOLTIP: ${tip ? 'shown on an UNCLIPPED label (noise)' : 'not needed (label fits)'}`)
      }
      lines.push('  elements overflowing horizontally (visible overflow):')
      lines.push(...OverflowList())
      const out = document.getElementById('out')
      out.textContent = lines.join('\n')
      post(new URLSearchParams(location.search).get('as') || 'probe', out.textContent)
    } catch (error) {
      const out = document.getElementById('out')
      if (out) out.textContent += `\n  PROBE THREW: ${error.message}\n${error.stack}`
    }
      setPhase('search')
    })()
  }, [phase])

  // Drive the search box for real: type, wait out the debounce, then click a
  // result that is deliberately NOT the first one. The bug this guards against
  // indexed the three groups by an offset into the flat result list, so the
  // first result of the first group worked and every other click did nothing -
  // a check that only clicked result 0 would have passed straight through it.
  useEffect(() => {
    if (phase !== 'search') return
    ;(async () => {
      const lines = [`== AdminSearch == viewport=${window.innerWidth}x${window.innerHeight}`]
      try {
        // Report the header as it actually ships before touching anything, so
        // the collapsed and expanded states are both on record.
        const header = document.querySelector('header')
        lines.push(
          `  header scrollWidth=${header?.scrollWidth} clientWidth=${header?.clientWidth}`
        )
        // At `sm` and up the field is permanent and the toggle is `sm:hidden`,
        // so it must be filtered out by visibility - querySelector would happily
        // return a display:none button and the probe would "reveal" search that
        // was never collapsed, testing a state no user reaches.
        const toggle = [...(header?.querySelectorAll('button[aria-label*="earch"]') ?? [])]
          .find((b) => b.getClientRects().length > 0)
        lines.push(
          `  search toggle present: ${toggle ? `yes (aria-label="${toggle.getAttribute('aria-label')}")` : 'no (field is permanent at this width)'}`
        )
        lines.push(
          `  combobox in DOM before reveal: ${document.querySelector('input[role="combobox"]') ? 'yes' : 'no'}`
        )

        // Below `sm` the field is collapsed behind this button, so the phone
        // flow is: tap, then type. Skipping the tap would test a layout no user
        // ever sees.
        if (toggle) {
          toggle.click()
          await wait(250)
          lines.push(`  after tapping toggle, field visible: ${getComputedStyle(header.querySelector('div.min-w-0.max-w-md.flex-1')).display}`)
        }

        const input = document.querySelector('input[role="combobox"]')
        if (!input) throw new Error('combobox input not found')
        input.focus()
        // "onboarding" is a real term in the mock data that matches BOTH tasks
        // and projects, so the last option sits in the last group. A term with
        // no matches would render the empty state and prove nothing.
        typeInto(input, 'onboarding')
        await wait(900)
        lines.push(`  input.value after typing = "${input.value}"`)
        lines.push(
          `  field box w=${Math.round(input.getBoundingClientRect().width)} left=${Math.round(input.getBoundingClientRect().left)} right=${Math.round(input.getBoundingClientRect().right)}`
        )

        const listbox = document.querySelector('[role="listbox"]')
        const options = [...document.querySelectorAll('[role="option"]')]
        lines.push(`  listbox=${listbox ? 'present' : 'MISSING'} options=${options.length}`)
        lines.push(
          `  groups rendered: ${[...document.querySelectorAll('[role="listbox"] p')].map((p) => p.textContent.trim()).join(' | ') || 'NONE'}`
        )
        lines.push(`  footer="${(document.querySelector('[role="listbox"]')?.parentElement?.querySelector('p.border-t')?.textContent || '').trim()}"`)

        // Panel containment: a dropdown wider than the screen is the failure
        // that matters most at 320.
        const panel = listbox?.closest('div.absolute')
        if (panel) {
          const r = panel.getBoundingClientRect()
          lines.push(
            `  panel w=${Math.round(r.width)} offRight=${Math.round(Math.max(0, r.right - window.innerWidth))} offLeft=${Math.round(Math.max(0, -r.left))} offBottom=${Math.round(Math.max(0, r.bottom - window.innerHeight))}`
          )
        }
        lines.push(`  doc scrollWidth=${document.documentElement.scrollWidth} (viewport=${window.innerWidth})`)
        lines.push('  option texts:')
        for (const [i, o] of options.entries()) {
          lines.push(`    [${i}] ${o.textContent.trim().replace(/\s+/g, ' ').slice(0, 60)}`)
        }

        // Click the LAST option: it is in the last group with matches, so it can
        // only navigate if the entry -> group lookup is right.
        const target = options[options.length - 1]
        const before = document.querySelector('[data-probe="loc"]')?.textContent
        target?.click()
        await wait(400)
        const after = document.querySelector('[data-probe="loc"]')?.textContent
        lines.push(`  clicked last option -> location ${before} => ${after}`)
        lines.push(`  NAVIGATED: ${after && after !== before ? 'YES' : 'NO - click did nothing'}`)
        lines.push(`  panel closed after click: ${document.querySelector('[role="listbox"]') ? 'NO' : 'YES'}`)
        lines.push('  elements overflowing horizontally (visible overflow):')
        lines.push(...OverflowList())
      } catch (error) {
        lines.push(`  PROBE THREW: ${error.message}\n${error.stack}`)
      }
      const name = new URLSearchParams(location.search).get('as') || 'probe'
      post(`search-${name}`, lines.join('\n'))
    })()
  }, [phase])

  return (
    <>
      <AdminHeader onProfileClick={() => {}} />
      <main className="grid grid-cols-2 gap-4 p-4 pt-24 lg:grid-cols-4">
        {CARDS.map((c) => (
          <div data-probe="card" key={c.label}>
            <StatCard {...c} />
          </div>
        ))}
      </main>
      <LocationMarker />
    </>
  )
}

async function run() {
  if (new URLSearchParams(location.search).get('w')) return
  const root = createRoot(document.getElementById('root'))
  root.render(
    <AppProvider>
      <MemoryRouter>
        <Probe />
      </MemoryRouter>
    </AppProvider>
  )
  await new Promise((r) => setTimeout(r, 2500))
}

window.addEventListener('error', (e) => post('pageerror', String(e.message)))
run()
