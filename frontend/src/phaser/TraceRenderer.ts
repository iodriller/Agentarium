import Phaser from 'phaser'
import type { EpisodeTrace, StaticProp } from '../api/types'
import { isoProject, TILE_H } from './iso'

// Body tint by association. Trace frames don't carry created_by, so we infer
// from the body id where possible and otherwise fall back to a neutral grey.
const AGENT_A = 0xa78bfa
const AGENT_B = 0x38bdf8
const NEUTRAL = 0x9aa4b2
const GROUND_TOP = 0x2a3340
const GROUND_SIDE = 0x1a212b
const GRID_LINE = 0x232a36

function colorForBody(id: string): number {
  const lower = id.toLowerCase()
  if (lower.startsWith('agent_a') || lower.includes('agent_a')) return AGENT_A
  if (lower.startsWith('agent_b') || lower.includes('agent_b')) return AGENT_B
  return NEUTRAL
}

function parseHexColor(color: string | null | undefined, fallback: number): number {
  if (!color) return fallback
  const m = color.replace('#', '')
  const n = Number.parseInt(m, 16)
  return Number.isNaN(n) ? fallback : n
}

/**
 * TraceRenderer is a self-contained Phaser scene that renders an EpisodeTrace in
 * an isometric world. It exposes imperative methods that React calls to load a
 * trace, render a specific frame, and drive the camera.
 */
export class TraceRenderer extends Phaser.Scene {
  static readonly KEY = 'trace'

  private trace: EpisodeTrace | null = null
  private ready = false
  private pendingFrame: number | null = null

  private staticLayer!: Phaser.GameObjects.Graphics
  private gridLayer!: Phaser.GameObjects.Graphics
  private bodyLayer!: Phaser.GameObjects.Container
  private bodies = new Map<string, Phaser.GameObjects.Graphics>()

  // World-space origin offset (screen px) so the iso world sits centered.
  private originX = 0
  private originY = 0

  constructor() {
    super(TraceRenderer.KEY)
  }

  create(): void {
    this.gridLayer = this.add.graphics()
    this.staticLayer = this.add.graphics()
    this.bodyLayer = this.add.container(0, 0)

    this.ready = true
    this.resetCamera()

    if (this.trace) {
      this.buildWorld()
      this.renderFrame(this.pendingFrame ?? 0)
      this.pendingFrame = null
    }
  }

  // ── Imperative API (called from React) ───────────────────────────────────

  loadTrace(trace: EpisodeTrace): void {
    this.trace = trace
    if (!this.ready) {
      this.pendingFrame = 0
      return
    }
    this.buildWorld()
    this.renderFrame(0)
  }

  renderFrame(index: number): void {
    if (!this.ready) {
      this.pendingFrame = index
      return
    }
    const trace = this.trace
    if (!trace || trace.frames.length === 0) return

    const clamped = Math.max(0, Math.min(index, trace.frames.length - 1))
    const frame = trace.frames[clamped]

    for (const [id, body] of Object.entries(frame.bodies)) {
      const gfx = this.bodies.get(id)
      if (!gfx) continue
      const { sx, sy } = isoProject(body.x, body.y)
      gfx.setPosition(this.originX + sx, this.originY + sy)
      gfx.setRotation(body.angle)
    }
  }

  panBy(dx: number, dy: number): void {
    const cam = this.cameras?.main
    if (!cam) return
    cam.scrollX -= dx / cam.zoom
    cam.scrollY -= dy / cam.zoom
  }

  zoomBy(factor: number): void {
    const cam = this.cameras?.main
    if (!cam) return
    const next = Phaser.Math.Clamp(cam.zoom * factor, 0.25, 4)
    cam.setZoom(next)
  }

  resetCamera(): void {
    const cam = this.cameras?.main
    if (!cam) return
    cam.setZoom(1)
    // Center the world origin in the viewport.
    this.originX = 0
    this.originY = 0
    cam.centerOn(0, 0)
    if (this.trace && this.ready) this.recenterOnWorld()
  }

