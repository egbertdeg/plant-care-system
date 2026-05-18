import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getHomeData, HomeData } from '../api'

function statusColor(needs: boolean, reason: string | null, daysUntil: number | null) {
  if (needs && (reason === 'moisture' || reason === 'both')) return 'var(--blue)'
  if (needs) return 'var(--red)'
  if (daysUntil !== null && daysUntil <= 2) return 'var(--orange)'
  return null
}

function statusLabel(needs: boolean, reason: string | null, daysUntil: number | null, forecastDue: string | null) {
  if (needs && (reason === 'moisture' || reason === 'both')) return 'water now'
  if (needs) return 'check moisture'
  if (daysUntil !== null && daysUntil <= 2) return `${daysUntil}d`
  if (forecastDue) {
    const d = new Date(forecastDue + 'T12:00:00')
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
  return null
}

const WORKFLOWS = [
  { to: '/activity', icon: '🚿', title: 'Log Activity', desc: 'Water, fertilize, prune, spray' },
  { to: '/sensors', icon: '💧', title: 'Sensor Round', desc: 'Moisture & pH readings' },
  { to: '/photos', icon: '📷', title: 'Photo Round', desc: 'Rapid photo capture' },
  { to: '/note', icon: '💬', title: 'Plant Chat', desc: 'Discuss observations, plan care' },
  {
    to: '/around-town',
    icon: '📍',
    title: 'Around Town',
    desc: 'Spot & identify neighbourhood plants',
  },
]

export default function Home() {
  const navigate = useNavigate()
  const [data, setData] = useState<HomeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [apiError, setApiError] = useState(false)

  function load() {
    setLoading(true)
    setApiError(false)
    getHomeData()
      .then((d) => {
        setData(d)
        setLoading(false)
      })
      .catch(() => {
        setApiError(true)
        setLoading(false)
      })
  }

  useEffect(() => { load() }, [])

  const plants = data?.plants ?? []
  const overdueSchedules = data?.overdue_schedules ?? []
  const n = plants.length
  const attentionPlants = plants.filter(
    (p) => p.needs_water || (p.days_until_due !== null && p.days_until_due <= 2)
  )
  const confirmedDryCount = plants.filter(
    (p) => p.needs_water && (p.reason === 'moisture' || p.reason === 'both')
  ).length
  const checkMoistureCount = plants.filter(
    (p) => p.needs_water && p.reason === 'et0'
  ).length

  return (
    <div className="page">
      <div className="page-header">
        <h1>🌹 Plant Care</h1>
        {!loading && n > 0 && (
          <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>{n} plants</div>
        )}
      </div>

      <div className="page-body">
        {/* Overdue schedules banner */}
        {overdueSchedules.length > 0 && (
          <button
            className="workflow-btn"
            style={{
              borderColor: 'var(--orange)',
              background: 'var(--orange-dim)',
              textAlign: 'left',
            }}
            onClick={() => navigate('/schedules')}
          >
            <div className="wf-icon" style={{ fontSize: 22 }}>
              ⏰
            </div>
            <div>
              <h2 style={{ color: 'var(--orange)' }}>
                {overdueSchedules.length} treatment{overdueSchedules.length !== 1 ? 's' : ''}{' '}
                overdue
              </h2>
              <p>{overdueSchedules.map((s) => s.treatment).join(', ')}</p>
            </div>
          </button>
        )}

        {/* API error banner */}
        {apiError && (
          <button
            onClick={load}
            style={{ background: 'var(--red-dim, #fee)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--red)', marginBottom: 8, border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer' }}
          >
            Could not load plant status — tap to retry.
          </button>
        )}

        {/* Plant status grid */}
        {!loading && n === 0 && !apiError && (
          <Link to="/add-plant" className="workflow-btn" style={{ borderColor: 'var(--green)' }}>
            <div className="wf-icon">🌱</div>
            <div>
              <h2>Add Your First Plant</h2>
              <p>Get started by adding a plant to your garden</p>
            </div>
          </Link>
        )}

        {attentionPlants.length > 0 && (
          <div>
            {confirmedDryCount > 0 && (
              <div className="section-label" style={{ color: 'var(--blue)', marginBottom: 4 }}>
                {confirmedDryCount} plant{confirmedDryCount !== 1 ? 's' : ''} need water
              </div>
            )}
            {checkMoistureCount > 0 && (
              <div className="section-label" style={{ color: 'var(--red)', marginBottom: 8 }}>
                {checkMoistureCount} plant{checkMoistureCount !== 1 ? 's' : ''} — check moisture
              </div>
            )}
            <div className="plant-grid">
              {attentionPlants.map((p) => {
                const color = statusColor(p.needs_water, p.reason, p.days_until_due)
                const label = statusLabel(p.needs_water, p.reason, p.days_until_due, p.forecast_next_due)
                return (
                  <button
                    key={p.id}
                    className="plant-tile"
                    style={color ? { borderColor: color, background: `${color}18` } : undefined}
                    onClick={() => {
                      const params = new URLSearchParams({ plant: String(p.id) })
                      if (p.reason) params.set('reason', p.reason)
                      if (p.soil_deficit_mm != null)
                        params.set('deficit', String(Math.round(p.soil_deficit_mm)))
                      if (p.et0_budget_mm != null) params.set('budget', String(p.et0_budget_mm))
                      if (p.days_until_due != null) params.set('days', String(p.days_until_due))
                      if (p.latest_moisture != null)
                        params.set('moisture', String(p.latest_moisture))
                      if (p.last_watered) params.set('last', p.last_watered)
                      if (p.forecast_next_due) params.set('due', p.forecast_next_due)
                      navigate(`/note?${params}`)
                    }}
                  >
                    <span className="pt-label" style={color ? { color } : undefined}>
                      {p.label ?? `P${p.id}`}
                    </span>
                    <span className="pt-name">{p.short_name ?? p.name}</span>
                    {label && (
                      <span
                        style={{
                          fontSize: 10,
                          color: color ?? 'var(--text-dimmer)',
                          lineHeight: 1,
                          marginTop: 2,
                        }}
                      >
                        {label}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Workflow buttons */}
        {WORKFLOWS.map((w) => (
          <Link key={w.to} to={w.to} className="workflow-btn">
            <div className="wf-icon">{w.icon}</div>
            <div>
              <h2>{w.title}</h2>
              <p>{w.desc}</p>
            </div>
          </Link>
        ))}

        <Link
          to="/settings"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            color: 'var(--text-dim)',
            fontSize: 13,
            padding: '8px 0 4px',
            textDecoration: 'none',
          }}
        >
          ⚙ Settings
        </Link>
        <div
          style={{
            textAlign: 'center',
            fontSize: 11,
            color: 'var(--text-dimmer)',
            paddingBottom: 8,
          }}
        >
          {__APP_VERSION__}
        </div>
      </div>
    </div>
  )
}
