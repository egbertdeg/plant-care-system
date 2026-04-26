import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ACTIVE_PLANTS } from '../plants'
import { logWatering } from '../api'

type TimeOfDay = 'AM' | 'PM' | 'Evening'
type DotStatus = 'pending' | 'loading' | 'done' | 'error'

const TIME_OPTIONS: { value: TimeOfDay; icon: string; label: string }[] = [
  { value: 'AM',      icon: '🌅', label: 'AM'      },
  { value: 'PM',      icon: '☀️',  label: 'PM'      },
  { value: 'Evening', icon: '🌙', label: 'Evening' },
]

const VOLUME_OPTIONS: { label: string; value: number | null }[] = [
  { label: 'Skip',  value: null  },
  { label: '250ml', value: 250   },
  { label: '500ml', value: 500   },
  { label: '750ml', value: 750   },
  { label: '1 L',   value: 1000  },
  { label: '2 L',   value: 2000  },
]

const NOTE_OPTIONS = [
  { label: '—',              value: ''               },
  { label: '+ fertiliser',  value: 'with fertiliser' },
  { label: '+ fungicide',   value: 'with fungicide'  },
  { label: '+ neem oil',    value: 'with neem oil'   },
]

export default function WaterLog() {
  const navigate = useNavigate()

  const [selected,  setSelected]  = useState<Set<number>>(new Set())
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay | null>(null)
  const [volumeMl,  setVolumeMl]  = useState<number | null | undefined>(undefined) // undefined = not chosen
  const [extraNote, setExtraNote] = useState('')
  const [phase,     setPhase]     = useState<'form' | 'logging' | 'done'>('form')
  const [dots,      setDots]      = useState<DotStatus[]>(ACTIVE_PLANTS.map(() => 'pending'))
  const [errorMsg,  setErrorMsg]  = useState<string | null>(null)

  function togglePlant(id: number) {
    setSelected(s => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(ACTIVE_PLANTS.map(p => p.id)))
  }

  const canLog = selected.size > 0 && timeOfDay !== null && volumeMl !== undefined

  async function doLog() {
    if (!timeOfDay) return
    setPhase('logging')
    setErrorMsg(null)

    const notes = [
      `Watered ${timeOfDay}`,
      extraNote || null,
    ].filter(Boolean).join(', ')

    const vol = volumeMl ?? null
    let failCount = 0

    for (let i = 0; i < ACTIVE_PLANTS.length; i++) {
      const p = ACTIVE_PLANTS[i]
      if (!selected.has(p.id)) continue

      setDots(ds => ds.map((d, j) => j === i ? 'loading' : d))
      try {
        await logWatering(p.id, vol, notes)
        setDots(ds => ds.map((d, j) => j === i ? 'done' : d))
      } catch {
        setDots(ds => ds.map((d, j) => j === i ? 'error' : d))
        failCount++
      }
    }

    if (failCount === 0) {
      setPhase('done')
    } else {
      setErrorMsg(`${failCount} watering${failCount > 1 ? 's' : ''} failed to log.`)
    }
  }

  // ── Done ─────────────────────────────────────────────────────────────────────

  if (phase === 'done') {
    return (
      <div className="page">
        <div className="status-screen">
          <div className="status-icon">💧</div>
          <h2>Watering logged!</h2>
          <p>{selected.size} plant{selected.size !== 1 ? 's' : ''} recorded</p>
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
          {ACTIVE_PLANTS.map((p, i) => {
            if (!selected.has(p.id)) return null
            return (
              <div className="log-progress-item" key={p.id}>
                <div className={`status-dot ${dots[i]}`}>
                  {dots[i] === 'done'  ? '✓' : ''}
                  {dots[i] === 'error' ? '✗' : ''}
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

  // ── Form ─────────────────────────────────────────────────────────────────────

  return (
    <div className="page">
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate('/')}>← Home</button>
        <h1>Log Watering</h1>
      </div>

      <div className="page-body">
        {/* Plant selector */}
        <div>
          <div className="section-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Plants</span>
            {selected.size > 0
              ? <button className="back-btn" style={{ fontSize: 13 }} onClick={() => setSelected(new Set())}>Clear</button>
              : <button className="back-btn" style={{ fontSize: 13 }} onClick={selectAll}>All</button>
            }
          </div>
          <div className="plant-grid">
            {ACTIVE_PLANTS.map(p => (
              <button
                key={p.id}
                className={`plant-tile${selected.has(p.id) ? ' selected' : ''}`}
                onClick={() => togglePlant(p.id)}
              >
                <span className="pt-label">{p.label}</span>
                <span className="pt-name">{p.shortName}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Time of day */}
        <div>
          <div className="section-label">Time of day</div>
          <div className="time-grid">
            {TIME_OPTIONS.map(t => (
              <button
                key={t.value}
                className={`time-tile${timeOfDay === t.value ? ' selected' : ''}`}
                onClick={() => setTimeOfDay(t.value)}
              >
                <span className="t-icon">{t.icon}</span>
                <span className="t-label">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Volume */}
        <div>
          <div className="section-label">Volume</div>
          <div className="vol-grid">
            {VOLUME_OPTIONS.map(opt => (
              <button
                key={String(opt.value)}
                className={`tile${volumeMl === opt.value && volumeMl !== undefined ? ' selected' : ''}`}
                onClick={() => setVolumeMl(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div>
          <div className="section-label">Notes</div>
          <div className="notes-grid">
            {NOTE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                className={`tile${extraNote === opt.value ? ' selected' : ''}`}
                onClick={() => setExtraNote(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <button
          className="btn btn-primary btn-full btn-lg"
          disabled={!canLog}
          onClick={doLog}
        >
          💧 Log {selected.size > 0 ? selected.size : ''} watering{selected.size !== 1 ? 's' : ''}
        </button>
      </div>
    </div>
  )
}
