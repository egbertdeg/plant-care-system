import { Link } from 'react-router-dom'
import { useNavigate } from 'react-router-dom'

const ITEMS = [
  {
    to:    '/setup',
    icon:  '🖼️',
    title: 'Hero Setup',
    desc:  'Set a reference/vendor hero photo for each plant',
  },
  {
    to:    '/import',
    icon:  '📥',
    title: 'History Import',
    desc:  'Bulk import camera roll photos with EXIF timestamps',
  },
]

export default function Settings() {
  const navigate = useNavigate()
  return (
    <div className="page">
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate('/')}>← Home</button>
        <h1>Settings</h1>
      </div>
      <div className="page-body">
        {ITEMS.map(item => (
          <Link key={item.to} to={item.to} className="workflow-btn">
            <div className="wf-icon">{item.icon}</div>
            <div>
              <h2>{item.title}</h2>
              <p>{item.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
