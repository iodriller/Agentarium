import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { HistoryScreen } from './screens/HistoryScreen'
import { SetupScreen } from './screens/SetupScreen'
import { StudioScreen } from './screens/StudioScreen'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/setup" element={<SetupScreen />} />
        <Route path="/studio/:runId" element={<StudioScreen />} />
        <Route path="/history" element={<HistoryScreen />} />
        <Route path="*" element={<Navigate to="/setup" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
