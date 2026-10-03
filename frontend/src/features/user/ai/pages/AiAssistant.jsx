import { MessageSquarePlus, Volume2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import PageHeader from '@/shared/components/layouts/PageHeader'
import Button from '@/shared/components/ui/Button'
import ConfirmDialog from '@/shared/components/ui/ConfirmDialog'
import { useApp } from '../../context/AppContext'
import { compressImageIfNeeded } from '@/shared/utils/file'
import { MAX_AI_FILES } from '../constants'
import ConversationTabs from '../components/ConversationTabs'
import MessageComposer from '../components/MessageComposer'
import MessageList from '../components/MessageList'
import RenameConversationModal from '../components/RenameConversationModal'
import VoicePickerModal from '../components/VoicePickerModal'
import useAiSpeech from '../hooks/useAiSpeech'

export default function AiAssistantPage() {
  const { data, actions, pushToast, aiStream } = useApp()
  const [activeId, setActiveId] = useState(null)
  const [prompt, setPrompt] = useState('')
  const [loadingThread, setLoadingThread] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState([])
  const [pendingMessages, setPendingMessages] = useState([])
  const [renameTarget, setRenameTarget] = useState(null)
  const [renameName, setRenameName] = useState('')
  const [renameError, setRenameError] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  // The message list scroller. A ref rather than a sentinel element so the
  // distance to the bottom can be measured and scrolled directly.
  const scrollRef = useRef(null)
  // Whether the view is pinned to the newest message. A ref, not just state,
  // because the follow effect below needs the value from before this render.
  const pinnedRef = useRef(true)
  const [atBottom, setAtBottom] = useState(true)
  const fileInputRef = useRef(null)
  const renderedRef = useRef(new Set())
  // Guards a double submit. The button disables while sending, but Enter in the
  // input does not, and a fast double-Enter fired two identical messages before
  // the first request had returned. A ref rather than state because the check
  // must happen before the first await in `send`.
  const sendingRef = useRef(false)

  const markRendered = (ids) => {
    ids.forEach((id) => renderedRef.current.add(id))
  }

  const conversations = data.aiConversations

  const activeConversation = conversations.find((item) => item.id === activeId)
  const speakOn = Boolean(activeConversation?.isSpeak)

  const storedMessages = data.aiMessages
    .filter((message) => message.conversationId === activeId)
    .slice()
    .reverse()

  const messages = [...pendingMessages, ...storedMessages].sort(
    (a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0)
  )

  // The reply being written right now. Appended as a synthetic message so it
  // scrolls and renders through the same path as everything else, but never
  // persisted — the stored ai:message replaces it once the model finishes.
  const streamingReply =
    aiStream && aiStream.conversationId === String(activeId) && aiStream.content
      ? {
          id: '__streaming__',
          conversationId: activeId,
          role: 'ASSISTANT',
          content: aiStream.content,
          createdAt: new Date().toISOString(),
          streaming: true,
        }
      : null

  const visibleMessages = streamingReply
    ? [...messages, streamingReply]
    : messages

  const lastMessage = messages[messages.length - 1]
  // Stop showing the waiting indicator as soon as text starts arriving; from
  // then on the reply itself is the feedback.
  const thinking =
    Boolean(activeId) &&
    Boolean(lastMessage) &&
    lastMessage.role === 'USER' &&
    !streamingReply

  const {
    speechState,
    speakOpen,
    speakVoices,
    speakVoice,
    speakSaving,
    setSpeakOpen,
    setSpeakVoice,
    speakResponse,
    openSpeakModal,
    enableSpeak,
  } = useAiSpeech({
    activeConversation,
    speakOn,
    messages,
    renderedRef,
  })

  useEffect(() => {
    let cancelled = false
    actions.aiList().then((list) => {
      if (cancelled) return
      if (list.length > 0 && !activeId) {
        const first = list[0]
        setActiveId(first.id)
        return actions
          .aiGet(first.id)
          .then(({ messages: loaded }) => markRendered(loaded.map((message) => message.id)))
          .catch(() => {
            if (!cancelled) pushToast('Could not load conversation', 'danger')
          })
      }
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Opening a thread always lands on the newest reply, even if the same thread
  // was left scrolled up. Done without a smooth animation because the jump
  // would otherwise animate in from the previous scroll position.
  useEffect(() => {
    pinnedRef.current = true
    setAtBottom(true)
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [activeId])

  // Follow new replies only while the reader is already at the bottom. The
  // distance has to be captured on scroll rather than read here: by the time
  // this effect runs the DOM has already grown, so measuring now would report
  // the user as "far from the bottom" even when they never scrolled away.
  useEffect(() => {
    if (!pinnedRef.current || visibleMessages.length === 0) return
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    // Keyed on the streamed text too, so the view keeps following the reply as
    // it grows instead of jumping once and then drifting out of view.
  }, [
    visibleMessages.length,
    streamingReply?.content,
    thinking,
  ])

  const handleMessageScroll = () => {
    const el = scrollRef.current
    if (!el) return
    // A small tolerance so sub-pixel rounding at the very bottom does not count
    // as "scrolled away".
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    const pinned = distance <= 80
    pinnedRef.current = pinned
    setAtBottom(pinned)
  }

  const scrollToLatestReply = () => {
    pinnedRef.current = true
    setAtBottom(true)
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }

  const openThread = (id) => {
    if (!id || id === activeId) return
    setActiveId(id)
    setLoadingThread(true)
    actions
      .aiGet(id)
      .then(({ messages: loaded }) => markRendered(loaded.map((message) => message.id)))
      .catch((error) => pushToast(error?.message || 'Could not load conversation', 'danger'))
      .finally(() => setLoadingThread(false))
  }

  const newThread = () => {
    setPrompt('')
    setSelectedFiles((current) => {
      current.forEach((item) => item.preview && URL.revokeObjectURL(item.preview))
      return []
    })
    setPendingMessages((current) =>
      current.filter((message) => message.conversationId !== activeId)
    )
    setLoadingThread(true)
    actions
      .aiCreate()
      .then((conversation) => {
        if (!conversation?.id) throw new Error('Could not create chat')
        setActiveId(conversation.id)
      })
      .catch((error) => pushToast(error?.message || 'Could not create chat', 'danger'))
      .finally(() => setLoadingThread(false))
  }

  const toggleSpeak = async () => {
    if (!activeConversation) return
    const next = !speakOn
    try {
      await actions.aiSetSpeak(activeConversation.id, { isSpeak: next })
      pushToast(next ? 'Auto-speak on' : 'Auto-speak off')
    } catch (error) {
      pushToast(error?.message || 'Could not change auto-speak setting', 'danger')
    }
  }

  const openRename = (conversation) => {
    setRenameTarget(conversation)
    setRenameName(conversation.title ?? '')
    setRenameError('')
  }

  const saveRename = () => {
    const title = renameName.trim()
    if (!title) {
      setRenameError('Conversation name is required')
      return
    }
    if (renaming) return
    setRenaming(true)
    setRenameError('')
    actions
      .aiRename(renameTarget.id, title)
      .then(() => {
        setRenameTarget(null)
        pushToast('Conversation renamed')
      })
      .catch((error) => pushToast(error?.message || 'Could not rename conversation', 'danger'))
      .finally(() => setRenaming(false))
  }

  const confirmDelete = (id) => {
    if (deleting) return
    setDeleting(true)
    actions
      .aiDelete(id)
      .then(() => {
        setDeleteTarget(null)
        if (activeId === id) {
          setActiveId(null)
          const remaining = conversations.filter((item) => item.id !== id)
          if (remaining.length > 0) {
            const next = remaining[0]
            setActiveId(next.id)
            return actions.aiGet(next.id).catch(() =>
              pushToast('Could not load conversation', 'danger')
            )
          }
        }
      })
      .catch(() => pushToast('Could not delete conversation', 'danger'))
      .finally(() => setDeleting(false))
  }

  const pickFiles = (event) => {
    const incoming = Array.from(event.target.files || [])
    event.target.value = ''
    if (incoming.length === 0) return
    const available = Math.max(0, MAX_AI_FILES - selectedFiles.length)
    const adding = incoming.slice(0, available)
    if (adding.length === 0) {
      pushToast(`Each message supports up to ${MAX_AI_FILES} files`, 'warn')
      return
    }
    if (adding.length < incoming.length) {
      pushToast(`Only ${adding.length} more file(s) can be added`, 'warn')
    }
    const items = adding.map((file) => ({
      file,
      preview: String(file.type || '').startsWith('image/') ? URL.createObjectURL(file) : null,
    }))
    setSelectedFiles((current) => [...current, ...items])
  }

  const removeFile = (index) => {
    const target = selectedFiles[index]
    if (target?.preview) URL.revokeObjectURL(target.preview)
    setSelectedFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))
  }

  const ensureThread = async () => {
    if (activeId) return activeId
    const conversation = await actions.aiCreate()
    if (!conversation?.id) throw new Error('Could not create chat')
    setActiveId(conversation.id)
    return conversation.id
  }

  const send = async () => {
    const content = prompt.trim()
    if (!content && selectedFiles.length === 0) return
    if (sendingRef.current) return
    const messageText = content || 'Review the attached file(s).'

    let threadId
    try {
      threadId = await ensureThread()
    } catch (error) {
      pushToast(error?.message || 'Could not create chat', 'danger')
      return
    }

    const files = await Promise.all(
      selectedFiles.map((item) => compressImageIfNeeded(item.file))
    )

    const optimistic = {
      id: `local-${Date.now()}`,
      conversationId: threadId,
      role: 'USER',
      content: messageText,
      attachments: files.map((file) => ({
        url: null,
        fileName: file.name,
        fileType: file.type || null,
        fileSize: file.size,
        preview: String(file.type || '').startsWith('image/')
          ? URL.createObjectURL(file)
          : null,
      })),
      createdAt: new Date().toISOString(),
    }
    setPendingMessages((current) => [...current, optimistic])
    setPrompt('')
    selectedFiles.forEach((item) => item.preview && URL.revokeObjectURL(item.preview))
    setSelectedFiles([])

    try {
      await actions.aiSend(threadId, messageText, files)
    } catch (error) {
      pushToast(error?.message || 'Could not send message', 'danger')
    } finally {
      setPendingMessages((current) =>
        current.filter((message) => message.id !== optimistic.id)
      )
    }
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="AI Assistant"
        subtitle="Plan, prioritise and clarify — powered by your configured provider."
        actions={
          <>
            <Button
              onClick={toggleSpeak}
              icon={Volume2}
              variant={speakOn ? 'primary' : 'secondary'}
              disabled={!activeConversation}
              title="Speak each new reply aloud via ElevenLabs"
            >
              Auto-speak
            </Button>
            <Button onClick={newThread} icon={MessageSquarePlus} variant="secondary">
              New chat
            </Button>
          </>
        }
      />

      <div className="flex flex-1 flex-col overflow-hidden rounded-card border border-border-subtle bg-surface-card shadow-card">
        <ConversationTabs
          conversations={conversations}
          activeId={activeId}
          onOpenThread={openThread}
          onRename={openRename}
          onDelete={setDeleteTarget}
        />

        <MessageList
          messages={visibleMessages}
          loadingThread={loadingThread}
          thinking={thinking}
          activeId={activeId}
          user={data.user}
          profile={data.profile}
          speechState={speechState}
          onSpeak={speakResponse}
          scrollRef={scrollRef}
          atBottom={atBottom}
          onScroll={handleMessageScroll}
          onScrollToLatest={scrollToLatestReply}
        />

        <MessageComposer
          prompt={prompt}
          onPromptChange={setPrompt}
          onSend={send}
          selectedFiles={selectedFiles}
          onPickFiles={pickFiles}
          onRemoveFile={removeFile}
          fileInputRef={fileInputRef}
          speakOn={speakOn}
          onOpenSpeakModal={openSpeakModal}
          activeTitle={activeConversation}
        />
      </div>

      <RenameConversationModal
        open={Boolean(renameTarget)}
        onClose={() => setRenameTarget(null)}
        name={renameName}
        onNameChange={setRenameName}
        error={renameError}
        onSave={saveRename}
        saving={renaming}
      />

      <VoicePickerModal
        open={speakOpen}
        onClose={() => setSpeakOpen(false)}
        voices={speakVoices}
        voice={speakVoice}
        onVoiceChange={setSpeakVoice}
        onEnable={() => enableSpeak(ensureThread)}
        saving={speakSaving}
        speakOn={speakOn}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete conversation"
        message={
          <>
            Are you sure you want to delete{' '}
            <span className="font-semibold text-ink">
              {deleteTarget?.title ?? 'this conversation'}
            </span>
            ? This cannot be undone.
          </>
        }
        confirmLabel="Delete conversation"
        loading={deleting}
        onConfirm={() => deleteTarget && confirmDelete(deleteTarget.id)}
      />
    </div>
  )
}
