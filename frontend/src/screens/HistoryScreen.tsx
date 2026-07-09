import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import type { RunSummary } from '../api/types'
import { RunRelaunchActions } from '../components/shared/RunRelaunchActions'
import { TopBar } from '../components/shared/TopBar'

export function HistoryScreen() {
  const navigate = useNavigate()
  const [history, setHistory] = useState<RunSummary[]>([])
  const [board, setBoard] = useState<RunSummary[]>([])
  const [challenge, setChallenge] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [reachable, setReachable] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    const q = challenge ? `?challenge=${encodeURIComponent(challenge)}` : ''
    Promise.all([
      api.get<RunSummary[]>('/runs/history?limit=100'),
      api.get<RunSummary[]>(`/runs/leaderboard${q}`),
    ])
      .then(([h, b]) => {
        if (cancelled) return
        setHistory(h)
        setBoard(b)
        setReachable(true)
      })
      .catch(() => !cancelled && setReachable(false))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [challenge])

  // Distinct challenges seen, for the leaderboard filter.
  const challenges = Array.from(
    new Set(history.map((r) => r.challenge).filter((c): c is string => !!c)),
  ).sort()

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <TopBar
        projectName="Run History"
        status={reachable === null ? 'connecting' : reachable ? 'online' : 'offline'}
      />

      <div
        style={{
          padding: '16px 24px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface-1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-1)' }}>Run History</h1>
          <p style={{ fontSize: 12, color: 'var(--text-2)' }}>
            One row per launch (best attempt shown) — click to replay and browse its attempts.
          </p>
        </div>
        <button onClick={() => navigate('/setup')} style={primaryBtn()}>
          + New Run
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Leaderboard */}
        <div
          style={{
            width: 320,
            flexShrink: 0,
            borderRight: '1px solid var(--border)',
            padding: 16,
            overflowY: 'auto',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <SectionLabel>Leaderboard</SectionLabel>
            <select
              value={challenge}
              onChange={(e) => setChallenge(e.target.value)}
              style={selectStyle()}
            >
              <option value="">All challenges</option>
              {challenges.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          {board.length === 0 ? (
            <Empty text={loading ? 'Loading…' : 'No scored runs yet.'} />
          ) : (
            board.map((r, i) => (
              <div
                key={r.run_id}
                onClick={() => navigate(`/studio/${r.run_id}`)}
                style={rowBtn()}
              >
                <span style={{ width: 22, color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>
                  #{i + 1}
                </span>
                <span style={{ flex: 1, textAlign: 'left', color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.challenge ?? '—'}
                </span>
                <span style={{ color: 'var(--accent)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {r.score_total?.toFixed(1) ?? '—'}
                </span>
                <RunRelaunchActions
                  runId={r.run_id}
                  compact
                  align="left"
                  disabled={!r.config_available}
                />
              </div>
            ))
          )}
        </div>

        {/* History table */}
        <div style={{ flex: 1, padding: 16, overflowY: 'auto' }}>
          <SectionLabel>Recent Runs</SectionLabel>
          {reachable === false ? (
            <Empty text="Couldn't reach the server. Is it running?" tone="var(--danger)" />
          ) : history.length === 0 ? (
            <Empty text={loading ? 'Loading…' : 'No runs yet — launch one from Setup.'} />
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ color: 'var(--text-2)', textAlign: 'left' }}>
                  <Th>Challenge</Th>
                  <Th>Mode</Th>
                  <Th>Reward</Th>
                  <Th>Best Score</Th>
                  <Th>Attempts</Th>
                  <Th>Result</Th>
                  <Th>When</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {history.map((r) => (
                  <tr
                    key={r.run_id}
                    onClick={() => navigate(`/studio/${r.run_id}`)}
                    style={{ cursor: 'pointer', borderTop: '1px solid var(--border)' }}
                  >
                    <Td color="var(--text-1)">{r.challenge ?? '—'}</Td>
                    <Td>{r.mode ?? '—'}</Td>
                    <Td>{r.reward ?? '—'}</Td>
                    <Td color="var(--accent)">{r.score_total?.toFixed(1) ?? '—'}</Td>
                    <Td>{r.attempt_count ?? 1}</Td>
                    <Td color={r.success ? 'var(--ok)' : 'var(--text-2)'}>
                      {r.success == null ? '—' : r.success ? '✓ success' : 'no'}
                    </Td>
                    <Td>{fmtTime(r.created_at)}</Td>
                    <td style={{ padding: '6px 8px' }}>
                      <RunRelaunchActions
                        runId={r.run_id}
                        compact
                        disabled={!r.config_available}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

function fmtTime(epoch?: number | null): string {
  if (!epoch) return '—'
  const d = new Date(epoch * 1000)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ padding: '6px 8px', fontWeight: 600 }}>{children}</th>
}
function Td({ children, color }: { children: React.ReactNode; color?: string }) {
  return <td style={{ padding: '6px 8px', color: color ?? 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>{children}</td>
}
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
      {children}
    </div>
  )
}
function Empty({ text, tone }: { text: string; tone?: string }) {
  return (
    <div style={{ padding: 16, borderRadius: 6, border: '1px dashed var(--border)', color: tone ?? 'var(--text-2)', fontSize: 12, textAlign: 'center', marginTop: 8 }}>
      {text}
    </div>
  )
}
function primaryBtn(): React.CSSProperties {
  return { padding: '7px 14px', borderRadius: 6, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }
}
function rowBtn(): React.CSSProperties {
  return { width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', marginBottom: 2, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--surface-1)', fontSize: 12, cursor: 'pointer' }
}
function selectStyle(): React.CSSProperties {
  return { background: 'var(--surface-2)', color: 'var(--text-1)', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 6px', fontSize: 11 }
}
