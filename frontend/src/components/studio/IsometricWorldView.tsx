import { useEffect, useRef } from 'react'
import Phaser from 'phaser'
import type { EpisodeTrace } from '../../api/types'
import { TraceRenderer } from '../../phaser/TraceRenderer'
import { attachCameraControls } from '../../phaser/CameraControls'

interface IsometricWorldViewProps {
  trace: EpisodeTrace | null
  frameIndex: number
}

export function IsometricWorldView({ trace, frameIndex }: IsometricWorldViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const gameRef = useRef<Phaser.Game | null>(null)
  const sceneRef = useRef<TraceRenderer | null>(null)
  const detachControlsRef = useRef<(() => void) | null>(null)

  // Create the Phaser.Game exactly once (guard against StrictMode double-mount).
  useEffect(() => {
    const container = containerRef.current
    if (!container || gameRef.current) return

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: container,
      backgroundColor: '#1a1f29', // --surface-2
      transparent: false,
      scale: {
        mode: Phaser.Scale.RESIZE,
        width: container.clientWidth || 800,
        height: container.clientHeight || 600,
      },
      scene: [TraceRenderer],
    })
    gameRef.current = game

    // Grab the live scene instance once it has booted.
    game.events.once(Phaser.Core.Events.READY, () => {
      const scene = game.scene.getScene(TraceRenderer.KEY) as TraceRenderer | null
      if (!scene) return
      sceneRef.current = scene

      const wire = () => {
        detachControlsRef.current = attachCameraControls(scene)
        if (trace) scene.loadTrace(trace)
        scene.renderFrame(frameIndex)
      }
      if (scene.scene.isActive()) {
        wire()
      } else {
        scene.events.once(Phaser.Scenes.Events.CREATE, wire)
      }
    })

    return () => {
      detachControlsRef.current?.()
      detachControlsRef.current = null
      sceneRef.current = null
      game.destroy(true)
      gameRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load a new trace when it changes.
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene || !trace) return
    scene.loadTrace(trace)
  }, [trace])

  // Render the requested frame whenever the index changes.
  useEffect(() => {
    sceneRef.current?.renderFrame(frameIndex)
  }, [frameIndex])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      {/* Camera control cluster (bottom-left). */}
      <div
        style={{
          position: 'absolute',
          left: 12,
          bottom: 12,
          display: 'flex',
          gap: 6,
        }}
      >
        <CamButton label="−" title="Zoom out" onClick={() => sceneRef.current?.zoomBy(0.85)} />
        <CamButton label="+" title="Zoom in" onClick={() => sceneRef.current?.zoomBy(1.18)} />
        <CamButton label="◄" title="Pan left" onClick={() => sceneRef.current?.panBy(-40, 0)} />
        <CamButton label="►" title="Pan right" onClick={() => sceneRef.current?.panBy(40, 0)} />
        <CamButton label="▲" title="Pan up" onClick={() => sceneRef.current?.panBy(0, -40)} />
        <CamButton label="▼" title="Pan down" onClick={() => sceneRef.current?.panBy(0, 40)} />
        <CamButton label="⟳" title="Reset camera" onClick={() => sceneRef.current?.resetCamera()} />
        <CamButton label="#" title="Toggle grid" onClick={() => sceneRef.current?.toggleGrid()} />
      </div>
    </div>
  )
}

function CamButton({
  label,
  title,
  onClick,
}: {
  label: string
  title: string
  onClick: () => void
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        width: 28,
        height: 28,
        borderRadius: 6,
        border: '1px solid var(--border)',
        background: 'var(--surface-1)',
        color: 'var(--text-1)',
        fontSize: 13,
        lineHeight: 1,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {label}
    </button>
  )
}
