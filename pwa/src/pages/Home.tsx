import { Link } from 'react-router-dom'

const WORKFLOWS = [
  {
    to:    '/sensors',
    icon:  '💧',
    title: 'Moisture Round',
    desc:  'Soil moisture for all 10 plants — weekly',
  },
  {
    to:    '/ph',
    icon:  '🧪',
    title: 'pH Round',
    desc:  'Soil pH for all 10 plants — monthly-ish',
  },
  {
    to:    '/water',
    icon:  '🚿',
    title: 'Log Watering',
    desc:  'Record a watering event for one or more plants',
  },
  {
    to:    '/note',
    icon:  '📝',
    title: 'Plant Note',
    desc:  'Add an observation + up to 3 photos for one plant',
  },
  {
    to:    '/photos',
    icon:  '📷',
    title: 'Photo Round',
    desc:  'Rapid photo capture for all plants — weekly',
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
      </div>
    </div>
  )
}
