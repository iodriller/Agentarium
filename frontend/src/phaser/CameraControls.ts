import Phaser from 'phaser'
import type { TraceRenderer } from './TraceRenderer'

/**
 * Wires mouse drag-to-pan and wheel-to-zoom onto a TraceRenderer scene's camera.
 * Returns a disposer that removes the listeners.
 */
export function attachCameraControls(scene: TraceRenderer): () => void {
  const input = scene.input

  let dragging = false
  let lastX = 0
  let lastY = 0

  const onDown = (pointer: Phaser.Input.Pointer) => {
    dragging = true
    lastX = pointer.x
    lastY = pointer.y
  }

  const onUp = () => {
    dragging = false
  }

  const onMove = (pointer: Phaser.Input.Pointer) => {
    if (!dragging) return
    const dx = pointer.x - lastX
    const dy = pointer.y - lastY
    lastX = pointer.x
    lastY = pointer.y
    scene.panBy(dx, dy)
  }

  const onWheel = (
    _pointer: Phaser.Input.Pointer,
    _objs: unknown,
    _dx: number,
    dy: number,
  ) => {
    scene.zoomBy(dy > 0 ? 0.9 : 1.1)
  }

  input.on('pointerdown', onDown)
  input.on('pointerup', onUp)
  input.on('pointerupoutside', onUp)
  input.on('pointermove', onMove)
  input.on('wheel', onWheel)

  return () => {
    input.off('pointerdown', onDown)
    input.off('pointerup', onUp)
    input.off('pointerupoutside', onUp)
    input.off('pointermove', onMove)
    input.off('wheel', onWheel)
  }
}
