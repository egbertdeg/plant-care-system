import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import exifr from 'exifr'
import { PLANTS } from '../plants'
import { uploadPhoto } from '../api'

interface FileEntry {
  file: File
  exifDate: string | null   // ISO string if parsed, null if not found
  status: 'pending' | 'uploading' | 'done' | 'error'
  error?: string
}

function exifDateToISO(d: Date | undefined): string | null {
  if (!d || isNaN(d.getTime())) return null
  // Format as SQLite datetime: "YYYY-MM-DD HH:MM:SS"
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export default function BulkImport() {
  const navigate = useNavigate()
  const fileRef  = useRef<HTMLInputElement>(null)

  const [plantId,   setPlantId]   = useState<number>(PLANTS[0].id)
  const [entries,   setEntries]   = useState<FileEntry[]>([])
  const [phase,     setPhase]     = useState<'pick' | 'review' | 'uploading' | 'done'>('pick')
  const [doneCount, setDoneCount] = useState(0)

  async function onFilesChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return

    const parsed: FileEntry[] = await Promise.all(
      files.map(async file => {
        try {
          const exif = await exifr.parse(file, ['DateTimeOriginal'])
          return { file, exifDate: exifDateToISO(exif?.DateTimeOriginal), status: 'pending' as const }
        } catch {
          return { file, exifDate: null, status: 'pending' as const }
        }
      })
    )
    setEntries(parsed)
    setPhase('review')
  }

  async function uploadAll() {
    setPhase('uploading')
    let count = 0

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]
      setEntries(es => es.map((x, j) => j === i ? { ...x, status: 'uploading' } : x))
      try {
        await uploadPhoto(plantId, e.file, '', 'history', e.exifDate ?? undefined)
        setEntries(es => es.map((x, j) => j === i ? { ...x, status: 'done' } : x))
        count++
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'failed'
        setEntries(es => es.map((x, j) => j === i ? { ...x, status: 'error', error: msg } : x))
      }
    }

    setDoneCount(count)
    setPhase('done')
  }

  function reset() {
    setEntries([])
    setPhase('pick')
    setDoneCount(0)
    if (fileRef.current) fileRef.current.value = ''
  }

  const plant = PLANTS.find(p => p.id === plantId) ?? PLANTS[0]

  // ── Done ──────────────────────────────────────────────────────────────────

  if (phase === 'done') {
    const errCount = entries.filter(e => e.status === 'error').length
    return (
      <div className="page">
        <div className="status-screen">
          <div className="status-icon">{errCount === 0 ? '✅' : '⚠️'}</div>
          <h2>{errCount === 0 ? 'Import done!' : 'Done with errors'}</h2>
          <p>{doneCount} photo{doneCount !== 1 ? 's' : ''} uploaded{errCount > 0 ? `, ${errCount} failed` : ''}</p>
          <div className="row" style={{ justifyContent: 'center', gap: 12 }}>
            <button className="btn btn-ghost" onClick={reset}>Import More</button>
            <button className="btn btn-primary" onClick={() => navigate('/')}>Home</button>
          </div>
        </div>
      </div>
    )
  }

  // ── Review / Uploading ─────────────────────────────────────────────────────

  if (phase === 'review' || phase === 'uploading') {
    return (
      <div className="page">
        <div className="page-header">
          <button className="back-btn" onClick={reset} disabled={phase === 'uploading'}>← Back</button>
          <h1>{phase === 'uploading' ? 'Uploading…' : 'Review'}</h1>
        </div>
        <div className="page-body">
          <div style={{ marginBottom: '0.75rem', color: 'var(--text-dim)', fontSize: '0.9rem' }}>
            {plant.label} — {plant.name} · {entries.length} photo{entries.length !== 1 ? 's' : ''}
          </div>

          {entries.map((e, i) => (
            <div key={i} className="log-progress-item">
              <div className={`status-dot ${e.status === 'done' ? 'done' : e.status === 'error' ? 'error' : e.status === 'uploading' ? 'loading' : 'pending'}`}>
                {e.status === 'done'  ? '✓' : ''}
                {e.status === 'error' ? '✗' : ''}
              </div>
              <div className="log-plant-id" style={{ fontSize: '0.8rem', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {e.file.name}
              </div>
              <div className="log-plant-val" style={{ fontSize: '0.8rem', color: e.exifDate ? 'inherit' : 'var(--text-dim)' }}>
                {e.exifDate ?? 'no EXIF date'}
              </div>
            </div>
          ))}

          {phase === 'review' && (
            <div className="row" style={{ marginTop: '1rem' }}>
              <button className="btn btn-ghost" onClick={reset}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 2 }} onClick={uploadAll}>
                Upload {entries.length} photo{entries.length !== 1 ? 's' : ''}
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Pick ───────────────────────────────────────────────────────────────────

  return (
    <div className="page">
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate('/')}>← Home</button>
        <h1>History Import</h1>
      </div>
      <div className="page-body">
        <div className="card">
          <div className="card-label">Plant</div>
          <select
            value={plantId}
            onChange={e => setPlantId(Number(e.target.value))}
            style={{
              width: '100%',
              padding: '0.75rem',
              fontSize: '1.1rem',
              background: 'var(--surface)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: 8,
            }}
          >
            {PLANTS.map(p => (
              <option key={p.id} value={p.id}>{p.label} — {p.name}</option>
            ))}
          </select>
        </div>

        <div className="card" style={{ textAlign: 'center', padding: '2rem 1rem' }}>
          <p style={{ color: 'var(--text-dim)', marginBottom: '1rem' }}>
            Select photos from your camera roll. EXIF timestamps will be used as the photo date.
          </p>
          <button className="btn btn-primary" onClick={() => fileRef.current?.click()}>
            Choose Photos
          </button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={onFilesChosen}
        />
      </div>
    </div>
  )
}
