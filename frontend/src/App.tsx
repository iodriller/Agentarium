import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { HistoryScreen } from './screens/HistoryScreen'
import { SetupScreen } from './screens/SetupScreen'

const StudioScreen = lazy(() =>
  import('./screens/StudioScreen').then((module) => ({ default: module.StudioScreen })),
)

function RouteLoading() {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
        color: 'var(--text-2)',
        fontSize: 12,
      }}
    >
      Loading…
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteLoading />}>
        <Routes>
          <Route path="/setup" element={<SetupScreen />} />
          <Route path="/studio/:runId" element={<StudioScreen />} />
          <Route path="/history" element={<HistoryScreen />} />
          <Route path="*" element={<Navigate to="/setup" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
