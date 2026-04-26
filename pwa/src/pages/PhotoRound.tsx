import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ACTIVE_PLANTS, PlantDef } from '../plants'
import { uploadPhoto } from '../api'

type DotStatus = 'pending' | 'loading' | 'done' | 'error'
type Phase = 'entry' | 'review' | 'uploading' | 'done'

interface CapturedPhoto {
  file: File
  url: string
}

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

export default function PhotoRound() {
  const navigate  = useNavigate()
  const inputRef  = useRef<HTMLInputElement>(null)

  const [phase,      setPhase]      = useState<Phase>('entry')
  const [currentIdx, setCurrentIdx] = useState(0)
  const [photos,     setPhotos]     = useState<Map<number, CapturedPhoto>>(new Map())
  const [dotMap,     setDotMap]     = useState<Map<number, DotStatus>>(new Map())
  const [errorMsg,   setErrorMsg]   = useState<string | null>(null)

  const plant: PlantDef = ACTIVE_PLANTS[currentIdx]
  const photoCount = photos.size

  function handleCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setPhotos(m => new Map(m).set(plant.id, { file, url }))
    // Clear input so same plant can retake
    e.target.value = ''
    // Auto-advance after a brief moment
    setTimeout(() => advance(), 400)
  }

  function advance() {
    if (currentIdx < ACTIVE_PLANTS.length - 1) {
      setCurrentIdx(i => i + 1)
    } else {
      setPhase('review')
    }
  }

  function skipCurrent() {
    advance()
  }

  async function uploadAll() {
    setPhase('uploading')
    setErrorMsg(null)
    const date = todayStr()
    let failCount = 0

    for (const p of ACTIVE_PLANTS) {
      const captured = photos.get(p.id)
      if (!captured) continue

      setDotMap(m => new Map(m).set(p.id, 'loading'))
      try {
        await uploadPhoto(p.id, captured.file, `${p.label} - ${date}`)
        setDotMap(m => new Map(m).set(p.id, 'done'))
      } catch {
        setDotMap(m => new Map(m).set(p.id, 'error'))
        failCount++
      }
    }

    if (failCount === 0) {
      setPhase('done')
    } else {
      setErrorMsg(`${failCount} upload${failCount > 1 ? 's' : ''} failed. Check connection.`)
    }
  }

  // ── Done ─────────────────────────────────────────────────────────────────────

  if (phase === 'done') {
    return (
      <div className="page">
        <div className="status-screen">
          <div className="status-icon">📸</div>
          <h2>Photos uploaded!</h2>
          <p>{photoCount} photo{photoCount !== 1 ? 's' : ''} saved</p>
          <button className="btn btn-primary" style={{ width: 200 }} onClick={() => navigate('/')}>
            Back Home
          </button>
        </div>
      </div>
    )
  }

  // ── Uploading progress ────────────────────────────────────────────────────────

  if (phase === 'uploading') {
    return (
      <div className="page">
        <div className="page-header">
          <h1>{errorMsg ? 'Error' : 'Uploading…'}</h1>
        </div>
        <div className="page-body">
          {ACTIVE_PLANTS.map(p => {
            if (!photos.has(p.id)) return null
            const status = dotMap.get(p.id) ?? 'pending'
            return (
              <div className="log-progress-item" key={p.id}>
                <div className={`status-dot ${status}`}>
                  {status === 'done'  ? '✓' : ''}
                  {status === 'error' ? '✗' : ''}
                </div>
                <div className="log-plant-id">{p.label}</div>
                <div className="log-plant-val">{p.shortName}</div>
              </div>
            )
          })}
          {errorMsg && (
            <>
              <div className="error-banner">{errorMsg}</div>
              <button className="btn btn-ghost btn-full" onClick={() => navigate('/')}>Go Home</button>
            </>
          )}
        </div>
      </div>
    )
  }

  // ── Review ───────────────────────────────────────────────────────────────────

  if (phase === 'review') {
    return (
      <div className="page">
        <div className="page-header">
          <button className="back-btn" onClick={() => { setCurrentIdx(ACTIVE_PLANTS.length - 1); setPhase('entry') }}>
            ← Edit
          </button>
          <h1>Review</h1>
          <div className="progress-badge">{photoCount} photo{photoCount !== 1 ? 's' : ''}</div>
        </div>
        <div className="page-body">
          <div className="photo-thumb-grid">
            {ACTIVE_PLANTS.map(p => {
              const cap = photos.get(p.id)
              return (
                <div key={p.id} className={`photo-thumb${cap ? '' : ' empty'}`}>
                  {cap ? (
                    <>
                      <img src={cap.url} alt={p.label} />
                      <div className="thumb-overlay">{p.label}</div>
                    </>
                  ) : (
                    <>
                      <span className="thumb-label">{p.label}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-dimmer)' }}>skip</span>
                    </>
                  )}
                </div>
              )
            })}
          </div>

          <div className="row">
            <button
              className="btn btn-secondary"
              onClick={() => { setCurrentIdx(ACTIVE_PLANTS.length - 1); setPhase('entry') }}
            >
              Retake
            </button>
            <button
              className="btn btn-primary"
              style={{ flex: 2 }}
              disabled={photoCount === 0}
              onClick={uploadAll}
            >
              Upload {photoCount}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Entry (per-plant capture) ─────────────────────────────────────────────────

  const captured    = photos.get(plant.id)
  const pct         = Math.round((currentIdx / ACTIVE_PLANTS.length) * 100)
  const isLastPlant = currentIdx === ACTIVE_PLANTS.length - 1

  return (
    <div className="page">
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate('/')}>← Home</button>
        <h1>Photos</h1>
        <div className="progress-badge">{currentIdx + 1} / {ACTIVE_PLANTS.length}</div>
      </div>
      <div className="progress-bar">
        <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
      </div>

      <div className="page-body">
        <div className="plant-header">
          <div className="plant-label">{plant.label}</div>
          <div className="plant-name">{plant.name}</div>
        </div>

        <div className="camera-area">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={handleCapture}
          />

          {captured ? (
            <div
              style={{
                width: 180, height: 180, borderRadius: '50%', overflow: 'hidden',
                border: '3px solid var(--green)', cursor: 'pointer', flexShrink: 0,
              }}
              onClick={() => inputRef.current?.click()}
            >
              <img src={captured.url} alt={plant.label}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </div>
          ) : (
            <button className="camera-btn" onClick={() => inputRef.current?.click()}>
              <span className="cam-icon">📷</span>
              <span>Take photo</span>
            </button>
          )}

          {captured && (
            <button className="btn btn-ghost" style={{ width: 140, minHeight: 40, fontSize: 14 }}
              onClick={() => inputRef.current?.click()}>
              Retake
            </button>
          )}
        </div>

        <div className="row">
          {currentIdx > 0 && (
            <button className="btn btn-ghost" onClick={() => setCurrentIdx(i => i - 1)}>← Prev</button>
          )}
          <button className="btn btn-ghost" onClick={skipCurrent}>Skip</button>
          {isLastPlant ? (
            <button className="btn btn-primary" onClick={() => setPhase('review')}>Review →</button>
          ) : (
            <button className="btn btn-secondary" onClick={advance}>Next →</button>
          )}
        </div>
      </div>
    </div>
  )
}
