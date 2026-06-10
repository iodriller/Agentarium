import type { DesignSummary } from '../../api/types'
import type { AgentInfo } from './AgentStatusPanel'

interface DesignSummaryPanelProps {
  summary: DesignSummary | null
  // Cooperative ownership breakdown: who built which parts of the shared design.
  byAgent?: Record<string, Partial<DesignSummary>> | null
  agents?: AgentInfo[]
  // Download the design YAML. Undefined when no trace is loaded yet (disabled).
  onExport?: () => void
  // Open the self-contained Markdown run report. Undefined → button hidden.
  onViewReport?: () => void
}

const AGENT_COLORS = ['var(--agent-a)', 'var(--agent-b)']

const ROWS: { key: keyof DesignSummary; label: string }[] = [
  { key: 'bodies', label: 'Bodies' },
  { key: 'joints', label: 'Joints' },
  { key: 'motors', label: 'Motors' },
  { key: 'sensors', label: 'Sensors' },
  { key: 'beams', label: 'Beams' },
  { key: 'ramps', label: 'Ramps' },
  { key: 'total_parts', label: 'Total Parts' },
]

export function DesignSummaryPanel({
  summary,
  byAgent,
  agents = [],
  onExport,
  onViewReport,
}: DesignSummaryPanelProps) {
  const ownership = byAgent ? Object.entries(byAgent) : []
  const colorForAgent = (agentId: string): string => {
    const idx = agents.findIndex((a) => a.id === agentId)
    return AGENT_COLORS[(idx < 0 ? 0 : idx) % AGENT_COLORS.length]
  }
  const nameForAgent = (agentId: string): string =>
    agents.find((a) => a.id === agentId)?.name ?? agentId
  return (
    <div>
      <SectionLabel>Design Summary</SectionLabel>
      <div
        style={{
          borderRadius: 6,
          border: '1px solid var(--border)',
          background: 'var(--surface-2)',
          padding: '8px 10px',
        }}
      >
        {ROWS.map(({ key, label }) => (
          <div
            key={key}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '2px 0',
              borderTop: key === 'total_parts' ? '1px solid var(--border)' : undefined,
              marginTop: key === 'total_parts' ? 4 : 0,
              paddingTop: key === 'total_parts' ? 6 : 2,
            }}
          >
            <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{label}</span>
            <span
              style={{
                fontSize: 11,
                fontWeight: key === 'total_parts' ? 700 : 500,
                color: 'var(--text-1)',
              }}
            >
              {summary ? summary[key] : 0}
            </span>
          </div>
        ))}
        {ownership.length > 0 && (
          <div
            style={{
              marginTop: 6,
              paddingTop: 6,
              borderTop: '1px solid var(--border)',
            }}
          >
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: 'var(--text-2)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: 4,
              }}
            >
              Built by
            </div>
            {ownership.map(([agentId, parts]) => (
              <div
                key={agentId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '2px 0',
                }}
              >
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 11,
                    color: 'var(--text-1)',
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: colorForAgent(agentId),
                      display: 'inline-block',
                    }}
                  />
                  {nameForAgent(agentId)}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-2)' }}>
                  {parts.bodies ?? 0}b · {parts.joints ?? 0}j
                  {parts.motors ? ` · ${parts.motors}m` : ''}
                </span>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button
            onClick={onExport}
            disabled={!onExport}
            style={{
              flex: 1,
              padding: '6px 10px',
              borderRadius: 5,
              border: '1px solid var(--border)',
              background: 'var(--surface-1)',
              color: 'var(--text-1)',
              fontSize: 11,
              fontWeight: 600,
              cursor: onExport ? 'pointer' : 'not-allowed',
              opacity: onExport ? 1 : 0.5,
            }}
          >
            Export Design
          </button>
          {onViewReport && (
            <button
              onClick={onViewReport}
              style={{
                flex: 1,
                padding: '6px 10px',
                borderRadius: 5,
                border: '1px solid var(--border)',
                background: 'var(--surface-1)',
                color: 'var(--text-1)',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              View Full Report
            </button>
          )}
        </div>
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
