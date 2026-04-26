import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PLANTS } from '../plants'
import { uploadPhoto } from '../api'

type Status = 'idle' | 'preview' | 'uploading' | 'done' | 'error'

export default function HeroSetup() {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)

  const [idx,       setIdx]       = useState(0)
  const [file,      setFile]      = useState<File | null>(null)
  const [preview,   setPreview]   = useState<string | null>(null)
  const [status,    setStatus]    = useState<Status>('idle')
  const [errorMsg,  setErrorMsg]  = useState<string | null>(null)
  const [doneCount, setDoneCount] = useState(0)

  const plant = PLANTS[idx]
  const isLast = idx === PLANTS.length - 1

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    if (!f) return
    setFile(f)
    setPreview(URL.createObjectURL(f))
    setStatus('preview')
    setErrorMsg(null)
  }

  function clearFile() {
    setFile(null)
    setPreview(null)
    setStatus('idle')
    if (fileRef.current) fileRef.current.value = ''
  }

  async function uploadHero() {
    if (!file) return
    setStatus('uploading')
    try {
      await uploadPhoto(plant.id, file, '', 'hero')
      setDoneCount(c => c + 1)
      advance()
    } catch (e) {
      setStatus('error')
      setErrorMsg(e instanceof Error ? e.message : 'Upload failed')
    }
  }

  function advance() {
    clearFile()
    if (idx < PLANTS.length - 1) {
      setIdx(i => i + 1)
      setStatus('idle')
    } else {
      setStatus('done')
    }
  }

  // ── Done ──────────────────────────────────────────────────────────────────

  if (status === 'done' || (idx === PLANTS.length - 1 && doneCount > 0 && status === 'idle')) {
    return (
      <div className="page">
        <div className="status-screen">
          <div className="status-icon">✅</div>
          <h2>Hero shots set!</h2>
          <p>{doneCount} hero photo{doneCount !== 1 ? 's' : ''} uploaded</p>
          <button className="btn btn-primary" style={{ width: 200 }} onClick={() => navigate('/')}>
            Back Home
          </button>
        </div>
      </div>
    )
  }

  const pct = Math.round((idx / PLANTS.length) * 100)

  return (
    <div className="page">
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate('/')}>← Home</button>
        <h1>Hero Setup</h1>
        <div className="progress-badge">{idx + 1} / {PLANTS.length}</div>
      </div>
      <div className="progress-bar">
        <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
      </div>

      <div className="page-body">
        <div className="plant-header">
          <div className="plant-label">{plant.label}</div>
          <div className="plant-name">{plant.name}</div>
        </div>

        {preview ? (
          <div style={{ textAlign: 'center' }}>
            <img
              src={preview}
              alt="preview"
              style={{ maxWidth: '100%', maxHeight: 280, borderRadius: 8, objectFit: 'contain' }}
            />
          </div>
        ) : (
          <div className="card" style={{ textAlign: 'center', padding: '2rem 1rem' }}>
            <p style={{ color: 'var(--text-dim)', marginBottom: '1rem' }}>
              Best shot of this plant — vendor photo or a clear setup photo
            </p>
            <button className="btn btn-primary" onClick={() => fileRef.current?.click()}>
              Choose Photo
            </button>
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={pickFile}
        />

        {errorMsg && <div className="error-banner">{errorMsg}</div>}

        <div className="row">
          {status === 'preview' && (
            <button className="btn btn-ghost" onClick={clearFile}>Retake</button>
          )}
          <button className="btn btn-ghost" onClick={advance}>
            Skip →
          </button>
          {status === 'preview' && (
            <button className="btn btn-primary" style={{ flex: 2 }} onClick={uploadHero}>
              {isLast ? 'Upload & Finish' : 'Upload & Next →'}
            </button>
          )}
          {status === 'uploading' && (
            <button className="btn btn-primary" disabled style={{ flex: 2 }}>Uploading…</button>
          )}
        </div>
      </div>
    </div>
  )
}
