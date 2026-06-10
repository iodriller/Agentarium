import type { ScoreCard } from '../../api/types'
import type { AgentInfo } from './AgentStatusPanel'

export interface AttemptScore {
  index: number
  scorecard: ScoreCard
}

const AGENT_COLORS = ['var(--agent-a)', 'var(--agent-b)']

interface TelemetryPanelProps {
  agents: AgentInfo[]
  attemptsByAgent: Record<string, AttemptScore[]>
  latest: ScoreCard | null
  latestAgentName: string
  latestAttemptIndex: number | null
  running: boolean
}

function metric(card: ScoreCard | null, key: string): string {
  if (!card) return '—'
  const v = card.metrics[key]
  return v == null ? '—' : v.toFixed(2)
}

export function TelemetryPanel({
  agents,
  attemptsByAgent,
  latest,
  latestAgentName,
  latestAttemptIndex,
  running,
}: TelemetryPanelProps) {
  return (
    <>
      <Card title="Score over Attempts">
        <Sparkline agents={agents} attemptsByAgent={attemptsByAgent} />
      </Card>
      <Card title="Metrics over Time" borderLeft>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%' }}>
          <MetricRow label="Distance" value={metric(latest, 'distance_m')} />
          <MetricRow label="Stability" value={metric(latest, 'stability')} />
          <MetricRow label="Energy Used" value={metric(latest, 'energy')} />
        </div>
      </Card>
      <Card
        title={latestAgentName ? `Latest Attempt · ${latestAgentName}` : 'Latest Attempt Summary'}
        borderLeft
      >
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

function Sparkline({
  agents,
  attemptsByAgent,
}: {
  agents: AgentInfo[]
  attemptsByAgent: Record<string, AttemptScore[]>
}) {
  // One series per agent (in agent order). Single-agent runs render one line.
  const series = agents
    .map((a, i) => ({
      agent: a,
      color: AGENT_COLORS[i % AGENT_COLORS.length],
      attempts: attemptsByAgent[a.id] ?? [],
    }))
    .filter((s) => s.attempts.length > 0)

  if (series.length === 0) {
    return <span style={{ fontSize: 11, color: 'var(--text-2)' }}>No attempts yet</span>
  }

  // Shared scale across all agents so lines are comparable.
  const allScores = series.flatMap((s) => s.attempts.map((a) => a.scorecard.score_total))
  const max = Math.max(...allScores, 1)
  const min = Math.min(...allScores, 0)
  const range = max - min || 1
  const w = 120
  const h = 48

  const plot = (attempts: AttemptScore[]) => {
    const n = attempts.length
    return attempts.map((a, i) => {
      const x = n > 1 ? (i / (n - 1)) * w : w / 2
      const y = h - ((a.scorecard.score_total - min) / range) * h
      return { x, y, index: a.index, score: a.scorecard.score_total }
    })
  }

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        {series.map((s) => {
          const pts = plot(s.attempts)
          return (
            <g key={s.agent.id}>
              <polyline
                points={pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
              {pts.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={2} fill={s.color} />
              ))}
            </g>
          )
        })}
      </svg>
      <div style={{ fontSize: 10, color: 'var(--text-2)' }}>
        {series.length > 1 ? (
          series.map((s) => (
            <span key={s.agent.id} style={{ marginRight: 8, color: s.color, fontWeight: 600 }}>
              {s.agent.name}
            </span>
          ))
        ) : (
          series[0].attempts.map((a) => (
            <span key={a.index} style={{ marginRight: 8 }}>
              #{a.index + 1}:{a.scorecard.score_total.toFixed(1)}
            </span>
          ))
        )}
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
