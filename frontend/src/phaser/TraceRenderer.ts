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

// Default fill per semantic prop `kind` (overridden by an explicit prop/body color).
const KIND_COLORS: Record<string, number> = {
  house: 0xc97b4a,
  tower: 0x6b7686,
  shop: 0xd1a13b,
  tree: 0x3f7d3a,
  road: 0x2b2f36,
  park: 0x3f6d2f,
  water: 0x2f6fb0,
  goal: 0x22c55e,
}

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

    if ((trace.terrain ?? 'grassland') === 'city') this.drawCitySkyline(bounds)
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
      // Rotated axis-aligned half-extents — a wide flat prop (e.g. a 28m road)
      // must not inflate the Y bound as much as an equally large X bound would
      // (the old `max(w, h)` isotropic radius did exactly that, zooming the
      // whole scene out to fit a phantom square around every long thin prop).
      const w = p.size?.[0] ?? 1
      const h = p.kind === 'segment' ? 0.25 : (p.size?.[1] ?? p.size?.[0] ?? 1)
      const ang = p.angle ?? 0
      const hw = w / 2
      const hh = h / 2
      const rx = Math.abs(hw * Math.cos(ang)) + Math.abs(hh * Math.sin(ang)) + 0.5
      const ry = Math.abs(hw * Math.sin(ang)) + Math.abs(hh * Math.cos(ang)) + 0.5
      grow(p.position[0], p.position[1], rx, ry)
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

  /** Faint parallax building silhouettes behind the play area, for terrain=city. */
  private drawCitySkyline(b: Bounds): void {
    const g = this.bgLayer
    const pseudoRandom = (seed: number) => {
      const x = Math.sin(seed * 12.9898) * 43758.5453
      return x - Math.floor(x)
    }
    const spanL = b.minX - 6
    const spanR = b.maxX + 6
    const width = Math.max(1, spanR - spanL)
    const count = 14
    g.fillStyle(0x1c2433, 0.55)
    for (let i = 0; i < count; i++) {
      const t = i / count
      const bx = spanL + t * width + (pseudoRandom(i) - 0.5) * (width / count) * 0.6
      const bw = 1.5 + pseudoRandom(i + 50) * 2.0
      const bh = 3 + pseudoRandom(i + 100) * 8
      const topLeft = TraceRenderer.px(bx - bw / 2, bh)
      const bottomRight = TraceRenderer.px(bx + bw / 2, 0)
      g.fillRect(
        topLeft.sx,
        topLeft.sy,
        bottomRight.sx - topLeft.sx,
        bottomRight.sy - topLeft.sy,
      )
    }
  }

  /**
   * Draw a body/prop with a shape matching its semantic `kind` (house roof,
   * tree canopy, road markings, …) instead of a plain rectangle. All drawing
   * is procedural (no assets). Returns false for an unrecognized/absent kind
   * so the caller falls back to the plain box/circle/segment rendering.
   * `(px, py)` are the shape's centre — world metres for static props, or
   * (0, 0) for a dynamic body's own local origin (both use the same
   * `TraceRenderer.px` scale+flip, so one implementation serves both).
   */
  private drawByKind(
    g: Phaser.GameObjects.Graphics,
    kind: string | undefined,
    px: number,
    py: number,
    w: number,
    h: number,
    ang: number,
    colorOverride?: string | null,
  ): boolean {
    if (!kind || !(kind in KIND_COLORS)) return false
    const tint = parseHexColor(colorOverride, KIND_COLORS[kind])

    if (kind === 'tree') {
      const trunkColor = 0x6b4a2f
      const trunkW = Math.max(w * 0.25, 0.15)
      const trunkH = h * 0.4
      g.fillStyle(trunkColor, 1)
      this.fillRotatedRect(g, px, py - h / 2 + trunkH / 2, trunkW, trunkH, 0)
      const r = (Math.max(w, 0.5) / 2) * SCALE
      const { sx, sy } = TraceRenderer.px(px, py - h / 2 + trunkH + r / SCALE * 0.6)
      g.fillStyle(tint, 1)
      g.fillCircle(sx, sy, r)
      g.lineStyle(1.5, OUTLINE, 0.5)
      g.strokeCircle(sx, sy, r)
      return true
    }

    if (kind === 'road') {
      g.fillStyle(tint, 1)
      this.fillRotatedRect(g, px, py, w, h, ang)
      const cos = Math.cos(ang)
      const sin = Math.sin(ang)
      const dashLen = 0.6
      const gap = 0.4
      g.lineStyle(Math.max(1, h * SCALE * 0.15), 0xd6c66b, 0.9)
      let t = -w / 2
      while (t < w / 2) {
        const t2 = Math.min(t + dashLen, w / 2)
        const a = TraceRenderer.px(px + t * cos, py + t * sin)
        const c = TraceRenderer.px(px + t2 * cos, py + t2 * sin)
        g.lineBetween(a.sx, a.sy, c.sx, c.sy)
        t += dashLen + gap
      }
      return true
    }

    if (kind === 'park' || kind === 'water') {
      g.fillStyle(tint, 1)
      g.lineStyle(1.5, OUTLINE, 0.4)
      this.fillRotatedRect(g, px, py, w, h, ang)
      return true
    }

    if (kind === 'goal') {
      g.fillStyle(0x888888, 1)
      this.fillRotatedRect(g, px, py, Math.max(w * 0.15, 0.08), h, 0)
      const base = TraceRenderer.px(px, py + h / 2)
      const mid = TraceRenderer.px(px, py + h / 2 - h * 0.3)
      const tip = TraceRenderer.px(px + w * 0.8, py + h / 2 - h * 0.15)
      g.fillStyle(tint, 1)
      g.fillTriangle(base.sx, base.sy, mid.sx, mid.sy, tip.sx, tip.sy)
      return true
    }

    // house | tower | shop
    g.fillStyle(tint, 1)
    g.lineStyle(1.5, OUTLINE, 0.6)
    this.fillRotatedRect(g, px, py, w, h, ang)
    if (Math.abs(ang) < 0.05) {
      this.drawWindows(g, px, py, w, h)
      if (kind === 'house') {
        const roofColor = 0x7a3b2e
        const apex = TraceRenderer.px(px, py + h / 2 + w * 0.35)
        const left = TraceRenderer.px(px - w / 2 - 0.1, py + h / 2)
        const right = TraceRenderer.px(px + w / 2 + 0.1, py + h / 2)
        g.fillStyle(roofColor, 1)
        g.fillTriangle(left.sx, left.sy, right.sx, right.sy, apex.sx, apex.sy)
        g.lineStyle(1.5, OUTLINE, 0.5)
        g.strokeTriangle(left.sx, left.sy, right.sx, right.sy, apex.sx, apex.sy)
      }
    }
    return true
  }

  /** A small grid of window rects on a building face, upright only (ang≈0). */
  private drawWindows(
    g: Phaser.GameObjects.Graphics,
    px: number,
    py: number,
    w: number,
    h: number,
  ): void {
    const cols = Math.max(1, Math.floor(w / 0.8))
    const rows = Math.max(1, Math.floor(h / 1.0))
    const winW = (w / cols) * 0.5
    const winH = (h / rows) * 0.45
    g.fillStyle(0xf5e08a, 0.75)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const wx = px - w / 2 + (c + 0.5) * (w / cols)
        const wy = py - h / 2 + (r + 0.5) * (h / rows)
        const { sx, sy } = TraceRenderer.px(wx, wy)
        g.fillRect(sx - (winW * SCALE) / 2, sy - (winH * SCALE) / 2, winW * SCALE, winH * SCALE)
      }
    }
  }

  /** Draw a static prop to scale, rotated by its angle — a recognizable shape
   * for a semantic `kind` (house/road/tree/…), else a plain box/circle/segment. */
  private drawStaticProp(prop: StaticProp): void {
    const g = this.staticLayer
    const [px, py] = prop.position
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

    const w = prop.size?.[0] ?? 1
    g.lineStyle(1.5, OUTLINE, 0.6)

    if (prop.kind === 'circle') {
      const r = (prop.size?.[0] ?? 0.5) * SCALE
      const { sx, sy } = TraceRenderer.px(px, py)
      g.fillCircle(sx, sy, r)
      g.strokeCircle(sx, sy, r)
      return
    }

    // box or segment → a (possibly thin) rotated rectangle.
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
