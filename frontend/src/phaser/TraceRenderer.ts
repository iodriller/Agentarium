import Phaser from 'phaser'
import type { BodyMeta, EpisodeTrace, StaticProp } from '../api/types'
import { colorForBody as kindColor, drawProp, isSemanticKind, sizePx } from './props'

// The simulation is a 2D side-view physics world (gravity pulls -y, things stack
// and fall). We render it as a straight side view — x to the right, y up — so a
// bridge looks like a bridge and a city like buildings on the ground. World units
// are metres; SCALE is px-per-metre at zoom 1, and the camera auto-fits.
const SCALE = 30

const AGENT_A = 0xa78bfa
const AGENT_B = 0x38bdf8
const NEUTRAL = 0x9aa4b2
const GRID_LINE = 0x232a36
const OUTLINE = 0x0b0e14

// Per-terrain ground + sky palette so picking a terrain visibly changes the world.
const TERRAIN: Record<string, { sky: number; ground: number; groundEdge: number }> = {
  grassland: { sky: 0x101826, ground: 0x3f6d2f, groundEdge: 0x2f5122 },
  desert: { sky: 0x1a1606, ground: 0xb07a36, groundEdge: 0x8a5d27 },
  factory: { sky: 0x14171c, ground: 0x4a4f57, groundEdge: 0x343941 },
  city: { sky: 0x0f1622, ground: 0x3a4658, groundEdge: 0x2a3340 },
  cave: { sky: 0x0a0a0c, ground: 0x2a2520, groundEdge: 0x1a1714 },
}

function colorForBody(id: string): number {
  const lower = id.toLowerCase()
  if (lower.includes('agent_a')) return AGENT_A
  if (lower.includes('agent_b')) return AGENT_B
  return NEUTRAL
}

function parseHexColor(color: string | null | undefined, fallback: number): number {
  if (!color) return fallback
  const named: Record<string, number> = {
    red: 0xef4444,
    blue: 0x3b82f6,
    green: 0x22c55e,
    yellow: 0xeab308,
    orange: 0xf97316,
  }
  if (named[color.toLowerCase()] != null) return named[color.toLowerCase()]
  const n = Number.parseInt(color.replace('#', ''), 16)
  return Number.isNaN(n) ? fallback : n
}

interface Bounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

/**
 * TraceRenderer renders an EpisodeTrace as a 2D side view. React calls its
 * imperative methods to load a trace, render a frame, and drive the camera.
 */
export class TraceRenderer extends Phaser.Scene {
  static readonly KEY = 'trace'

  private trace: EpisodeTrace | null = null
  private ready = false
  private pendingFrame: number | null = null

  private bgLayer!: Phaser.GameObjects.Graphics
  private staticLayer!: Phaser.GameObjects.Graphics
  private gridLayer!: Phaser.GameObjects.Graphics
  private bodyLayer!: Phaser.GameObjects.Container
  private bodies = new Map<string, Phaser.GameObjects.Graphics>()

  constructor() {
    super(TraceRenderer.KEY)
  }

  // Side-view projection: metres -> screen px (y inverted, screen-down positive).
  private static px(x: number, y: number): { sx: number; sy: number } {
    return { sx: x * SCALE, sy: -y * SCALE }
  }

  create(): void {
    this.bgLayer = this.add.graphics()
    this.gridLayer = this.add.graphics()
    this.staticLayer = this.add.graphics()
    this.bodyLayer = this.add.container(0, 0)
    this.ready = true
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
      let gfx = this.bodies.get(id)
      if (!gfx) {
        this.createBody(id)
        gfx = this.bodies.get(id)
      }
      if (!gfx) continue
      const { sx, sy } = TraceRenderer.px(body.x, body.y)
      gfx.setPosition(sx, sy)
      // Physics angle is CCW in y-up space; screen y is flipped, so negate.
      gfx.setRotation(-body.angle)
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
    cam.setZoom(Phaser.Math.Clamp(cam.zoom * factor, 0.1, 8))
  }

  resetCamera(): void {
    this.fitToWorld()
  }

