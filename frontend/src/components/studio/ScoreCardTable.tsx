import type { ScoreCard } from '../../api/types'
import type { AgentInfo } from './AgentStatusPanel'

interface ScoreCardTableProps {
  agents: AgentInfo[]
  latestScoreByAgent: Record<string, ScoreCard>
  bestScoreByAgent: Record<string, number>
  winnerAgentId: string | null
}

const AGENT_COLORS = ['var(--agent-a)', 'var(--agent-b)']

export function ScoreCardTable({
  agents,
  latestScoreByAgent,
  bestScoreByAgent,
  winnerAgentId,
}: ScoreCardTableProps) {
  return (
    <div>
      <SectionLabel>Score Card</SectionLabel>
      <div
        style={{
          borderRadius: 6,
          border: '1px solid var(--border)',
          background: 'var(--surface-2)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto auto',
            gap: 8,
            padding: '6px 10px',
            borderBottom: '1px solid var(--border)',
            fontSize: 9,
            fontWeight: 700,
            color: 'var(--text-2)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          <span>Agent</span>
          <span style={{ textAlign: 'right' }}>Score</span>
          <span style={{ textAlign: 'right' }}>Best</span>
        </div>
        {agents.length === 0 && (
          <div style={{ padding: '8px 10px', fontSize: 11, color: 'var(--text-2)' }}>—</div>
        )}
        {agents.map((agent, i) => {
          const latest = latestScoreByAgent[agent.id]?.score_total ?? null
          const best = bestScoreByAgent[agent.id] ?? null
          const isWinner = winnerAgentId === agent.id
          return (
            <div
              key={agent.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto auto',
                gap: 8,
                padding: '6px 10px',
                fontSize: 11,
                alignItems: 'center',
                background: isWinner ? 'var(--surface-1)' : undefined,
              }}
            >
              <span
                style={{
                  color: 'var(--text-1)',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: AGENT_COLORS[i % AGENT_COLORS.length],
                  }}
                />
                {agent.name}
                {isWinner && (
                  <span style={{ color: 'var(--ok)', fontWeight: 700, fontSize: 10 }}>
                    ★
                  </span>
                )}
              </span>
              <span style={{ textAlign: 'right', color: 'var(--text-1)', fontWeight: 600 }}>
                {latest != null ? latest.toFixed(1) : '—'}
              </span>
              <span style={{ textAlign: 'right', color: 'var(--ok)', fontWeight: 600 }}>
                {best != null ? best.toFixed(1) : '—'}
              </span>
            </div>
          )
        })}
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
