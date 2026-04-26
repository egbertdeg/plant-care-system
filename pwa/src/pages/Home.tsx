import { Link } from 'react-router-dom'

const WORKFLOWS = [
  {
    to:    '/sensors',
    icon:  '💧',
    title: 'Moisture Round',
    desc:  'Soil moisture for all 10 plants — weekly',
  },
  {
    to:    '/activity',
    icon:  '🚿',
    title: 'Log Activity',
    desc:  'Water, fertilize, prune — one or more plants',
  },
  {
    to:    '/photos',
    icon:  '📷',
    title: 'Photo Round',
    desc:  'Rapid photo capture for all plants — weekly',
  },
  {
    to:    '/ph',
    icon:  '🧪',
    title: 'pH Round',
    desc:  'Soil pH for all 10 plants — monthly-ish',
  },
  {
    to:    '/note',
    icon:  '💬',
    title: 'Plant Chat',
    desc:  'Discuss observations, plan care.',
  },
]

export default function Home() {
  return (
    <div className="page">
      <div className="page-header">
        <h1>🌹 Plant Care</h1>
      </div>
      <div className="page-body">
        {WORKFLOWS.map(w => (
          <Link key={w.to} to={w.to} className="workflow-btn">
            <div className="wf-icon">{w.icon}</div>
            <div>
              <h2>{w.title}</h2>
              <p>{w.desc}</p>
            </div>
          </Link>
        ))}
        <Link to="/settings" style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          color: 'var(--text-dim)',
          fontSize: 13,
          padding: '8px 0 4px',
          textDecoration: 'none',
        }}>
          ⚙ Settings
        </Link>
      </div>
    </div>
  )
}
