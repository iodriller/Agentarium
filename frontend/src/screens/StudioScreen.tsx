import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { TopBar } from '../components/shared/TopBar'
import { IsometricWorldView } from '../components/studio/IsometricWorldView'
import { PlaybackToolbar } from '../components/studio/PlaybackToolbar'
import { ReplayTimeline } from '../components/studio/ReplayTimeline'
import { api } from '../api/client'
import type { EpisodeTrace, CreateRunResponse } from '../api/types'

export function StudioScreen() {
  const { runId } = useParams<{ runId: string }>()

  const [trace, setTrace] = useState<EpisodeTrace | null>(null)
  const [frameIndex, setFrameIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  const totalFrames = trace?.frames.length ?? 0

  // ── Fetch a trace on mount. Fall back to a demo run for dev convenience. ────
  useEffect(() => {
    let cancelled = false

    async function loadTrace() {
      setStatus('loading')
      try {
        let id = runId
        if (!id) {
          const created = await api.post<CreateRunResponse>('/runs', {})
          id = created.run_id
        }
        let fetched: EpisodeTrace
        try {
          fetched = await api.get<EpisodeTrace>(`/runs/${id}/trace`)
        } catch {
          // The run id may be stale/invalid — spin up a demo run and retry.
          const created = await api.post<CreateRunResponse>('/runs', {})
          fetched = await api.get<EpisodeTrace>(`/runs/${created.run_id}/trace`)
        }
        if (cancelled) return
        setTrace(fetched)
        setFrameIndex(0)
        setPlaying(true)
        setStatus('ready')
      } catch {
        if (cancelled) return
        setStatus('error')
      }
    }

    loadTrace()
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

      // Consume whole-frame steps from the accumulator.
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
  const handleSeek = (index: number) => {
    setFrameIndex(index)
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <TopBar projectName="Creature Builder Lab" />

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
            color: status === 'error' ? 'var(--danger)' : 'var(--ok)',
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
              background: status === 'error' ? 'var(--danger)' : 'var(--ok)',
              display: 'inline-block',
            }}
          />
          {status === 'loading' ? 'Loading…' : status === 'error' ? 'Trace unavailable' : 'Ready'}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-2)' }}>
          run: {trace?.run_id ?? runId ?? '—'}
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
          <RailSection title="Challenge" />
          <RailSection title="Agent Status" />
          <RailSection title="Score Card" />
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
          <div style={{ flex: 1, background: 'var(--surface-2)', position: 'relative', overflow: 'hidden' }}>
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
            <TelemetryCard title="Score over Attempts" />
            <TelemetryCard title="Metrics over Time" borderLeft />
            <TelemetryCard title="Latest Attempt Summary" borderLeft />
          </div>
        </div>

        {/* Right rail — tools, log, design, replay */}
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
          <RailSection title="Available Tools" />
          <RailSection title="Tool Call Log" />
          <RailSection title="Design Summary" />
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

function RailSection({ title }: { title: string }) {
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
        {title}
      </div>
      <div
        style={{
          padding: 10,
          borderRadius: 6,
          border: '1px dashed var(--border)',
          color: 'var(--text-2)',
          fontSize: 11,
          textAlign: 'center',
        }}
      >
        {title}
      </div>
    </div>
  )
}

function TelemetryCard({ title, borderLeft }: { title: string; borderLeft?: boolean }) {
  return (
    <div
      style={{
        padding: 10,
        borderLeft: borderLeft ? '1px solid var(--border)' : undefined,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {title}
      </span>
      <div
        style={{
          flex: 1,
          borderRadius: 4,
          border: '1px dashed var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-2)',
          fontSize: 11,
        }}
      >
        chart
      </div>
    </div>
  )
}
