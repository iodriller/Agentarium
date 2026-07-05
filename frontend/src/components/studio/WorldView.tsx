import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import Phaser from 'phaser'
import type { EpisodeTrace } from '../../api/types'
import { TraceRenderer } from '../../phaser/TraceRenderer'
import { attachCameraControls } from '../../phaser/CameraControls'

interface WorldViewProps {
  trace: EpisodeTrace | null
  frameIndex: number
}

export interface WorldViewHandle {
  captureScreenshot: () => void
  recordWebm: (durationMs: number) => Promise<void>
}

function downloadHref(href: string, filename: string): void {
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

function webmMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  return [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ].find((type) => MediaRecorder.isTypeSupported(type))
}

export const WorldView = forwardRef<WorldViewHandle, WorldViewProps>(function WorldView(
  { trace, frameIndex },
  ref,
) {
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

  // Capture the current viewport as a PNG. Phaser's renderer.snapshot works for
  // both WebGL and Canvas renderers (it grabs during the render cycle, so it
  // doesn't need preserveDrawingBuffer).
  const handleScreenshot = () => {
    const game = gameRef.current
    if (!game) return
    game.renderer.snapshot((image) => {
      if (!(image instanceof HTMLImageElement)) return
      downloadHref(
        image.src,
        `agentarium-frame-${trace?.run_id ?? 'view'}-${frameIndex}.png`,
      )
    })
  }

  const recordWebm = (durationMs: number) => {
    const game = gameRef.current
    const canvas = game?.canvas as HTMLCanvasElement | undefined
    if (!canvas || typeof canvas.captureStream !== 'function') {
      return Promise.reject(new Error('Canvas video capture is not supported in this browser.'))
    }
    if (typeof MediaRecorder === 'undefined') {
      return Promise.reject(new Error('MediaRecorder is not supported in this browser.'))
    }

    const mimeType = webmMimeType()
    const stream = canvas.captureStream(30)
    const chunks: Blob[] = []
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)

    return new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        if (recorder.state !== 'inactive') recorder.stop()
      }, Math.max(1000, durationMs))

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data)
      }
      recorder.onerror = () => {
        window.clearTimeout(timeout)
        stream.getTracks().forEach((track) => track.stop())
        reject(new Error('Video recording failed.'))
      }
      recorder.onstop = () => {
        window.clearTimeout(timeout)
        stream.getTracks().forEach((track) => track.stop())
        if (chunks.length === 0) {
          reject(new Error('Video recording produced no frames.'))
          return
        }
        const blob = new Blob(chunks, { type: mimeType ?? 'video/webm' })
        const url = URL.createObjectURL(blob)
        downloadHref(url, `agentarium-replay-${trace?.run_id ?? 'view'}.webm`)
        window.setTimeout(() => URL.revokeObjectURL(url), 1000)
        resolve()
      }

      recorder.start(250)
    })
  }

  useImperativeHandle(ref, () => ({
    captureScreenshot: handleScreenshot,
    recordWebm,
  }))

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      {/* Camera control cluster (bottom-left). data-hide-for-capture lets a
          screenshot tool (e.g. regenerating preset preview images) hide this
          overlay so it doesn't show up on top of the rendered scene. */}
      <div
        data-hide-for-capture
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
        <CamButton label="⤓" title="Screenshot (PNG)" onClick={handleScreenshot} />
      </div>
    </div>
  )
})

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
