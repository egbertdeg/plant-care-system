import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import SensorRound from './pages/SensorRound'
import WaterLog from './pages/WaterLog'
import PhotoRound from './pages/PhotoRound'

export default function App() {
  return (
    <Routes>
      <Route path="/"        element={<Home />}        />
      <Route path="/sensors" element={<SensorRound />} />
      <Route path="/water"   element={<WaterLog />}    />
      <Route path="/photos"  element={<PhotoRound />}  />
    </Routes>
  )
}
