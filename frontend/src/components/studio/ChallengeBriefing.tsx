import type { ConstraintsConfig, RunCaps } from '../../api/types'

interface ChallengeBriefingProps {
  challengeName: string
  objective: string
  reward: string
  constraints?: Partial<ConstraintsConfig>
  caps?: RunCaps | null
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
  caps,
}: ChallengeBriefingProps) {
  // Build human cap notes only when the MVP cap is below what the user requested.
  const attemptsCapped =
    caps && caps.requestedAttempts != null && caps.requestedAttempts > caps.effectiveAttempts
  const simCapped =
    caps &&
    caps.simCapS != null &&
    caps.requestedDurationS != null &&
    caps.requestedDurationS > caps.simCapS

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
        {caps && (
          <Row
            label="Attempts"
            value={
              attemptsCapped
                ? `${caps.effectiveAttempts} max (you set ${caps.requestedAttempts})`
                : `${caps.effectiveAttempts}`
            }
          />
        )}
        {simCapped && <Row label="Sim cap" value={`${caps!.simCapS}s (you set ${caps!.requestedDurationS}s)`} />}
      </div>

      {(attemptsCapped || simCapped) && (
        <div
          style={{
            marginTop: 6,
            fontSize: 10,
            color: 'var(--warn)',
            lineHeight: 1.4,
          }}
        >
          {attemptsCapped && `Capped to ${caps!.effectiveAttempts} attempts for responsiveness. `}
          {simCapped && `Simulation capped at ${caps!.simCapS}s.`}
        </div>
      )}
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
