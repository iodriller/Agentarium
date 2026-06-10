import { useEffect, useRef } from 'react'
import type { ToolCallRecord } from '../../api/types'

interface ToolCallLogProps {
  records: ToolCallRecord[]
  onClear: () => void
}

// Stable per-agent color assignment so each agent reads as a consistent hue.
const PALETTE = ['var(--agent-a)', 'var(--agent-b)']

function colorForAgent(agentId: string, order: string[]): string {
  const idx = order.indexOf(agentId)
  return PALETTE[(idx < 0 ? 0 : idx) % PALETTE.length]
}

function formatArgs(args: Record<string, unknown>): string {
  const entries = Object.entries(args)
  if (entries.length === 0) return ''
  return entries
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(', ')
}

export function ToolCallLog({ records, onClear }: ToolCallLogProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Auto-scroll to the newest line at the bottom.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [records.length])

  const agentOrder = Array.from(new Set(records.map((r) => r.agent_id)))

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: 'var(--text-2)',
            textTransform: 'uppercase',
            letterSpacing: '0.6px',
          }}
        >
          Tool Call Log
        </span>
        <button
          onClick={onClear}
          style={{
            fontSize: 10,
            padding: '2px 7px',
            borderRadius: 4,
            border: '1px solid var(--border)',
            background: 'var(--surface-2)',
            color: 'var(--text-2)',
            cursor: 'pointer',
          }}
        >
          Clear
        </button>
      </div>
      <div
        ref={scrollRef}
        style={{
          maxHeight: 200,
          overflowY: 'auto',
          borderRadius: 6,
          border: '1px solid var(--border)',
          background: 'var(--surface-2)',
          padding: 8,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 10,
          lineHeight: 1.5,
        }}
      >
        {records.length === 0 ? (
          <span style={{ color: 'var(--text-2)' }}>Waiting for tool calls…</span>
        ) : (
          records.map((r, i) => {
            const color =
              r.status === 'rejected' ? 'var(--danger)' : colorForAgent(r.agent_id, agentOrder)
            const ts = new Date(r.ts * 1000).toLocaleTimeString()
            return (
              <div key={i} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <span style={{ color: 'var(--text-2)' }}>{ts}</span>{' '}
                <span style={{ color, fontWeight: 700 }}>{r.agent_id}</span>{' '}
                <span style={{ color: 'var(--text-1)' }}>
                  {r.tool}({formatArgs(r.args)})
                </span>
                {r.status !== 'success' && (
                  <span style={{ color: 'var(--warn)' }}> [{r.status}]</span>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