  toggleGrid(): void {
    if (this.gridLayer) this.gridLayer.setVisible(!this.gridLayer.visible)
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private buildWorld(): void {
    const trace = this.trace
    if (!trace) return

    for (const gfx of this.bodies.values()) gfx.destroy()
    this.bodies.clear()
    this.bodyLayer.removeAll(true)
    this.staticLayer.clear()
    this.gridLayer.clear()
    this.bgLayer.clear()

    const bounds = this.worldBounds(trace)
    const pal = TERRAIN[trace.terrain ?? 'grassland'] ?? TERRAIN.grassland
    this.cameras.main.setBackgroundColor(pal.sky)

    this.drawGround(bounds, pal)
    this.drawGrid(bounds)
    for (const prop of trace.world_static ?? []) {
      if (prop.kind === 'ground') continue // we draw a richer ground band below
      if (prop.position && prop.position.length >= 2) this.drawStaticProp(prop)
    }

    const first = trace.frames[0]
    if (first) for (const id of Object.keys(first.bodies)) this.createBody(id)

    this.fitToWorld(bounds)
  }

  /** World extent in metres across terrain + props + first-frame bodies. */
  private worldBounds(trace: EpisodeTrace): Bounds {
    let minX = -8
    let maxX = 8
    let minY = 0
    let maxY = 6
    const grow = (x: number, y: number, rx = 0, ry = 0) => {
      minX = Math.min(minX, x - rx)
      maxX = Math.max(maxX, x + rx)
      minY = Math.min(minY, y - ry)
      maxY = Math.max(maxY, y + ry)
    }
    for (const p of trace.world_static ?? []) {
      if (!p.position || p.position.length < 2) continue
      const [w = 1, h = 1] = p.size ?? []
      grow(p.position[0], p.position[1], Math.max(w, h) / 2 + 0.5, Math.max(w, h) / 2 + 0.5)
    }
    const first = trace.frames[0]
    if (first) for (const b of Object.values(first.bodies)) grow(b.x, b.y, 1, 1)
    return { minX, maxX, minY, maxY }
  }

  private fitToWorld(bounds?: Bounds): void {
    const cam = this.cameras?.main
    if (!cam || !this.trace) return
    const b = bounds ?? this.worldBounds(this.trace)
    // Frame a little sky above and a strip of ground below so the world reads as
    // a grounded scene rather than a thin band floating in the middle.
    const pad = Math.max(1, (b.maxY - b.minY) * 0.18)
    const a = TraceRenderer.px(b.minX - 0.5, b.maxY + pad) // top-left in screen px
    const c = TraceRenderer.px(b.maxX + 0.5, b.minY - pad * 1.4) // bottom-right
    const worldW = Math.abs(c.sx - a.sx) || 1
    const worldH = Math.abs(c.sy - a.sy) || 1
    const vw = this.scale.width || 800
    const vh = this.scale.height || 600
    const zoom = Phaser.Math.Clamp(Math.min(vw / worldW, vh / worldH) * 0.95, 0.1, 8)
    cam.setZoom(zoom)
    cam.centerOn((a.sx + c.sx) / 2, (a.sy + c.sy) / 2)
  }

  private drawGround(b: Bounds, pal: { ground: number; groundEdge: number }): void {
    const g = this.staticLayer
    const left = b.minX * SCALE - 200
    const right = b.maxX * SCALE + 200
    const top = 0 // y=0 in screen px
    const bottom = -b.minY * SCALE + Math.abs(b.maxY - b.minY) * SCALE + 400
    g.fillStyle(pal.ground, 1)
    g.fillRect(left, top, right - left, bottom - top)
    g.lineStyle(3, pal.groundEdge, 1)
    g.lineBetween(left, top, right, top) // horizon line at y=0
  }

  private drawGrid(b: Bounds): void {
    const g = this.gridLayer
    g.lineStyle(1, GRID_LINE, 0.45)
    const x0 = Math.floor(b.minX) - 1
    const x1 = Math.ceil(b.maxX) + 1
    const y0 = Math.floor(b.minY) - 1
    const y1 = Math.ceil(b.maxY) + 1
    for (let x = x0; x <= x1; x += 2) {
      g.lineBetween(x * SCALE, -y0 * SCALE, x * SCALE, -y1 * SCALE)
    }
    for (let y = y0; y <= y1; y += 2) {
      g.lineBetween(x0 * SCALE, -y * SCALE, x1 * SCALE, -y * SCALE)
    }
  }

  /** Draw a static prop (box/segment/circle) to scale, rotated by its angle. */
  private drawStaticProp(prop: StaticProp): void {
    const g = this.staticLayer
    const [px, py] = prop.position
    const color = parseHexColor(prop.color, NEUTRAL)
    const ang = prop.angle ?? 0

    // Semantic kind (house/wall/bin/…) → a recognizable procedural prop.
    if (isSemanticKind(prop.kind)) {
      const meta = { shape: 'box', size: prop.size, color: prop.color, kind: prop.kind } as BodyMeta
      const { w, h } = sizePx(meta, SCALE)
      const { sx, sy } = TraceRenderer.px(px, py)
      g.save()
      g.translateCanvas(sx, sy)
      g.rotateCanvas(-ang)
      drawProp(g, prop.kind, w, h, kindColor(prop.id, meta))
      g.restore()
      return
    }

    g.fillStyle(color, 1)
    g.lineStyle(1.5, OUTLINE, 0.6)

    if (prop.kind === 'circle') {
      const r = (prop.size?.[0] ?? 0.5) * SCALE
      const { sx, sy } = TraceRenderer.px(px, py)
      g.fillCircle(sx, sy, r)
      g.strokeCircle(sx, sy, r)
      return
    }

    // box or segment → a (possibly thin) rotated rectangle.
    let w: number
    let h: number
    if (prop.kind === 'segment') {
      w = prop.size?.[0] ?? 1
      h = 0.25
    } else {
      w = prop.size?.[0] ?? 1
      h = prop.size?.[1] ?? 1
    }
    this.fillRotatedRect(g, px, py, w, h, ang)
  }

  /** Fill + outline a w×h rect (metres) centred at (px,py), rotated by `ang`. */
  private fillRotatedRect(
    g: Phaser.GameObjects.Graphics,
    px: number,
    py: number,
    w: number,
    h: number,
    ang: number,
  ): void {
    const hw = w / 2
    const hh = h / 2
    const cos = Math.cos(ang)
    const sin = Math.sin(ang)
    const corner = (dx: number, dy: number) => {
      const rx = dx * cos - dy * sin
      const ry = dx * sin + dy * cos
      return TraceRenderer.px(px + rx, py + ry)
    }
    const pts = [corner(-hw, hh), corner(hw, hh), corner(hw, -hh), corner(-hw, -hh)]
    g.beginPath()
    g.moveTo(pts[0].sx, pts[0].sy)
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].sx, pts[i].sy)
    g.closePath()
    g.fillPath()
    g.strokePath()
  }

  /** Create a dynamic body's graphics, drawn to its real shape/size/colour. */
  private createBody(id: string): void {
    const meta: BodyMeta | undefined = this.trace?.body_meta?.[id]
    const g = this.add.graphics()

    // Semantic kind (house/tower/tree/…) → a recognizable procedural prop.
    if (isSemanticKind(meta?.kind)) {
      const { w, h } = sizePx(meta, SCALE)
      drawProp(g, meta?.kind, w, h, kindColor(id, meta))
      this.bodyLayer.add(g)
      this.bodies.set(id, g)
      return
    }

    const fill = parseHexColor(meta?.color, colorForBody(id))
    g.fillStyle(fill, 1)
    g.lineStyle(2, 0xffffff, 0.4)

    const shape = meta?.shape ?? 'box'
    if (shape === 'circle') {
      const r = (meta?.size?.[0] ?? 0.5) * SCALE
      g.fillCircle(0, 0, r)
      g.lineStyle(2, OUTLINE, 0.5)
      g.strokeCircle(0, 0, r)
      // A spoke so rotation (rolling) is visible.
      g.lineStyle(2, 0xffffff, 0.5)
      g.lineBetween(0, 0, r, 0)
    } else if (shape === 'segment') {
      const len = (meta?.size?.[0] ?? 1) * SCALE
      const th = 0.25 * SCALE
      g.fillRect(-len / 2, -th / 2, len, th)
      g.lineStyle(2, OUTLINE, 0.5)
      g.strokeRect(-len / 2, -th / 2, len, th)
    } else {
      const w = (meta?.size?.[0] ?? 1) * SCALE
      const h = (meta?.size?.[1] ?? meta?.size?.[0] ?? 1) * SCALE
      g.fillRect(-w / 2, -h / 2, w, h)
      g.lineStyle(2, OUTLINE, 0.5)
      g.strokeRect(-w / 2, -h / 2, w, h)
    }

    this.bodyLayer.add(g)
    this.bodies.set(id, g)
  }
}
