import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import ChatWindow from '../components/ChatWindow'
import CommunityDetails from '../components/CommunityDetails'
import CommunityHeader from '../components/CommunityHeader'
import ConversationList from '../components/ConversationList'
import NewConversationModal from '../components/NewConversationModal'
import { useApp } from '../../context/AppContext'

/**
 * The Community page is a full-viewport, three-pane messenger rather than a
 * normal app page: it is mounted on its own route outside AppShell, so the app
 * sidebar and mobile bottom bar are gone and this component owns the whole
 * screen. That is what makes a chat feel like a chat instead of a card in a
 * content column.
 *
 * Breakpoints:
 *  - below `md`  one pane at a time (list / chat / details), driven by `pane`
 *  - `md` to `xl` list + chat, with details as an overlay drawer
 *  - `xl` and up  all three columns at once
 *
 * `pane` and `detailsOpen` are only meaningful at the smaller widths; at `xl`
 * the details column is always mounted and the drawer is never rendered, so the
 * controls that set them are simply inert there.
 */
export default function CommunityPage() {
  const { data, actions, activeConversationId } = useApp()
  const [newOpen, setNewOpen] = useState(false)
  const [newMode, setNewMode] = useState('DIRECT')
  const [newMemberIds, setNewMemberIds] = useState([])
  const [pane, setPane] = useState('LIST')
  const [detailsOpen, setDetailsOpen] = useState(false)

  const activeId = activeConversationId ?? null
  const conversation = data.conversations.find((item) => item.id === activeId)
  const unreadTotal = data.conversations.reduce(
    (sum, item) => sum + item.unread,
    0
  )

  const openNew = () => {
    setNewMode('DIRECT')
    setNewMemberIds([])
    setNewOpen(true)
  }

  const openGroupWith = (memberIds) => {
    setNewMode('GROUP')
    setNewMemberIds(memberIds)
    setNewOpen(true)
  }

  // Tapping a row on a phone moves to the chat pane; at wider widths the panes
  // are all visible at once and this is a no-op visually.
  const handleOpen = (conversationId) => {
    actions.openConversation(conversationId)
    setPane('CHAT')
  }

  const openDetails = () => {
    if (window.matchMedia('(min-width: 1280px)').matches) return
    setDetailsOpen(true)
    setPane('DETAILS')
  }

  // Selecting the first conversation on arrival is pre-existing behaviour, but
  // it must not hijack the phone's initial list pane, so it calls the action
  // directly rather than going through `handleOpen`.
  useEffect(() => {
    if (!activeConversationId && data.conversations.length > 0) {
      actions.openConversation(data.conversations[0].id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId, data.conversations.length])

  // A resize from a single pane up to three columns should not leave a stale
  // drawer latched open over the chat.
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1280px)')
    const onChange = (event) => {
      if (event.matches) setDetailsOpen(false)
    }
    query.addEventListener?.('change', onChange)
    return () => query.removeEventListener?.('change', onChange)
  }, [])

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-canvas">
      <CommunityHeader unreadTotal={unreadTotal} onNew={openNew} />

      <div className="relative flex min-h-0 flex-1">
        {/* Rail. Hidden on a phone whenever the chat or details pane is up. */}
        <aside
          className={`w-full flex-shrink-0 md:block md:w-80 xl:w-96 ${
            pane === 'LIST' ? 'block' : 'hidden'
          }`}
        >
          <ConversationList
            activeId={activeId}
            onOpen={handleOpen}
            onNew={openNew}
            onMessageUser={(userId) => {
              actions.createDirectConversation(userId)
              setNewOpen(false)
              setPane('CHAT')
            }}
            onAddToGroup={openGroupWith}
          />
        </aside>

        <main
          className={`min-w-0 flex-1 ${
            pane === 'CHAT' ? 'block' : 'hidden md:block'
          }`}
        >
          <ChatWindow
            conversationId={activeId}
            onBack={() => setPane('LIST')}
            onOpenDetails={openDetails}
          />
        </main>

        {/* Permanent third column on wide screens. */}
        <aside className="hidden w-80 flex-shrink-0 border-l border-border-subtle bg-surface-card xl:block">
          <CommunityDetails
            conversation={conversation}
            onMessageUser={(userId) => {
              actions.createDirectConversation(userId)
              setPane('CHAT')
            }}
            onAddToGroup={openGroupWith}
          />
        </aside>

        {/* Details as a drawer between `md` and `xl`, where the third column
            would squeeze the chat too narrow to read comfortably. */}
        {detailsOpen && (
          <>
            <div
              className="absolute inset-0 z-20 hidden bg-ink/40 md:block"
              onClick={() => setDetailsOpen(false)}
              aria-hidden="true"
            />
            <aside className="absolute inset-y-0 right-0 z-30 flex w-80 flex-col border-l border-border-subtle bg-surface-card shadow-lifted md:flex xl:hidden">
              <div className="flex justify-end border-b border-border-subtle px-2 py-2 md:hidden">
                <button
                  type="button"
                  aria-label="Close details"
                  onClick={() => {
                    setDetailsOpen(false)
                    setPane('CHAT')
                  }}
                  className="flex size-9 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-surface-container hover:text-ink"
                >
                  <X className="size-5" strokeWidth={2} />
                </button>
              </div>
              <CommunityDetails
                conversation={conversation}
                onClose={() => {
                  setDetailsOpen(false)
                  setPane('CHAT')
                }}
                onMessageUser={(userId) => {
                  actions.createDirectConversation(userId)
                  setDetailsOpen(false)
                  setPane('CHAT')
                }}
                onAddToGroup={openGroupWith}
              />
            </aside>
          </>
        )}

        {/* On a phone the details panel takes the whole screen as its own pane,
            with its own close affordance inside the panel. */}
        <div
          className={`min-w-0 flex-1 md:hidden ${
            pane === 'DETAILS' ? 'block' : 'hidden'
          }`}
        >
          <CommunityDetails
            conversation={conversation}
            onClose={() => setPane('CHAT')}
            onMessageUser={(userId) => {
              actions.createDirectConversation(userId)
              setPane('CHAT')
            }}
            onAddToGroup={openGroupWith}
          />
        </div>
      </div>

      <NewConversationModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        initialMode={newMode}
        initialMemberIds={newMemberIds}
      />
    </div>
  )
}
