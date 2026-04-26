import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { PLANTS } from '../plants'
import { addNote, uploadPhoto } from '../api'

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

type Phase = 'form' | 'submitting' | 'done'

interface Slot {
  file: File
  url: string
}

export default function PlantNote() {
  const navigate  = useNavigate()
  const inputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ]

  const [plantId,  setPlantId]  = useState<number | null>(null)
  const [comment,  setComment]  = useState('')
  const [slots,    setSlots]    = useState<(Slot | null)[]>([null, null, null])
  const [phase,    setPhase]    = useState<Phase>('form')
  const [progress, setProgress] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const selectedPlant = PLANTS.find(p => p.id === plantId) ?? null
  const photoCount    = slots.filter(Boolean).length
  const canSubmit     = plantId !== null && comment.trim().length > 0

  function handleCapture(slotIdx: number, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setSlots(s => s.map((v, i) => i === slotIdx ? { file, url } : v))
    e.target.value = ''
  }

  function removeSlot(slotIdx: number) {
    setSlots(s => s.map((v, i) => i === slotIdx ? null : v))
  }

  async function submit() {
    if (!plantId || !comment.trim()) return
    setPhase('submitting')
    setErrorMsg(null)

    const date  = todayStr()
    const plant = PLANTS.find(p => p.id === plantId)!

    try {
      setProgress('Saving note…')
      await addNote(plantId, `[${date}] General: ${comment.trim()}`)

      const photos = slots.filter((s): s is Slot => s !== null)
      for (let i = 0; i < photos.length; i++) {
        setProgress(`Uploading photo ${i + 1} of ${photos.length}…`)
        await uploadPhoto(
          plantId,
          photos[i].file,
          `${plant.label} - ${date} - note`,
        )
      }

      setPhase('done')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save')
      setPhase('form')
    }
  }

  // ── Done ─────────────────────────────────────────────────────────────────────

  if (phase === 'done') {
    return (
      <div className="page">
        <div className="status-screen">
          <div className="status-icon">📝</div>
          <h2>Note saved!</h2>
          <p>
            {selectedPlant?.label} — {comment.trim().slice(0, 60)}{comment.length > 60 ? '…' : ''}
          </p>
          <button className="btn btn-primary" style={{ width: 200 }} onClick={() => navigate('/')}>
            Back Home
          </button>
          <button className="btn btn-ghost" style={{ width: 200 }}
            onClick={() => {
              setComment('')
              setSlots([null, null, null])
              setPhase('form')
            }}>
            Add another
          </button>
        </div>
      </div>
    )
  }

  // ── Submitting ────────────────────────────────────────────────────────────────

  if (phase === 'submitting') {
    return (
      <div className="page">
        <div className="status-screen">
          <div className="status-icon" style={{ fontSize: 48, animation: 'pulse 1s infinite' }}>⏳</div>
          <h2>{progress}</h2>
        </div>
      </div>
    )
  }

  // ── Form ─────────────────────────────────────────────────────────────────────

  return (
    <div className="page">
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate('/')}>← Home</button>
        <h1>Plant Note</h1>
      </div>

      <div className="page-body">
        {errorMsg && <div className="error-banner">{errorMsg}</div>}

        {/* Plant picker */}
        <div>
          <div className="section-label">Plant</div>
          <div className="plant-grid">
            {PLANTS.map(p => (
              <button
                key={p.id}
                className={`plant-tile${plantId === p.id ? ' selected' : ''}`}
                onClick={() => setPlantId(p.id)}
              >
                <span className="pt-label">{p.label}</span>
                <span className="pt-name">{p.shortName}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Comment */}
        <div>
          <div className="section-label">Observation</div>
          <textarea
            className="note-textarea"
            placeholder="What did you notice?"
            value={comment}
            onChange={e => setComment(e.target.value)}
            rows={4}
          />
        </div>

        {/* Photo slots */}
        <div>
          <div className="section-label">Photos (optional — up to 3)</div>
          <div className="photo-slots">
            {slots.map((slot, i) => (
              <div key={i} className="photo-slot">
                <input
                  ref={inputRefs[i]}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: 'none' }}
                  onChange={e => handleCapture(i, e)}
                />
                {slot ? (
                  <div className="photo-slot-filled" onClick={() => removeSlot(i)}>
                    <img src={slot.url} alt={`photo ${i + 1}`} />
                    <div className="slot-remove">✕</div>
                  </div>
                ) : (
                  <button
                    className="photo-slot-empty"
                    onClick={() => inputRefs[i].current?.click()}
                  >
                    <span style={{ fontSize: 28 }}>📷</span>
                    <span style={{ fontSize: 12 }}>Add</span>
                  </button>
                )}
              </div>
            ))}
          </div>
          {photoCount > 0 && (
            <p style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 6 }}>
              Tap a photo to remove it.
            </p>
          )}
        </div>

        <button
          className="btn btn-primary btn-full btn-lg"
          disabled={!canSubmit}
          onClick={submit}
        >
          Save note{photoCount > 0 ? ` + ${photoCount} photo${photoCount > 1 ? 's' : ''}` : ''}
        </button>
      </div>
    </div>
  )
}
