import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ACTIVE_PLANTS } from '../plants'
import { chatWithPlant, summarizeChat, uploadPhoto, ChatMessage } from '../api'

const IDLE_MS = 5 * 60 * 1000

type Phase = 'pick' | 'chat' | 'summarizing' | 'done'

interface UIMessage {
  role: 'user' | 'assistant'
  content: string
  photoUrl?: string    // local object URL for display only
  imageData?: { base64: string; mediaType: string }  // sent to Claude as vision block
}

function toApi(msgs: UIMessage[]): ChatMessage[] {
  return msgs.map(({ role, content, imageData }) => ({ role, content, ...(imageData && { imageData }) }))
}

export default function PlantNote() {
  const navigate = useNavigate()

  const [phase,     setPhase]     = useState<Phase>('pick')
  const [plantId,   setPlantId]   = useState<number | null>(null)
  const [messages,  setMessages]  = useState<UIMessage[]>([])
  const [input,     setInput]     = useState('')
  const [sending,   setSending]   = useState(false)
  const [errorMsg,  setErrorMsg]  = useState<string | null>(null)
  const [savedNote,   setSavedNote]   = useState('')
  const [gardenNote,  setGardenNote]  = useState<{ category: string; body: string } | null>(null)

  const bottomRef = useRef<HTMLDivElement>(null)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const finishRef = useRef<() => void>(() => {})

  const selectedPlant = ACTIVE_PLANTS.find(p => p.id === plantId) ?? null

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const resetIdleTimer = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => finishRef.current(), IDLE_MS)
  }, [])

  useEffect(() => {
    if (phase === 'chat') resetIdleTimer()
    return () => { if (idleTimer.current) clearTimeout(idleTimer.current) }
  }, [phase, resetIdleTimer])

  async function finish() {
    if (!plantId || messages.length === 0) { navigate('/'); return }
    if (idleTimer.current) clearTimeout(idleTimer.current)
    setPhase('summarizing')
    setErrorMsg(null)
    try {
      const textOnly = messages.map(({ role, content }) => ({ role, content }))
      const result = await summarizeChat(plantId, textOnly)
      setSavedNote(result.plant_note)
      setGardenNote(result.garden_note ?? null)
      setPhase('done')
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Failed to save note')
      setPhase('chat')
    }
  }

  // keep finishRef pointing at latest finish (avoids stale closure in idle timer)
  useEffect(() => { finishRef.current = finish })

  function startChat(id: number) {
    setPlantId(id)
    setMessages([])
    setInput('')
    setErrorMsg(null)
    setPhase('chat')
  }

  async function send() {
    const text = input.trim()
    if (!text || sending || !plantId) return
    setInput('')
    setErrorMsg(null)
    resetIdleTimer()

    const next: UIMessage[] = [...messages, { role: 'user', content: text }]
    setMessages(next)
    setSending(true)

    try {
      const reply = await chatWithPlant(plantId, toApi(next))
      setMessages(m => [...m, { role: 'assistant', content: reply }])
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Send failed')
    } finally {
      setSending(false)
      resetIdleTimer()
    }
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !plantId || sending) return
    e.target.value = ''

    const localUrl = URL.createObjectURL(file)
    setSending(true)
    setErrorMsg(null)
    resetIdleTimer()

    try {
      // Resize + convert to JPEG so the payload is small and always a supported format
      const img = new Image()
      img.src = localUrl
      await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = reject })
      const MAX_DIM = 1024
      const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight))
      const canvas = document.createElement('canvas')
      canvas.width  = Math.round(img.naturalWidth  * scale)
      canvas.height = Math.round(img.naturalHeight * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      const base64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1]

      const date = new Date().toISOString().split('T')[0]
      await uploadPhoto(plantId, file, `${selectedPlant?.label} - ${date} - chat`)

      const next: UIMessage[] = [
        ...messages,
        {
          role: 'user',
          content: 'Here is a photo of my plant.',
          photoUrl: localUrl,
          imageData: { base64, mediaType: 'image/jpeg' },
        },
      ]
      setMessages(next)

      const reply = await chatWithPlant(plantId, toApi(next))
      setMessages(m => [...m, { role: 'assistant', content: reply }])
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Photo upload failed')
    } finally {
      setSending(false)
      resetIdleTimer()
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  // ── Plant picker ─────────────────────────────────────────────────────────────

  if (phase === 'pick') {
    return (
      <div className="page">
        <div className="page-header">
          <button className="back-btn" onClick={() => navigate('/')}>← Home</button>
          <h1>Plant Chat</h1>
        </div>
        <div className="page-body">
          <div className="section-label">Which plant?</div>
          <div className="plant-grid">
            {ACTIVE_PLANTS.map(p => (
              <button key={p.id} className="plant-tile" onClick={() => startChat(p.id)}>
                <span className="pt-label">{p.label}</span>
                <span className="pt-name">{p.shortName}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── Summarizing ──────────────────────────────────────────────────────────────

  if (phase === 'summarizing') {
    return (
      <div className="page">
        <div className="status-screen">
          <div className="status-icon" style={{ animation: 'pulse 1s infinite' }}>✍️</div>
          <h2>Saving note…</h2>
          <p>Summarizing your conversation.</p>
        </div>
      </div>
    )
  }

  // ── Done ─────────────────────────────────────────────────────────────────────

  if (phase === 'done') {
    return (
      <div className="page">
        <div className="status-screen">
          <div className="status-icon">📝</div>
          <h2>Note{gardenNote ? 's' : ''} saved!</h2>

          <div style={{ width: '100%', maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="garden-note-block">
              <div className="garden-note-label">{selectedPlant?.label ?? 'Plant'} note</div>
              <div className="garden-note-body">{savedNote}</div>
            </div>

            {gardenNote && (
              <div className="garden-note-block garden-note-block--garden">
                <div className="garden-note-label">Garden note · {gardenNote.category}</div>
                <div className="garden-note-body">{gardenNote.body}</div>
              </div>
            )}
          </div>

          <button className="btn btn-primary" style={{ width: 200 }} onClick={() => navigate('/')}>
            Back Home
          </button>
          <button className="btn btn-ghost" style={{ width: 200 }}
            onClick={() => { setPhase('pick'); setMessages([]); setInput(''); setGardenNote(null) }}>
            New chat
          </button>
        </div>
      </div>
    )
  }

  // ── Chat ─────────────────────────────────────────────────────────────────────

  return (
    <div className="page chat-page">
      <div className="page-header">
        <button className="back-btn" onClick={() => setPhase('pick')}>← Plants</button>
        <h1 style={{ flex: 1 }}>{selectedPlant?.label} · {selectedPlant?.shortName}</h1>
        <button
          className="btn btn-secondary"
          style={{ minHeight: 36, fontSize: 14, padding: '0 12px' }}
          disabled={sending}
          onClick={finish}
        >
          Finish
        </button>
      </div>

      {errorMsg && <div className="error-banner" style={{ margin: '8px 16px 0' }}>{errorMsg}</div>}

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            <p>What's going on with {selectedPlant?.name}?</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`chat-bubble chat-bubble-${m.role}`}>
            {m.photoUrl
              ? <img src={m.photoUrl} alt="plant photo" className="chat-photo-thumb" />
              : m.content
            }
          </div>
        ))}
        {sending && (
          <div className="chat-bubble chat-bubble-assistant chat-typing">
            <span /><span /><span />
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input-row">
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={handlePhoto}
        />
        <button
          className="chat-camera-btn"
          disabled={sending}
          onClick={() => cameraRef.current?.click()}
        >
          📷
        </button>
        <textarea
          className="chat-input"
          placeholder="What did you notice?"
          value={input}
          rows={1}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={sending}
        />
        <button
          className="chat-send-btn"
          disabled={!input.trim() || sending}
          onClick={send}
        >
          ↑
        </button>
      </div>
    </div>
  )
}
