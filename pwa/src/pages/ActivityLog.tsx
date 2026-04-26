import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ACTIVE_PLANTS } from '../plants'
import { logCareEvent, getThirstyPlants } from '../api'

type DotStatus = 'pending' | 'loading' | 'done' | 'error'

// undefined = nothing chosen yet (blocks submit); null = No Water chosen
type WateringChoice = number | null | undefined

const VOLUME_OPTIONS: { label: string; value: number | null }[] = [
  { label: '250ml',    value: 250  },
  { label: '500ml',    value: 500  },
  { label: '750ml',    value: 750  },
  { label: '1 L',      value: 1000 },
  { label: 'Soaked',   value: 2000 },
  { label: 'No Water', value: null },
]

const ACTIVITY_OPTIONS: { label: string; key: 'liquid' | 'rose-tone' | 'pruned' }[] = [
  { label: 'Liquid Feed', key: 'liquid'     },
  { label: 'Rose-Tone',   key: 'rose-tone'  },
  { label: 'Pruning',     key: 'pruned'     },
]

export default function ActivityLog() {
  const navigate = useNavigate()

  const [selected,    setSelected]    = useState<Set<number>>(new Set())
  const [watering,    setWatering]    = useState<WateringChoice>(undefined)
  const [activities,  setActivities]  = useState<Set<string>>(new Set())
  const [notes,       setNotes]       = useState('')
  const [phase,       setPhase]       = useState<'form' | 'logging' | 'done'>('form')
  const [dots,        setDots]        = useState<DotStatus[]>(ACTIVE_PLANTS.map(() => 'pending'))
  const [errorMsg,    setErrorMsg]    = useState<string | null>(null)
  const [thirstyIds,  setThirstyIds]  = useState<Set<number>>(new Set())

  useEffect(() => {
    getThirstyPlants().then(ids => setThirstyIds(new Set(ids))).catch(() => {})
  }, [])

  function togglePlant(id: number) {
    setSelected(s => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleActivity(key: string) {
    setActivities(s => {
      const next = new Set(s)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const canLog = selected.size > 0 && watering !== undefined

  async function doLog() {
    setPhase('logging')
    setErrorMsg(null)

    const event = {
      watered:    watering !== null,
      volume_ml:  watering ?? null,
      fertilizer: activities.has('liquid')    ? 'liquid'    as const
                : activities.has('rose-tone') ? 'rose-tone' as const
                : null,
      pruned: activities.has('pruned'),
      notes:  notes.trim() || null,
    }

    let failCount = 0

    for (let i = 0; i < ACTIVE_PLANTS.length; i++) {
      const p = ACTIVE_PLANTS[i]
      if (!selected.has(p.id)) continue

      setDots(ds => ds.map((d, j) => j === i ? 'loading' : d))
      try {
        await logCareEvent(p.id, event)
        setDots(ds => ds.map((d, j) => j === i ? 'done' : d))
      } catch {
        setDots(ds => ds.map((d, j) => j === i ? 'error' : d))
        failCount++
      }
    }

    if (failCount === 0) {
      setPhase('done')
    } else {
      setErrorMsg(`${failCount} event${failCount > 1 ? 's' : ''} failed to log.`)
    }
  }

  function logLabel() {
    const parts: string[] = []
    if (watering !== null && watering !== undefined) parts.push('water')
    if (activities.has('liquid'))    parts.push('liquid feed')
    if (activities.has('rose-tone')) parts.push('Rose-Tone')
    if (activities.has('pruned'))    parts.push('pruning')
    if (parts.length === 0)          parts.push('no water')
    return parts.join(' + ')
  }

  // ── Done ─────────────────────────────────────────────────────────────────────

  if (phase === 'done') {
    return (
      <div className="page">
        <div className="status-screen">
          <div className="status-icon">✅</div>
          <h2>Activity logged!</h2>
          <p>{selected.size} plant{selected.size !== 1 ? 's' : ''} recorded</p>
          <button className="btn btn-primary" style={{ width: 200 }} onClick={() => navigate('/')}>
            Back Home
          </button>
          <button className="btn btn-ghost" style={{ width: 200 }}
            onClick={() => {
              setSelected(new Set()); setWatering(undefined)
              setActivities(new Set()); setNotes(''); setPhase('form')
              setDots(ACTIVE_PLANTS.map(() => 'pending'))
            }}>
            Log another
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
        <h1>Log Activity</h1>
      </div>

      <div className="page-body">

        {/* Plant selector */}
        <div>
          <div className="section-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Plants</span>
            {selected.size > 0
              ? <button className="back-btn" style={{ fontSize: 13 }} onClick={() => setSelected(new Set())}>Clear</button>
              : <button className="back-btn" style={{ fontSize: 13 }} onClick={() => setSelected(new Set(ACTIVE_PLANTS.map(p => p.id)))}>All</button>
            }
          </div>
          <div className="plant-grid">
            {ACTIVE_PLANTS.map(p => {
              const thirsty = thirstyIds.has(p.id) && !selected.has(p.id)
              return (
                <button
                  key={p.id}
                  className={`plant-tile${selected.has(p.id) ? ' selected' : thirsty ? ' thirsty' : ''}`}
                  onClick={() => togglePlant(p.id)}
                >
                  <span className="pt-label">{p.label}</span>
                  <span className="pt-name">{p.shortName}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Watering — required */}
        <div>
          <div className="section-label">
            Watering <span style={{ color: 'var(--text-dimmer)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— required</span>
          </div>
          <div className="vol-grid">
            {VOLUME_OPTIONS.map(opt => {
              const isNoWater  = opt.value === null
              const isSelected = watering !== undefined && watering === opt.value
              return (
                <button
                  key={String(opt.value)}
                  className={`tile${isSelected ? (isNoWater ? ' no-water-selected' : ' selected') : ''}`}
                  onClick={() => setWatering(opt.value)}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Activities — optional */}
        <div>
          <div className="section-label">Activities</div>
          <div className="tile-grid tile-grid-3">
            {ACTIVITY_OPTIONS.map(opt => (
              <button
                key={opt.key}
                className={`tile${activities.has(opt.key) ? ' selected' : ''}`}
                onClick={() => toggleActivity(opt.key)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div>
          <div className="section-label">Notes / other</div>
          <textarea
            className="note-textarea"
            placeholder="Anything else — sprayed neem oil, noticed black spot, etc."
            value={notes}
            rows={3}
            onChange={e => setNotes(e.target.value)}
          />
        </div>

        <button
          className="btn btn-primary btn-full btn-lg"
          disabled={!canLog}
          onClick={doLog}
        >
          Log {selected.size > 0 ? `${selected.size} × ` : ''}{logLabel()}
        </button>
      </div>
    </div>
  )
}