  toggleGrid(): void {
    if (!this.gridLayer) return
    this.gridLayer.setVisible(!this.gridLayer.visible)
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private buildWorld(): void {
    const trace = this.trace
    if (!trace) return

    // Reset existing body objects.
    for (const gfx of this.bodies.values()) gfx.destroy()
    this.bodies.clear()
    this.bodyLayer.removeAll(true)
    this.staticLayer.clear()
    this.gridLayer.clear()

    this.drawGrid()
    for (const prop of trace.world_static) this.drawStaticProp(prop)

    // Create a graphics object per body, seeded from the first frame's set of ids.
    const first = trace.frames[0]
    if (first) {
      for (const id of Object.keys(first.bodies)) {
        this.createBody(id)
      }
    }

    this.recenterOnWorld()
  }

  private recenterOnWorld(): void {
    const cam = this.cameras?.main
    if (!cam) return
    cam.centerOn(this.originX, this.originY + TILE_H)
  }

  private drawGrid(): void {
    const g = this.gridLayer
    g.lineStyle(1, GRID_LINE, 0.5)
    const span = 12
    for (let i = -span; i <= span; i++) {
      const a = isoProject(i, -span)
      const b = isoProject(i, span)
      g.lineBetween(this.originX + a.sx, this.originY + a.sy, this.originX + b.sx, this.originY + b.sy)
      const c = isoProject(-span, i)
      const d = isoProject(span, i)
      g.lineBetween(this.originX + c.sx, this.originY + c.sy, this.originX + d.sx, this.originY + d.sy)
    }
  }

  private drawStaticProp(prop: StaticProp): void {
    const g = this.staticLayer
    const [px, py] = prop.position
    const [w = 4, h = 1] = prop.size ?? []
    const topColor = parseHexColor(prop.color, prop.kind === 'ground' ? GROUND_TOP : NEUTRAL)

    // Draw the prop footprint as an iso quad (a band of ground tiles).
    const halfW = w / 2
    const halfH = Math.max(h, 0.5) / 2

    // Four corners of the footprint rectangle in physics space, projected to iso.
    const corners = [
      isoProject(px - halfW, py + halfH),
      isoProject(px + halfW, py + halfH),
      isoProject(px + halfW, py - halfH),
      isoProject(px - halfW, py - halfH),
    ].map((p) => ({ x: this.originX + p.sx, y: this.originY + p.sy }))

    // Side wall for a touch of depth.
    const depth = TILE_H * Math.max(h, 0.5)
    g.fillStyle(GROUND_SIDE, 1)
    g.beginPath()
    g.moveTo(corners[0].x, corners[0].y)
    g.lineTo(corners[1].x, corners[1].y)
    g.lineTo(corners[1].x, corners[1].y + depth)
    g.lineTo(corners[0].x, corners[0].y + depth)
    g.closePath()
    g.fillPath()

    // Top face.
    g.fillStyle(topColor, 1)
    g.beginPath()
    g.moveTo(corners[0].x, corners[0].y)
    for (let i = 1; i < corners.length; i++) g.lineTo(corners[i].x, corners[i].y)
    g.closePath()
    g.fillPath()

    g.lineStyle(1, 0x000000, 0.25)
    g.strokePath()
  }

  private createBody(id: string): void {
    const tint = colorForBody(id)
    const g = this.add.graphics()
    const size = 22
    const half = size / 2

    // A simple iso-ish block: a tinted rounded rectangle with a darker base edge.
    g.fillStyle(0x000000, 0.25)
    g.fillRoundedRect(-half, -half + 4, size, size, 5)
    g.fillStyle(tint, 1)
    g.fillRoundedRect(-half, -half, size, size, 5)
    g.lineStyle(1.5, 0xffffff, 0.35)
    g.strokeRoundedRect(-half, -half, size, size, 5)

    g.setVisible(true)
    this.bodyLayer.add(g)
    this.bodies.set(id, g)
  }
}
