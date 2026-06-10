import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { TopBar } from '../components/shared/TopBar'
import { IsometricWorldView } from '../components/studio/IsometricWorldView'
import { PlaybackToolbar } from '../components/studio/PlaybackToolbar'
import { ReplayTimeline } from '../components/studio/ReplayTimeline'
import { ChallengeBriefing } from '../components/studio/ChallengeBriefing'
import { AgentStatusPanel, type AgentInfo } from '../components/studio/AgentStatusPanel'
import { ScoreCardTable } from '../components/studio/ScoreCardTable'
import { ToolCallLog } from '../components/studio/ToolCallLog'
import { DesignSummaryPanel } from '../components/studio/DesignSummaryPanel'
import { TelemetryPanel, type AttemptScore } from '../components/studio/TelemetryPanel'
import { api, wsUrl } from '../api/client'
import type {
  CreateRunResponse,
  DesignSummary,
  EpisodeTrace,
  RunEvent,
  ScoreCard,
  ToolCallRecord,
} from '../api/types'

export function StudioScreen() {
  const { runId } = useParams<{ runId: string }>()

  // ── Playback state (drives the Phaser replay) ──────────────────────────────
  const [trace, setTrace] = useState<EpisodeTrace | null>(null)
  const [frameIndex, setFrameIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  // ── Live run state (fed by the WebSocket) ──────────────────────────────────
  const [runStatus, setRunStatus] = useState<'connecting' | 'running' | 'finished'>('connecting')
  const [challengeName, setChallengeName] = useState('')
  const [objective, setObjective] = useState('')
  const [toolLog, setToolLog] = useState<ToolCallRecord[]>([])
  // The agent whose score/metrics/design last updated — drives the "latest"
  // displays. Falls back to the first agent.
  const [latestAgentId, setLatestAgentId] = useState<string | null>(null)
  const [latestAttemptIndex, setLatestAttemptIndex] = useState<number | null>(null)
  const [winnerAgentId, setWinnerAgentId] = useState<string | null>(null)
  // Per-agent live state, keyed by agent_id. Single-agent runs use one key.
  const [designByAgent, setDesignByAgent] = useState<Record<string, DesignSummary>>({})
  const [latestScoreByAgent, setLatestScoreByAgent] = useState<Record<string, ScoreCard>>({})
  const [bestScoreByAgent, setBestScoreByAgent] = useState<Record<string, number>>({})
  const [attemptsByAgent, setAttemptsByAgent] = useState<Record<string, AttemptScore[]>>({})
  const DEFAULT_AGENTS: AgentInfo[] = [{ id: 'agent_a', name: 'Agent A', role: 'builder' }]
  const [agents, setAgents] = useState<AgentInfo[]>(DEFAULT_AGENTS)

  // Resolve the "latest" agent (last to update), then its derived displays.
  const activeAgentId = latestAgentId ?? agents[0]?.id ?? null
  const designSummary = activeAgentId ? (designByAgent[activeAgentId] ?? null) : null
  const latestScore = activeAgentId ? (latestScoreByAgent[activeAgentId] ?? null) : null
  const latestAgentName =
    agents.find((a) => a.id === activeAgentId)?.name ?? activeAgentId ?? ''

  const totalFrames = trace?.frames.length ?? 0

  // ── WebSocket subscription (live runs) ─────────────────────────────────────
  // Open exactly once per runId; tolerate StrictMode double-mount + close.
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!runId) return
    let cancelled = false

    // Fetch a trace by run id and auto-play it in the Phaser replay.
    const loadTrace = async (traceRunId: string) => {
      try {
        const fetched = await api.get<EpisodeTrace>(`/runs/${traceRunId}/trace`)
        if (cancelled) return
        setTrace(fetched)
        setFrameIndex(0)
        setPlaying(true)
        setStatus('ready')
      } catch {
        if (!cancelled) setStatus('error')
      }
    }

    const handleEvent = (event: RunEvent) => {
      switch (event.type) {
        case 'run_started':
          setChallengeName(event.project_name)
          setObjective(event.objective)
          setRunStatus('running')
          if (event.agents && event.agents.length > 0) {
            setAgents(event.agents.map((a) => ({ id: a.id, name: a.name, role: a.role })))
          }
          break
        case 'tool_call':
          setToolLog((prev) => [...prev, event.record])
          break
        case 'design_update': {
          const id = event.agent_id ?? agents[0]?.id ?? 'agent_a'
          setDesignByAgent((prev) => ({ ...prev, [id]: event.summary }))
          setLatestAgentId(id)
          break
        }
        case 'trace_ready':
          void loadTrace(event.trace_run_id)
          break
        case 'score': {
          const id = event.agent_id ?? agents[0]?.id ?? 'agent_a'
          setLatestScoreByAgent((prev) => ({ ...prev, [id]: event.scorecard }))
          setBestScoreByAgent((prev) => ({
            ...prev,
            [id]: Math.max(prev[id] ?? -Infinity, event.scorecard.score_total),
          }))
          setLatestAgentId(id)
          setLatestAttemptIndex(event.attempt_index)
          setAttemptsByAgent((prev) => {
            const series = (prev[id] ?? []).filter((a) => a.index !== event.attempt_index)
            series.push({ index: event.attempt_index, scorecard: event.scorecard })
            series.sort((a, b) => a.index - b.index)
            return { ...prev, [id]: series }
          })
          break
        }
        case 'winner':
          setWinnerAgentId(event.agent_id)
          break
        case 'run_finished':
          if (event.winner_agent_id) setWinnerAgentId(event.winner_agent_id)
          setRunStatus('finished')
          break
        case 'error':
          setStatus('error')
          break
        default:
          break
      }
    }

    const ws = new WebSocket(wsUrl(`/runs/${runId}`))
    wsRef.current = ws

    ws.onopen = () => {
      if (!cancelled) setRunStatus('running')
    }

    ws.onmessage = (msg) => {
      if (cancelled) return
      let event: RunEvent
      try {
        event = JSON.parse(msg.data) as RunEvent
      } catch {
        return
      }
      handleEvent(event)
    }

    ws.onerror = () => {
      if (!cancelled) setStatus('error')
    }

    return () => {
      cancelled = true
      wsRef.current = null
      // 1000 = normal closure; tolerate sockets already closed after run_finished.
      try {
        ws.close(1000)
      } catch {
        /* already closed */
      }
    }
  }, [runId])

  // ── Dev fallback: no runId → spin up a demo run so the world still moves. ───
  useEffect(() => {
    if (runId) return
    let cancelled = false
    async function loadDemo() {
      setStatus('loading')
      try {
        const created = await api.post<CreateRunResponse>('/runs', {})
        const fetched = await api.get<EpisodeTrace>(`/runs/${created.run_id}/trace`)
        if (cancelled) return
        setTrace(fetched)
        setFrameIndex(0)
        setPlaying(true)
        setStatus('ready')
        setRunStatus('finished')
      } catch {
        if (!cancelled) setStatus('error')
      }
    }
    loadDemo()
    return () => {
      cancelled = true
    }
  }, [runId])

  // ── Playback loop: advance frameIndex while playing, looping at the end. ────
  const rafRef = useRef<number | null>(null)
  const lastTsRef = useRef<number | null>(null)
  const accRef = useRef(0)

  useEffect(() => {
    if (!playing || !trace || trace.frames.length <= 1) return

    const dt = trace.dt > 0 ? trace.dt : 1 / 60

    const tick = (ts: number) => {
      if (lastTsRef.current == null) lastTsRef.current = ts
      const elapsed = (ts - lastTsRef.current) / 1000
      lastTsRef.current = ts
      accRef.current += elapsed * speed

      let advance = 0
      while (accRef.current >= dt) {
        accRef.current -= dt
        advance++
      }
      if (advance > 0) {
        setFrameIndex((prev) => (prev + advance) % trace.frames.length)
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      lastTsRef.current = null
      accRef.current = 0
    }
  }, [playing, trace, speed])

  const handleTogglePlay = () => setPlaying((p) => !p)
  const handleStop = () => {
    setPlaying(false)
    setFrameIndex(0)
  }
  const handleSeek = (index: number) => setFrameIndex(index)

  const running = runStatus === 'running' || runStatus === 'connecting'

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <TopBar projectName={challengeName || 'Creature Builder Lab'} />

      {/* Studio header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '8px 16px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface-1)',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
          Simulation World
        </span>
        <span
          style={{
            fontSize: 11,
            color: status === 'error' ? 'var(--danger)' : running ? 'var(--warn)' : 'var(--ok)',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background:
                status === 'error' ? 'var(--danger)' : running ? 'var(--warn)' : 'var(--ok)',
              display: 'inline-block',
            }}
          />
          {status === 'error'
            ? 'Run error'
            : runStatus === 'connecting'
              ? 'Connecting…'
              : runStatus === 'running'
                ? 'Building…'
                : 'Finished'}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-2)' }}>
          run: {runId ?? trace?.run_id ?? '—'}
        </span>
      </div>

      {/* Three-region layout */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left rail — briefing & agent status */}
        <div
          style={{
            width: 280,
            flexShrink: 0,
            borderRight: '1px solid var(--border)',
            padding: 12,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <ChallengeBriefing
            challengeName={challengeName}
            objective={objective}
            reward="distance_plus_stability"
          />
          <AgentStatusPanel
            agents={agents}
            designByAgent={designByAgent}
            latestScoreByAgent={latestScoreByAgent}
            winnerAgentId={winnerAgentId}
            running={running}
          />
          <ScoreCardTable
            agents={agents}
            latestScoreByAgent={latestScoreByAgent}
            bestScoreByAgent={bestScoreByAgent}
            winnerAgentId={winnerAgentId}
          />
        </div>

        {/* Center — toolbar + isometric viewport + telemetry */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <PlaybackToolbar
            playing={playing}
            onTogglePlay={handleTogglePlay}
            onStop={handleStop}
            speed={speed}
            onSpeedChange={setSpeed}
            frameIndex={frameIndex}
            totalFrames={totalFrames}
          />

          {/* Viewport */}
          <div
            style={{
              flex: 1,
              background: 'var(--surface-2)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <IsometricWorldView trace={trace} frameIndex={frameIndex} />
          </div>

          {/* Telemetry strip */}
          <div
            style={{
              height: 160,
              flexShrink: 0,
              borderTop: '1px solid var(--border)',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              background: 'var(--surface-1)',
            }}
          >
            <TelemetryPanel
              agents={agents}
              attemptsByAgent={attemptsByAgent}
              latest={latestScore}
              latestAgentName={latestAgentName}
              latestAttemptIndex={latestAttemptIndex}
              running={running}
            />
          </div>
        </div>

        {/* Right rail — log, design, replay */}
        <div
          style={{
            width: 300,
            flexShrink: 0,
            borderLeft: '1px solid var(--border)',
            padding: 12,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <ToolCallLog records={toolLog} onClear={() => setToolLog([])} />
          <DesignSummaryPanel
            summary={designSummary}
            onExport={() => alert('Export coming soon')}
          />
          <ReplayTimeline
            frameIndex={frameIndex}
            totalFrames={totalFrames}
            playing={playing}
            onSeek={handleSeek}
            onTogglePlay={handleTogglePlay}
            speed={speed}
          />
        </div>
      </div>
    </div>
  )
}
