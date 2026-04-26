import { Link } from 'react-router-dom'

export default function Home() {
  return (
    <div className="page">
      <div className="page-header">
        <h1>🌹 Plant Care</h1>
      </div>
      <div className="page-body">
        <Link to="/sensors" className="workflow-btn">
          <div className="wf-icon">🔬</div>
          <div>
            <h2>Sensor Round</h2>
            <p>Log moisture + pH for all 10 plants</p>
          </div>
        </Link>

        <Link to="/water" className="workflow-btn">
          <div className="wf-icon">💧</div>
          <div>
            <h2>Log Watering</h2>
            <p>Record a watering event for one or more plants</p>
          </div>
        </Link>

        <Link to="/photos" className="workflow-btn">
          <div className="wf-icon">📷</div>
          <div>
            <h2>Photo Round</h2>
            <p>Capture photos for O1–O10 (skips O2)</p>
          </div>
        </Link>
      </div>
    </div>
  )
}
