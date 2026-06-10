import type { DesignSummary, ScoreCard } from '../../api/types'

export interface AgentInfo {
  id: string
  name: string
  role: string
}

interface AgentStatusPanelProps {
  agents: AgentInfo[]
  designByAgent: Record<string, DesignSummary>
  latestScoreByAgent: Record<string, ScoreCard>
  winnerAgentId: string | null
  running: boolean
  // Cooperative mode: agents contribute to ONE shared design with a shared
  // score. ``ownershipByAgent`` is each agent's contribution to it.
  cooperative?: boolean
  ownershipByAgent?: Record<string, Partial<DesignSummary>>
  sharedScore?: ScoreCard | null
}

const AGENT_COLORS = ['var(--agent-a)', 'var(--agent-b)']

export function AgentStatusPanel({
  agents,
  designByAgent,
  latestScoreByAgent,
  winnerAgentId,
  running,
  cooperative = false,
  ownershipByAgent = {},
  sharedScore = null,
}: AgentStatusPanelProps) {
  return (
    <div>
      <SectionLabel>Agent Status</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {agents.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-2)' }}>No agents.</div>
        )}
        {agents.map((agent, i) => {
          const color = AGENT_COLORS[i % AGENT_COLORS.length]
          const design = designByAgent[agent.id] ?? null
          const score = latestScoreByAgent[agent.id] ?? null
          // Cooperative: parts shown are this agent's contribution to the shared
          // design; the score is the single shared score (same for all agents).
          const contribution = cooperative ? (ownershipByAgent[agent.id] ?? null) : null
          const partsValue = cooperative
            ? `${contribution?.total_parts ?? 0}`
            : `${design?.total_parts ?? 0}`
          const scoreValue = cooperative
            ? sharedScore
              ? sharedScore.score_total.toFixed(1)
              : '—'
            : score
              ? score.score_total.toFixed(1)
              : '—'
          const isWinner = !cooperative && winnerAgentId === agent.id
          // An agent is "done" once it has produced a score and the run is
          // either over or another agent is now building.
          const done = !running
          return (
            <div
              key={agent.id}
              style={{
                padding: 10,
                borderRadius: 6,
                border: isWinner ? `1px solid ${color}` : '1px solid var(--border)',
                boxShadow: isWinner ? `0 0 0 1px ${color}` : undefined,
                background: 'var(--surface-2)',
                borderLeft: `3px solid ${color}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: done ? 'var(--ok)' : 'var(--warn)',
                    display: 'inline-block',
                  }}
                />
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>
                  {agent.name}
                </span>
                {isWinner && (
                  <span
                    style={{
                      fontSize: 9,
                      padding: '1px 6px',
                      borderRadius: 8,
                      background: 'var(--ok)',
                      color: '#0b0f17',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.4px',
                    }}
                  >
                    Winner
                  </span>
                )}
                <span
                  style={{
                    marginLeft: 'auto',
                    fontSize: 9,
                    padding: '1px 6px',
                    borderRadius: 8,
                    background: color,
                    color: '#0b0f17',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.4px',
                  }}
                >
                  {agent.role}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Stat label={cooperative ? 'Contributed' : 'Parts'} value={partsValue} />
                <Stat label={cooperative ? 'Shared' : 'Score'} value={scoreValue} />
                <Stat label="State" value={done ? 'Done' : 'Building'} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <span style={{ fontSize: 9, color: 'var(--text-2)', textTransform: 'uppercase' }}>
        {label}
      </span>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>{value}</span>
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
