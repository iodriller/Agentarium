import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { HistoryScreen } from './screens/HistoryScreen'
import { SetupScreen } from './screens/SetupScreen'

const StudioScreen = lazy(() =>
  import('./screens/StudioScreen').then((module) => ({ default: module.StudioScreen })),
)
const ExperimentsScreen = lazy(() =>
  import('./screens/ExperimentsScreen').then((module) => ({ default: module.ExperimentsScreen })),
)
const CompareScreen = lazy(() =>
  import('./screens/CompareScreen').then((module) => ({ default: module.CompareScreen })),
)
const PhysicalLabScreen = lazy(() =>
  import('./screens/PhysicalLabScreen').then((module) => ({ default: module.PhysicalLabScreen })),
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
          <Route path="/experiments" element={<ExperimentsScreen />} />
          <Route path="/compare" element={<CompareScreen />} />
          <Route path="/physical" element={<PhysicalLabScreen />} />
          <Route path="*" element={<Navigate to="/setup" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
