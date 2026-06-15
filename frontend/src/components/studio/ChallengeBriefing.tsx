import type { ConstraintsConfig } from '../../api/types'

interface ChallengeBriefingProps {
  challengeName: string
  objective: string
  reward: string
  constraints?: Partial<ConstraintsConfig>
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
      <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{label}</span>
      <span style={{ fontSize: 11, color: 'var(--text-1)', fontWeight: 500, textAlign: 'right' }}>
        {value}
      </span>
    </div>
  )
}

export function ChallengeBriefing({
  challengeName,
  objective,
  reward,
  constraints,
}: ChallengeBriefingProps) {
  return (
    <div>
      <SectionLabel>Challenge</SectionLabel>
      <div
        style={{
          padding: 10,
          borderRadius: 6,
          border: '1px solid var(--border)',
          background: 'var(--surface-2)',
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-1)',
            marginBottom: 6,
          }}
        >
          {challengeName || '—'}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 8, lineHeight: 1.4 }}>
          {objective || 'No objective set.'}
        </div>
        <Row label="Max Parts" value={`${constraints?.max_parts ?? '—'}`} />
        <Row label="Energy Budget" value={`${constraints?.energy_budget ?? '—'}`} />
        <Row label="Sim Duration" value={`${constraints?.simulation_duration_seconds ?? '—'}s`} />
        <Row label="Reward" value={reward || '—'} />
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
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
      {children}
    </div>
  )
}
