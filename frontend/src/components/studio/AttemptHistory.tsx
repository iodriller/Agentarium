import type { AttemptScore } from './TelemetryPanel'

interface AttemptHistoryProps {
  // Attempts for the active agent, in attempt order.
  attempts: AttemptScore[]
  // trace_run_id per attempt index (for replay on click).
  traceByIndex: Record<number, string>
  // Attempt index the backend reported as best (★), or null while running.
  bestAttemptIndex: number | null
  onReplay: (traceRunId: string) => void
}

export function AttemptHistory({
  attempts,
  traceByIndex,
  bestAttemptIndex,
  onReplay,
}: AttemptHistoryProps) {
  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 6,
        background: 'var(--surface-2)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '8px 10px',
          fontSize: 10,
          fontWeight: 600,
          color: 'var(--text-2)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        Attempt History
      </div>
      {attempts.length === 0 ? (
        <div style={{ padding: 10, fontSize: 11, color: 'var(--text-2)' }}>No attempts yet</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {attempts.map((a, i) => {
            const prev = i > 0 ? attempts[i - 1].scorecard.score_total : null
            const delta = prev == null ? null : a.scorecard.score_total - prev
            const best = bestAttemptIndex != null && a.index === bestAttemptIndex
            const traceRunId = traceByIndex[a.index]
            const clickable = !!traceRunId
            return (
              <button
                key={a.index}
                type="button"
                disabled={!clickable}
                onClick={() => clickable && onReplay(traceRunId)}
                title={clickable ? 'Replay this attempt' : 'No trace for this attempt'}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 10px',
                  border: 'none',
                  borderTop: i > 0 ? '1px solid var(--border)' : undefined,
                  background: best ? 'var(--surface-1)' : 'transparent',
                  color: 'var(--text-1)',
                  fontSize: 11,
                  textAlign: 'left',
                  cursor: clickable ? 'pointer' : 'default',
                  width: '100%',
                }}
              >
                <span style={{ width: 14, color: 'var(--warn)' }}>{best ? '★' : ''}</span>
                <span style={{ color: 'var(--text-2)' }}>#{a.index + 1}</span>
                <span style={{ fontWeight: 600 }}>{a.scorecard.score_total.toFixed(1)}</span>
                {delta != null && (
                  <span
                    style={{
                      marginLeft: 'auto',
                      color:
                        delta > 0 ? 'var(--ok)' : delta < 0 ? 'var(--danger)' : 'var(--text-2)',
                    }}
                  >
                    {delta > 0 ? '▲' : delta < 0 ? '▼' : '—'} {Math.abs(delta).toFixed(1)}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
