import type { ScoreCard } from '../../api/types'

export interface AttemptScore {
  index: number
  scorecard: ScoreCard
}

interface TelemetryPanelProps {
  attempts: AttemptScore[]
  latest: ScoreCard | null
  latestAttemptIndex: number | null
  running: boolean
}

function metric(card: ScoreCard | null, key: string): string {
  if (!card) return '—'
  const v = card.metrics[key]
  return v == null ? '—' : v.toFixed(2)
}

export function TelemetryPanel({
  attempts,
  latest,
  latestAttemptIndex,
  running,
}: TelemetryPanelProps) {
  return (
    <>
      <Card title="Score over Attempts">
        <Sparkline attempts={attempts} />
      </Card>
      <Card title="Metrics over Time" borderLeft>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%' }}>
          <MetricRow label="Distance" value={metric(latest, 'distance_m')} />
          <MetricRow label="Stability" value={metric(latest, 'stability')} />
          <MetricRow label="Energy Used" value={metric(latest, 'energy')} />
        </div>
      </Card>
      <Card title="Latest Attempt Summary" borderLeft>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%' }}>
          <MetricRow
            label="Attempt #"
            value={latestAttemptIndex != null ? `${latestAttemptIndex + 1}` : '—'}
          />
          <MetricRow
            label="Status"
            value={running ? 'Running' : latest ? (latest.success ? 'Success' : 'Complete') : '—'}
          />
          <MetricRow label="Distance" value={metric(latest, 'distance_m')} />
          <MetricRow label="Stability" value={metric(latest, 'stability')} />
          <MetricRow label="Energy Used" value={metric(latest, 'energy')} />
          <MetricRow
            label="Failures"
            value={`${latest?.failure_events.length ?? 0}`}
          />
        </div>
      </Card>
    </>
  )
}

function Sparkline({ attempts }: { attempts: AttemptScore[] }) {
  if (attempts.length === 0) {
    return <span style={{ fontSize: 11, color: 'var(--text-2)' }}>No attempts yet</span>
  }
  const scores = attempts.map((a) => a.scorecard.score_total)
  const max = Math.max(...scores, 1)
  const min = Math.min(...scores, 0)
  const range = max - min || 1
  const w = 120
  const h = 48
  const stepX = attempts.length > 1 ? w / (attempts.length - 1) : 0
  const points = scores
    .map((s, i) => {
      const x = attempts.length > 1 ? i * stepX : w / 2
      const y = h - ((s - min) / range) * h
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <polyline
          points={points}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
        {scores.map((s, i) => {
          const x = attempts.length > 1 ? i * stepX : w / 2
          const y = h - ((s - min) / range) * h
          return <circle key={i} cx={x} cy={y} r={2} fill="var(--accent)" />
        })}
      </svg>
      <div style={{ fontSize: 10, color: 'var(--text-2)' }}>
        {scores.map((s, i) => (
          <span key={i} style={{ marginRight: 8 }}>
            #{attempts[i].index + 1}:{s.toFixed(1)}
          </span>
        ))}
      </div>
    </div>
  )
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-1)' }}>{value}</span>
    </div>
  )
}

function Card({
  title,
  borderLeft,
  children,
}: {
  title: string
  borderLeft?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        padding: 10,
        borderLeft: borderLeft ? '1px solid var(--border)' : undefined,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        overflow: 'hidden',
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: 'var(--text-2)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        {title}
      </span>
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 0,
        }}
      >
        {children}
      </div>
    </div>
  )
}
