import { Routes, Route } from 'react-router-dom'
import Home        from './pages/Home'
import SensorRound from './pages/SensorRound'
import PhRound     from './pages/PhRound'
import WaterLog    from './pages/WaterLog'
import PlantNote   from './pages/PlantNote'
import PhotoRound  from './pages/PhotoRound'

export default function App() {
  return (
    <Routes>
      <Route path="/"        element={<Home />}        />
      <Route path="/sensors" element={<SensorRound />} />
      <Route path="/ph"      element={<PhRound />}     />
      <Route path="/water"   element={<WaterLog />}    />
      <Route path="/note"    element={<PlantNote />}   />
      <Route path="/photos"  element={<PhotoRound />}  />
    </Routes>
  )
}
