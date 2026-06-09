import { TopBar } from '../components/shared/TopBar'

export function SetupScreen() {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <TopBar projectName="Bridge Builder Lab" />

      {/* Title block */}
      <div
        style={{
          padding: '20px 24px 16px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface-1)',
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-1)', marginBottom: 4 }}>
          Simulation Setup
        </h1>
        <p style={{ fontSize: 12, color: 'var(--text-2)' }}>
          Configure your world, agents, tools, and constraints before launch.
        </p>
      </div>

      {/* Three-column layout */}
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 0,
          overflow: 'hidden',
        }}
      >
        {/* Column 1 — Scenario & World */}
        <div
          style={{
            borderRight: '1px solid var(--border)',
            padding: 16,
            overflowY: 'auto',
          }}
        >
          <ColumnHeader number={1} title="Scenario & World Setup" badge="Required" />
          <Placeholder label="Challenge preset cards, world settings, physics engine" />
        </div>

        {/* Column 2 — Agent & LLM */}
        <div
          style={{
            borderRight: '1px solid var(--border)',
            padding: 16,
            overflowY: 'auto',
          }}
        >
          <ColumnHeader number={2} title="Agent & LLM Setup" badge="Required" />
          <Placeholder label="Collaboration mode, agent cards, LLM provider & connection" />
        </div>

        {/* Column 3 — Tools, Constraints & Launch */}
        <div style={{ padding: 16, overflowY: 'auto' }}>
          <ColumnHeader number={3} title="Tools, Constraints & Launch" />
          <Placeholder label="Tool categories, constraint sliders, launch summary & button" />
        </div>
      </div>
    </div>
  )
}

function ColumnHeader({
  number,
  title,
  badge,
}: {
  number: number
  title: string
  badge?: string
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 16,
        paddingBottom: 12,
        borderBottom: '1px solid var(--border)',
      }}
    >
      <span
        style={{
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: 'var(--accent)',
          color: '#fff',
          fontSize: 11,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {number}
      </span>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {title}
      </span>
      {badge && (
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 10,
            padding: '2px 6px',
            borderRadius: 4,
            background: 'var(--accent-soft)',
            color: 'var(--accent)',
            border: '1px solid var(--accent)',
            fontWeight: 600,
          }}
        >
          {badge}
        </span>
      )}
    </div>
  )
}

function Placeholder({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: 20,
        borderRadius: 8,
        border: '1px dashed var(--border)',
        color: 'var(--text-2)',
        fontSize: 12,
        textAlign: 'center',
      }}
    >
      {label}
    </div>
  )
}
