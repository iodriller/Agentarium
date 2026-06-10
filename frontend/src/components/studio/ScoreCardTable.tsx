import type { AgentInfo } from './AgentStatusPanel'

interface ScoreCardTableProps {
  agents: AgentInfo[]
  latestScore: number | null
  bestScore: number | null
}

const AGENT_COLORS = ['var(--agent-a)', 'var(--agent-b)']

export function ScoreCardTable({ agents, latestScore, bestScore }: ScoreCardTableProps) {
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
        {agents.map((agent, i) => (
          <div
            key={agent.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto auto',
              gap: 8,
              padding: '6px 10px',
              fontSize: 11,
              alignItems: 'center',
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
            </span>
            <span style={{ textAlign: 'right', color: 'var(--text-1)', fontWeight: 600 }}>
              {latestScore != null ? latestScore.toFixed(1) : '—'}
            </span>
            <span style={{ textAlign: 'right', color: 'var(--ok)', fontWeight: 600 }}>
              {bestScore != null ? bestScore.toFixed(1) : '—'}
            </span>
          </div>
        ))}
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
