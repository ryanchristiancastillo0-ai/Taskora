import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from '@/app/providers/AppContext'

export default function useAiSpeech({ activeConversation, speakOn, messages, renderedRef }) {
  const { actions, pushToast } = useApp()
  const [speechState, setSpeechState] = useState({})
  const [speakOpen, setSpeakOpen] = useState(false)
  const [speakVoices, setSpeakVoices] = useState([])
  const [speakVoice, setSpeakVoice] = useState('')
  const [speakSaving, setSpeakSaving] = useState(false)
  const audioRef = useRef(null)
  const objectUrlRef = useRef(null)
  // Bumped every time the open thread changes. A TTS request is a network round
  // trip, so a reply can be mid-flight when the user switches or deletes the
  // conversation; without this token the audio would start playing a moment
  // later, for a message that is no longer on screen.
  const threadTokenRef = useRef(0)

  const stopElementAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.removeAttribute('src')
      audioRef.current.load()
      audioRef.current = null
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
    try {
      window.speechSynthesis?.cancel()
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    return () => {
      stopElementAudio()
    }
  }, [stopElementAudio])

  // Switching tabs or deleting the open conversation must silence whatever is
  // currently being read out. Left to the unmount cleanup above, the audio kept
  // playing to the end of a message the user had just deleted — the component
  // never unmounts, only the conversation behind it changes. Clearing
  // speechState as well drops the spinner state left on the dead message.
  useEffect(() => {
    threadTokenRef.current += 1
    stopElementAudio()
    setSpeechState({})
  }, [activeConversation?.id, stopElementAudio])

  const speakFallback = useCallback(
    (message) => {
      const synth = window.speechSynthesis
      if (!synth) {
        setSpeechState((speech) => ({ ...speech, [message.id]: undefined }))
        pushToast('Could not generate speech', 'danger')
        return false
      }
      const utterance = new SpeechSynthesisUtterance(message.content)
      utterance.onend = () => {
        synth.cancel()
        setSpeechState((speech) => ({ ...speech, [message.id]: undefined }))
      }
      utterance.onerror = () => {
        synth.cancel()
        setSpeechState((speech) => ({ ...speech, [message.id]: undefined }))
        pushToast('Could not play the generated audio', 'danger')
      }
      synth.cancel()
      setSpeechState((speech) => ({ ...speech, [message.id]: 'playing' }))
      synth.speak(utterance)
      return true
    },
    [pushToast]
  )

  const speakResponse = useCallback(
    async (message) => {
      setSpeechState((current) => {
        const state = current[message.id]
        if (state === 'loading' || state === 'playing') return current
        return { ...current, [message.id]: 'loading' }
      })
      if (speechState[message.id] === 'loading' || speechState[message.id] === 'playing') {
        return
      }
      stopElementAudio()
      const token = threadTokenRef.current
      try {
        const { blob } = await actions.aiSpeak(
          message.content,
          activeConversation?.voiceId ?? null
        )
        // The thread changed while the audio was being generated. Say nothing:
        // this message is either off-screen or deleted, and the effect above has
        // already reset the state this call set.
        if (token !== threadTokenRef.current) return
        const url = URL.createObjectURL(blob)
        objectUrlRef.current = url
        const audio = new Audio(url)
        audioRef.current = audio
        const clear = () => {
          if (objectUrlRef.current === url) {
            URL.revokeObjectURL(url)
            objectUrlRef.current = null
          }
          audioRef.current = null
          setSpeechState((speech) => ({ ...speech, [message.id]: undefined }))
        }
        audio.onended = clear
        audio.onerror = () => {
          clear()
          pushToast('Could not play the generated audio', 'danger')
        }
        setSpeechState((speech) => ({ ...speech, [message.id]: 'playing' }))
        await audio.play()
      } catch {
        // Same check on the way out: a failed request must not fall back to the
        // browser voice and start reading a deleted message.
        if (token !== threadTokenRef.current) return
        if (speakFallback(message)) {
          pushToast('ElevenLabs voice unavailable — using browser voice', 'warn')
        }
      }
    },
    [actions, activeConversation?.voiceId, pushToast, speakFallback, speechState, stopElementAudio]
  )

  const openSpeakModal = useCallback(() => {
    setSpeakOpen(true)
    actions
      .aiVoices()
      .then((voices) => {
        setSpeakVoices(voices)
        const saved = activeConversation?.voiceId
        const match = voices.find((voice) => voice.id === saved)
        setSpeakVoice(match ? match.id : voices[0]?.id ?? '')
      })
      .catch((error) => pushToast(error?.message || 'Could not load voices', 'danger'))
  }, [actions, activeConversation?.voiceId, pushToast])

  const enableSpeak = useCallback(
    async (ensureThread) => {
      if (!speakVoice || speakSaving) return
      setSpeakSaving(true)
      try {
        let threadId = activeConversation?.id
        if (!threadId) threadId = await ensureThread()
        await actions.aiSetSpeak(threadId, { isSpeak: true, voiceId: speakVoice })
        setSpeakOpen(false)
        pushToast(activeConversation?.isSpeak ? 'Voice updated' : 'Voice replies enabled')
      } catch (error) {
        pushToast(error?.message || 'Could not enable voice replies', 'danger')
      } finally {
        setSpeakSaving(false)
      }
    },
    [actions, activeConversation?.id, activeConversation?.isSpeak, pushToast, speakSaving, speakVoice]
  )

  useEffect(() => {
    if (!speakOn) return
    const assistant = messages.filter((message) => message.role !== 'USER')
    const target = assistant.length > 0 ? assistant[assistant.length - 1] : null
    if (!target || renderedRef.current.has(target.id)) return
    renderedRef.current.add(target.id)
    speakResponse(target)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speakOn, messages])

  return {
    speechState,
    speakOpen,
    speakVoices,
    speakVoice,
    speakSaving,
    setSpeakOpen,
    setSpeakVoice,
    stopElementAudio,
    speakResponse,
    openSpeakModal,
    enableSpeak,
  }
}
