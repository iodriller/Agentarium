import type { AttemptDiff } from '../../api/types'

interface AttemptDiffPanelProps {
  diff: AttemptDiff | null
  attemptIndex: number | null
}

function delta(n: number): { text: string; color: string } {
  if (n > 0) return { text: `+${n}`, color: 'var(--ok)' }
  if (n < 0) return { text: `${n}`, color: 'var(--danger)' }
  return { text: '0', color: 'var(--text-2)' }
}

export function AttemptDiffPanel({ diff, attemptIndex }: AttemptDiffPanelProps) {
  return (
    <div>
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
        What Changed
      </div>
      <div
        style={{
          padding: 10,
          borderRadius: 6,
          border: '1px solid var(--border)',
          background: 'var(--surface-2)',
          fontSize: 11,
          color: 'var(--text-2)',
        }}
      >
        {!diff ? (
          <span>
            {attemptIndex != null && attemptIndex > 0
              ? 'No diff for this attempt.'
              : 'First attempt — nothing to compare yet.'}
          </span>
        ) : (
          <DiffBody diff={diff} />
        )}
      </div>
    </div>
  )
}

function DiffBody({ diff }: { diff: AttemptDiff }) {
  const score = diff.score_delta
  const scoreColor = score > 0 ? 'var(--ok)' : score < 0 ? 'var(--danger)' : 'var(--text-2)'
  const parts = delta(diff.parts_delta)
  const joints = delta(diff.joints_delta)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Line label={`vs attempt #${diff.prev_attempt_index}`} />
      <Row label="Score">
        <span style={{ color: scoreColor, fontWeight: 600 }}>
          {score >= 0 ? '+' : ''}
          {score.toFixed(1)}
        </span>
        <span style={{ color: 'var(--text-2)', marginLeft: 4 }}>
          (was {diff.prev_score.toFixed(1)})
        </span>
      </Row>
      <Row label="Parts">
        <span style={{ color: parts.color, fontWeight: 600 }}>{parts.text}</span>
      </Row>
      <Row label="Joints">
        <span style={{ color: joints.color, fontWeight: 600 }}>{joints.text}</span>
      </Row>
      {diff.added_parts.length > 0 && (
        <Row label="Added">
          <span style={{ color: 'var(--ok)' }}>{diff.added_parts.join(', ')}</span>
        </Row>
      )}
      {diff.removed_parts.length > 0 && (
        <Row label="Removed">
          <span style={{ color: 'var(--danger)' }}>{diff.removed_parts.join(', ')}</span>
        </Row>
      )}
      {diff.moved_parts.length > 0 && (
        <Row label="Moved">
          <span style={{ color: 'var(--text-1)' }}>{diff.moved_parts.length} part(s)</span>
        </Row>
      )}
      {diff.failure_events.length > 0 && (
        <Row label="Failures">
          <span style={{ color: 'var(--warn)' }}>{diff.failure_events.join(', ')}</span>
        </Row>
      )}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ color: 'var(--text-2)' }}>{label}</span>
      <span style={{ textAlign: 'right' }}>{children}</span>
    </div>
  )
}

function Line({ label }: { label: string }) {
  return <div style={{ color: 'var(--text-2)', fontStyle: 'italic' }}>{label}</div>
}
