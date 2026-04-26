import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { PLANTS } from '../plants'
import { addNote } from '../api'

const MOISTURE_VALS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
const PH_VALS       = [4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 8.5]

function moistureClass(v: number) {
  if (v <= 3) return 'm-low'
  if (v <= 6) return 'm-mid'
  return 'm-high'
}

function phClass(v: number) {
  if (v <= 5.5) return 'ph-acid'
  if (v <= 7.0) return 'ph-neutral'
  return 'ph-alkaline'
}

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

type DotStatus = 'pending' | 'loading' | 'done' | 'error'
type Phase = 'entry' | 'summary' | 'logging' | 'done'

interface Entry {
  moisture: number | null
  ph: number | null
  skipped: boolean
}

export default function SensorRound() {
  const navigate = useNavigate()

  const [phase,      setPhase]      = useState<Phase>('entry')
  const [currentIdx, setCurrentIdx] = useState(0)
  const [entries,    setEntries]    = useState<Entry[]>(
    PLANTS.map(() => ({ moisture: null, ph: null, skipped: false })),
  )
  const [dotStatuses, setDotStatuses] = useState<DotStatus[]>(PLANTS.map(() => 'pending'))
  const [errorMsg,    setErrorMsg]    = useState<string | null>(null)

  const entry   = entries[currentIdx]
  const plant   = PLANTS[currentIdx]
  const readyCount = entries.filter(e => !e.skipped && e.moisture !== null && e.ph !== null).length

  // Auto-advance 350ms after both moisture + pH are selected
  const curMoisture = entry?.moisture ?? null
  const curPh       = entry?.ph       ?? null

  useEffect(() => {
    if (phase !== 'entry') return
    if (curMoisture === null || curPh === null) return

    const timer = setTimeout(() => {
      if (currentIdx < PLANTS.length - 1) {
        setCurrentIdx(currentIdx + 1)
      } else {
        setPhase('summary')
      }
    }, 350)

    return () => clearTimeout(timer)
  }, [curMoisture, curPh, currentIdx, phase])

  function setMoisture(v: number) {
    setEntries(es => es.map((e, i) => i === currentIdx ? { ...e, moisture: v } : e))
  }

  function setPh(v: number) {
    setEntries(es => es.map((e, i) => i === currentIdx ? { ...e, ph: v } : e))
  }

  function skipCurrent() {
    setEntries(es => es.map((e, i) =>
      i === currentIdx ? { ...e, skipped: true, moisture: null, ph: null } : e,
    ))
    if (currentIdx < PLANTS.length - 1) {
      setCurrentIdx(currentIdx + 1)
    } else {
      setPhase('summary')
    }
  }

  function goBack() {
    if (currentIdx > 0) setCurrentIdx(currentIdx - 1)
  }

  async function logAll() {
    setPhase('logging')
    setErrorMsg(null)
    const date = todayStr()
    let failCount = 0

    for (let i = 0; i < PLANTS.length; i++) {
      const e = entries[i]
      if (e.skipped || e.moisture === null || e.ph === null) continue

      setDotStatuses(ss => ss.map((s, j) => j === i ? 'loading' : s))
      try {
        await addNote(
          PLANTS[i].id,
          `[${date}] Sensor: Moisture ${e.moisture}/10, pH ${e.ph}`,
        )
        setDotStatuses(ss => ss.map((s, j) => j === i ? 'done' : s))
      } catch {
        setDotStatuses(ss => ss.map((s, j) => j === i ? 'error' : s))
        failCount++
      }
    }

    if (failCount === 0) {
      setPhase('done')
    } else {
      setErrorMsg(
        `${failCount} plant${failCount > 1 ? 's' : ''} failed. Check connection and try again.`,
      )
    }
  }

  // ── Done ─────────────────────────────────────────────────────────────────────

  if (phase === 'done') {
    return (
      <div className="page">
        <div className="status-screen">
          <div className="status-icon">✅</div>
          <h2>All logged!</h2>
          <p>{readyCount} sensor reading{readyCount !== 1 ? 's' : ''} saved</p>
          <button className="btn btn-primary" style={{ width: 200 }} onClick={() => navigate('/')}>
            Back Home
          </button>
        </div>
      </div>
    )
  }

  // ── Logging progress ─────────────────────────────────────────────────────────

  if (phase === 'logging') {
    return (
      <div className="page">
        <div className="page-header">
          <h1>{errorMsg ? 'Error' : 'Logging…'}</h1>
        </div>
        <div className="page-body">
          {PLANTS.map((p, i) => {
            const e = entries[i]
            if (e.skipped || e.moisture === null) return null
            return (
              <div className="log-progress-item" key={p.id}>
                <div className={`status-dot ${dotStatuses[i]}`}>
                  {dotStatuses[i] === 'done'  ? '✓' : ''}
                  {dotStatuses[i] === 'error' ? '✗' : ''}
                </div>
                <div className="log-plant-id">{p.label}</div>
                <div className="log-plant-val">
                  Moisture {e.moisture}/10 · pH {e.ph}
                </div>
              </div>
            )
          })}

          {errorMsg && (
            <>
              <div className="error-banner">{errorMsg}</div>
              <button className="btn btn-ghost btn-full" onClick={() => navigate('/')}>
                Go Home
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  // ── Summary ──────────────────────────────────────────────────────────────────

  if (phase === 'summary') {
    return (
      <div className="page">
        <div className="page-header">
          <button className="back-btn" onClick={() => { setCurrentIdx(PLANTS.length - 1); setPhase('entry') }}>
            ← Edit
          </button>
          <h1>Review</h1>
        </div>
        <div className="page-body">
          <table className="summary-table">
            <tbody>
              {PLANTS.map((p, i) => {
                const e = entries[i]
                return (
                  <tr key={p.id} className={e.skipped ? 'skipped' : ''}>
                    <td>{p.label}</td>
                    <td>{e.skipped ? '—' : `${e.moisture}/10`}</td>
                    <td>{e.skipped ? '—' : `pH ${e.ph}`}</td>
                    <td>{e.skipped ? 'skip' : '✓'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <div className="row">
            <button
              className="btn btn-secondary"
              onClick={() => { setCurrentIdx(PLANTS.length - 1); setPhase('entry') }}
            >
              Edit
            </button>
            <button
              className="btn btn-primary"
              style={{ flex: 2 }}
              disabled={readyCount === 0}
              onClick={logAll}
            >
              Log {readyCount} reading{readyCount !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Entry ────────────────────────────────────────────────────────────────────

  const pct = Math.round((currentIdx / PLANTS.length) * 100)

  return (
    <div className="page">
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate('/')}>← Home</button>
        <h1>Sensor Round</h1>
        <div className="progress-badge">{currentIdx + 1} / {PLANTS.length}</div>
      </div>
      <div className="progress-bar">
        <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
      </div>

      <div className="page-body">
        <div className="plant-header">
          <div className="plant-label">{plant.label}</div>
          <div className="plant-name">{plant.name}</div>
        </div>

        <div className="card">
          <div className="card-label">Moisture</div>
          <div className="tile-grid tile-grid-5">
            {MOISTURE_VALS.map(v => (
              <button
                key={v}
                className={`tile ${moistureClass(v)}${entry.moisture === v ? ' selected' : ''}`}
                onClick={() => setMoisture(v)}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-label">pH</div>
          <div className="tile-grid tile-grid-5">
            {PH_VALS.map(v => (
              <button
                key={v}
                className={`tile ${phClass(v)}${entry.ph === v ? ' selected' : ''}`}
                onClick={() => setPh(v)}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        <div className="row">
          {currentIdx > 0 && (
            <button className="btn btn-ghost" onClick={goBack}>← Prev</button>
          )}
          <button className="btn btn-ghost" onClick={skipCurrent}>Skip</button>
          {currentIdx < PLANTS.length - 1 && entry.moisture !== null && entry.ph !== null && (
            <button className="btn btn-secondary" onClick={() => setCurrentIdx(currentIdx + 1)}>
              Next →
            </button>
          )}
          {currentIdx === PLANTS.length - 1 && (
            <button className="btn btn-primary" onClick={() => setPhase('summary')}>
              Review →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
