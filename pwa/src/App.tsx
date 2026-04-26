import { Routes, Route } from 'react-router-dom'
import Home        from './pages/Home'
import SensorRound from './pages/SensorRound'
import PhRound     from './pages/PhRound'
import ActivityLog from './pages/ActivityLog'
import PlantNote   from './pages/PlantNote'
import PhotoRound  from './pages/PhotoRound'
import HeroSetup   from './pages/HeroSetup'
import BulkImport  from './pages/BulkImport'
import Settings    from './pages/Settings'

export default function App() {
  return (
    <Routes>
      <Route path="/"        element={<Home />}        />
      <Route path="/sensors" element={<SensorRound />} />
      <Route path="/ph"      element={<PhRound />}     />
      <Route path="/activity" element={<ActivityLog />}  />
      <Route path="/note"    element={<PlantNote />}   />
      <Route path="/photos"  element={<PhotoRound />}  />
      <Route path="/settings" element={<Settings />}    />
      <Route path="/setup"    element={<HeroSetup />}   />
      <Route path="/import"   element={<BulkImport />}  />
    </Routes>
  )
}
