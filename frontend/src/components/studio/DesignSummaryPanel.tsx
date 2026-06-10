import type { DesignSummary } from '../../api/types'

interface DesignSummaryPanelProps {
  summary: DesignSummary | null
  onExport: () => void
}

const ROWS: { key: keyof DesignSummary; label: string }[] = [
  { key: 'bodies', label: 'Bodies' },
  { key: 'joints', label: 'Joints' },
  { key: 'motors', label: 'Motors' },
  { key: 'sensors', label: 'Sensors' },
  { key: 'beams', label: 'Beams' },
  { key: 'ramps', label: 'Ramps' },
  { key: 'total_parts', label: 'Total Parts' },
]

export function DesignSummaryPanel({ summary, onExport }: DesignSummaryPanelProps) {
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
        <button
          onClick={onExport}
          style={{
            marginTop: 8,
            width: '100%',
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
          Export Design
        </button>
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
