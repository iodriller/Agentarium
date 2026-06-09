import { useParams } from 'react-router-dom'
import { TopBar } from '../components/shared/TopBar'

export function StudioScreen() {
  const { runId } = useParams<{ runId: string }>()

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <TopBar projectName="Creature Builder Lab" />

      {/* Studio header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '8px 16px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface-1)',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
          Simulation World
        </span>
        <span style={{ fontSize: 11, color: 'var(--ok)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ok)', display: 'inline-block' }} />
          Ready
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-2)' }}>
          run: {runId ?? '—'}
        </span>
      </div>

      {/* Three-region layout */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left rail — briefing & agent status */}
        <div
          style={{
            width: 280,
            flexShrink: 0,
            borderRight: '1px solid var(--border)',
            padding: 12,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <RailSection title="Challenge" />
          <RailSection title="Agent Status" />
          <RailSection title="Score Card" />
        </div>

        {/* Center — isometric viewport + telemetry */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Viewport */}
          <div
            style={{
              flex: 1,
              background: 'var(--surface-2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-2)',
              fontSize: 12,
            }}
            id="iso-viewport"
          >
            Isometric World Viewport (Phaser scene mounts here)
          </div>

          {/* Telemetry strip */}
          <div
            style={{
              height: 160,
              flexShrink: 0,
              borderTop: '1px solid var(--border)',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              background: 'var(--surface-1)',
            }}
          >
            <TelemetryCard title="Score over Attempts" />
            <TelemetryCard title="Metrics over Time" borderLeft />
            <TelemetryCard title="Latest Attempt Summary" borderLeft />
          </div>
        </div>

        {/* Right rail — tools, log, design, replay */}
        <div
          style={{
            width: 300,
            flexShrink: 0,
            borderLeft: '1px solid var(--border)',
            padding: 12,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <RailSection title="Available Tools" />
          <RailSection title="Tool Call Log" />
          <RailSection title="Design Summary" />
          <RailSection title="Replay Timeline" />
        </div>
      </div>
    </div>
  )
}

function RailSection({ title }: { title: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: 'var(--text-2)',
          textTransform: 'uppercase',
          letterSpacing: '0.6px',
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      <div
        style={{
          padding: 10,
          borderRadius: 6,
          border: '1px dashed var(--border)',
          color: 'var(--text-2)',
          fontSize: 11,
          textAlign: 'center',
        }}
      >
        {title}
      </div>
    </div>
  )
}

function TelemetryCard({ title, borderLeft }: { title: string; borderLeft?: boolean }) {
  return (
    <div
      style={{
        padding: 10,
        borderLeft: borderLeft ? '1px solid var(--border)' : undefined,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {title}
      </span>
      <div
        style={{
          flex: 1,
          borderRadius: 4,
          border: '1px dashed var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-2)',
          fontSize: 11,
        }}
      >
        chart
      </div>
    </div>
  )
}
