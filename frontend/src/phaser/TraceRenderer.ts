import Phaser from 'phaser'
import type { BodyMeta, EpisodeTrace, StaticProp } from '../api/types'
import {
  computeStreetFurniture,
  drawIsoFurniture,
  drawIsoGroundTiles,
  drawIsoIntersectionPatch,
  drawIsoProp,
  isoColorForBody,
  isoFootprint,
  isoProject,
  roadOverlap,
  seedFromId,
} from './isoProps'
import { colorForBody as kindColor, drawProp, isSemanticKind, shade, sizePx } from './props'

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

// Ground-plane bounds for the isometric (citysim) path — (x, z) instead of (x, y).
interface IsoBounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
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

  private skyLayer!: Phaser.GameObjects.Graphics
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
    // Added first so it always renders behind bgLayer/staticLayer/bodyLayer
    // (insertion order = draw order). Screen-fixed (scroll factor 0) so the
    // sky doesn't pan/zoom with the camera.
    this.skyLayer = this.add.graphics()
    this.skyLayer.setScrollFactor(0)
    this.bgLayer = this.add.graphics()
    this.gridLayer = this.add.graphics()
    this.staticLayer = this.add.graphics()
    this.bodyLayer = this.add.container(0, 0)
    this.ready = true
    // Keep the iso sky backdrop sized to the viewport across a resize.
    this.scale.on('resize', () => {
      if (this.trace && (this.trace.camera ?? 'side') === 'iso') {
        this.drawIsoSky(TERRAIN[this.trace.terrain ?? 'city'] ?? TERRAIN.city)
      }
    })
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
    if ((trace.camera ?? 'side') === 'iso') {
      this.renderIsoFrame(index)
      return
    }
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
    if ((this.trace?.camera ?? 'side') === 'iso') {
      this.isoFitToWorld()
      return
    }
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
    this.skyLayer.clear()

    if ((trace.camera ?? 'side') === 'iso') {
      this.buildIsoWorld()
      return
    }

    const bounds = this.worldBounds(trace)
    const pal = TERRAIN[trace.terrain ?? 'grassland'] ?? TERRAIN.grassland
    this.cameras.main.setBackgroundColor(pal.sky)

    if ((trace.terrain ?? 'grassland') === 'city') this.drawCitySkyline(bounds)
    this.drawGround(bounds, trace, pal)
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

  /** Ground is drawn per span (from `world_static` "ground" props), not as one
   * continuous band, so a world with a real gap (a bridge's ravine) shows sky/
   * chasm between cliffs instead of hiding it under a solid floor. */
  private drawGround(b: Bounds, trace: EpisodeTrace, pal: { ground: number; groundEdge: number }): void {
    const g = this.staticLayer
    const top = 0 // y=0 in screen px
    const bottom = -b.minY * SCALE + Math.abs(b.maxY - b.minY) * SCALE + 400

    const spans = (trace.world_static ?? [])
      .filter((p) => p.kind === 'ground' && p.position && p.position.length >= 2)
      .map((p) => {
        const half = (p.size?.[0] ?? 1) / 2
        return { lo: p.position[0] - half, hi: p.position[0] + half }
      })
      .sort((x, y) => x.lo - y.lo)

    if (spans.length === 0) {
      // No ground info (shouldn't happen) — fall back to a full-bleed band so
      // the scene never renders as blank sky.
      const left = b.minX * SCALE - 200
      const right = b.maxX * SCALE + 200
      g.fillStyle(pal.ground, 1)
      g.fillRect(left, top, right - left, bottom - top)
      g.lineStyle(3, pal.groundEdge, 1)
      g.lineBetween(left, top, right, top)
      return
    }

    for (const span of spans) {
      const left = span.lo * SCALE - 4
      const right = span.hi * SCALE + 4
      g.fillStyle(pal.ground, 1)
      g.fillRect(left, top, right - left, bottom - top)
      g.lineStyle(3, pal.groundEdge, 1)
      g.lineBetween(left, top, right, top)
    }

    // Ravine: a hazard/water band filling the horizontal gap between
    // consecutive spans, from the horizon down to kill_y (or a sensible
    // default depth when the world didn't declare one).
    const chasmFloorY = trace.kill_y ?? Math.min(b.minY - 2, -4)
    for (let i = 0; i < spans.length - 1; i++) {
      const gapLo = spans[i].hi
      const gapHi = spans[i + 1].lo
      if (gapHi <= gapLo) continue
      this.drawChasm(gapLo * SCALE, gapHi * SCALE, top, -chasmFloorY * SCALE)
    }
  }

  /** Hazard band for a ground gap: dark water fill + a warning-colored top edge
   * so the ravine reads as "do not fall here", not empty background. */
  private drawChasm(leftPx: number, rightPx: number, topPx: number, bottomPx: number): void {
    const g = this.staticLayer
    g.fillStyle(0x0c2333, 1)
    g.fillRect(leftPx, topPx, rightPx - leftPx, bottomPx - topPx)
    g.fillStyle(0x1c5a7a, 0.5)
    for (let x = leftPx; x < rightPx; x += 14) {
      g.fillRect(x, topPx + 6, 8, 3)
    }
    g.lineStyle(2, 0xf59e0b, 0.9)
    g.lineBetween(leftPx, topPx, rightPx, topPx)
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

  /** Draw a static prop to scale, rotated by its angle — a recognizable shape
   * for a semantic `kind` (house/road/tree/…), else a plain box/circle/segment. */
  private drawStaticProp(prop: StaticProp): void {
    const g = this.staticLayer
    const [px, py] = prop.position
    const ang = prop.angle ?? 0

    // Semantic kind (house/wall/bin/…) → a recognizable procedural prop.
    if (isSemanticKind(prop.kind)) {
      // The real geometry (box/circle/segment) — a beam/ramp/wall is a thin
      // segment sized by length alone, not a square built from that length.
      const meta = { shape: prop.shape ?? 'box', size: prop.size, color: prop.color, kind: prop.kind } as BodyMeta
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
    const h = prop.kind === 'segment' ? 0.25 : (prop.size?.[1] ?? prop.size?.[0] ?? 1)
    const color = parseHexColor(prop.color, NEUTRAL)
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

  // ── Isometric (citysim) path ──────────────────────────────────────────────
  // A separate code path from the side-view methods above: ground-plane (x, z)
  // instead of (x, y), painter's-algorithm depth sorting, and extruded-box
  // props via isoProps.ts. Kept parallel rather than merged into the side-view
  // methods so the well-exercised physics replay path is untouched.

  private isoWorldBounds(trace: EpisodeTrace): IsoBounds {
    let minX = -8
    let maxX = 8
    let minZ = -8
    let maxZ = 8
    const grow = (x: number, z: number, r = 1) => {
      minX = Math.min(minX, x - r)
      maxX = Math.max(maxX, x + r)
      minZ = Math.min(minZ, z - r)
      maxZ = Math.max(maxZ, z + r)
    }
    for (const p of trace.world_static ?? []) {
      if (!p.position || p.position.length < 1) continue
      const { w, d } = isoFootprint(p.size)
      grow(p.position[0], p.z ?? 0, Math.max(w, d) / 2 + 0.5)
    }
    const first = trace.frames[0]
    if (first) for (const b of Object.values(first.bodies)) grow(b.x, b.z ?? 0, 1)
    return { minX, maxX, minZ, maxZ }
  }

  private isoMaxHeight(trace: EpisodeTrace): number {
    let maxHeight = 4
    for (const p of trace.world_static ?? []) {
      const { h } = isoFootprint(p.size)
      maxHeight = Math.max(maxHeight, h)
    }
    return maxHeight
  }

  private isoFitToWorld(bounds?: IsoBounds): void {
    const cam = this.cameras?.main
    const trace = this.trace
    if (!cam || !trace) return
    const b = bounds ?? this.isoWorldBounds(trace)
    const maxHeight = this.isoMaxHeight(trace)
    const corners = [
      isoProject(b.minX, b.minZ, 0),
      isoProject(b.maxX, b.minZ, 0),
      isoProject(b.minX, b.maxZ, 0),
      isoProject(b.maxX, b.maxZ, 0),
      isoProject(b.minX, b.minZ, maxHeight),
      isoProject(b.maxX, b.minZ, maxHeight),
      isoProject(b.minX, b.maxZ, maxHeight),
      isoProject(b.maxX, b.maxZ, maxHeight),
    ]
    const minSx = Math.min(...corners.map((p) => p.sx))
    const maxSx = Math.max(...corners.map((p) => p.sx))
    const minSy = Math.min(...corners.map((p) => p.sy))
    const maxSy = Math.max(...corners.map((p) => p.sy))
    const pad = 60
    const worldW = Math.max(maxSx - minSx + pad * 2, 1)
    const worldH = Math.max(maxSy - minSy + pad * 2, 1)
    const vw = this.scale.width || 800
    const vh = this.scale.height || 600
    const zoom = Phaser.Math.Clamp(Math.min(vw / worldW, vh / worldH) * 0.95, 0.1, 8)
    cam.setZoom(zoom)
    cam.centerOn((minSx + maxSx) / 2, (minSy + maxSy) / 2)
  }

  /** Screen-fixed vertical sky gradient behind the whole iso scene. */
  private drawIsoSky(pal: { sky: number; ground: number }): void {
    const g = this.skyLayer
    g.clear()
    const w = this.scale.width || 800
    const h = this.scale.height || 600
    const zenith = shade(pal.sky, 0.65)
    const horizon = shade(pal.sky, 1.7)
    g.fillGradientStyle(zenith, zenith, horizon, horizon, 1)
    g.fillRect(0, 0, w, h)
  }

  /** Textured ground (grass mottling + sidewalks bordering roads), plus a
   * defining outer edge so the world reads as a bounded plot, not a void. */
  private drawIsoGround(b: IsoBounds, pal: { ground: number; groundEdge: number }, roads: StaticProp[]): void {
    const g = this.staticLayer
    drawIsoGroundTiles(g, b, pal.ground, roads)

    const corners = [
      isoProject(b.minX, b.minZ, 0),
      isoProject(b.maxX, b.minZ, 0),
      isoProject(b.maxX, b.maxZ, 0),
      isoProject(b.minX, b.maxZ, 0),
    ]
    g.lineStyle(2, pal.groundEdge, 0.6)
    g.beginPath()
    g.moveTo(corners[0].sx, corners[0].sy)
    for (let i = 1; i < corners.length; i++) g.lineTo(corners[i].sx, corners[i].sy)
    g.closePath()
    g.strokePath()
  }

  /** Draw one static prop's extruded iso shape, translated to its ground point. */
  private drawIsoStaticProp(prop: StaticProp): void {
    const g = this.staticLayer
    const { w, d, h } = isoFootprint(prop.size)
    const color = isoColorForBody(prop.id, prop)
    const origin = isoProject(prop.position[0] ?? 0, prop.z ?? 0, 0)
    g.save()
    g.translateCanvas(origin.sx, origin.sy)
    drawIsoProp(g, prop.kind, w, d, h, color, seedFromId(prop.id))
    g.restore()
  }

  /** Paved patches over every road-road intersection, drawn after all road
   * props so they sit cleanly on top of both crossing segments' markings. */
  private drawIsoIntersections(roads: StaticProp[]): void {
    const g = this.staticLayer
    for (let i = 0; i < roads.length; i++) {
      for (let j = i + 1; j < roads.length; j++) {
        const overlap = roadOverlap(roads[i], roads[j])
        if (!overlap) continue
        const topY = Math.max(isoFootprint(roads[i].size).h, isoFootprint(roads[j].size).h)
        drawIsoIntersectionPatch(g, overlap.cx, overlap.cz, overlap.w, overlap.d, topY)
      }
    }
  }

  /** Streetlights/parked cars scattered along road edges — decorative only,
   * derived client-side from the trace's own roads/buildings (never sent to
   * or from the backend), same spirit as the side view's parallax skyline. */
  private drawIsoStreetFurniture(roads: StaticProp[], buildings: StaticProp[]): void {
    const g = this.staticLayer
    const items = computeStreetFurniture(roads, buildings)
    const sorted = [...items].sort((a, b) => a.x + a.z - (b.x + b.z))
    sorted.forEach((item, i) => {
      const origin = isoProject(item.x, item.z, 0)
      g.save()
      g.translateCanvas(origin.sx, origin.sy)
      drawIsoFurniture(g, item, i)
      g.restore()
    })
  }

  private buildIsoWorld(): void {
    const trace = this.trace
    if (!trace) return

    const bounds = this.isoWorldBounds(trace)
    const pal = TERRAIN[trace.terrain ?? 'city'] ?? TERRAIN.city
    this.cameras.main.setBackgroundColor(pal.sky)
    this.drawIsoSky(pal)

    const allProps = (trace.world_static ?? []).filter((p) => p.position && p.position.length >= 1)
    const roads = allProps.filter((p) => p.kind === 'road')
    const buildings = allProps.filter((p) => p.kind !== 'road')

    this.drawIsoGround(bounds, pal, roads)

    // Painter's algorithm: draw back-to-front by ground-plane depth (x + z),
    // so nearer structures correctly occlude farther ones.
    const props = [...allProps].sort(
      (a, b) => a.position[0] + (a.z ?? 0) - (b.position[0] + (b.z ?? 0)),
    )
    for (const prop of props) this.drawIsoStaticProp(prop)

    this.drawIsoIntersections(roads)
    this.drawIsoStreetFurniture(roads, buildings)

    const first = trace.frames[0]
    if (first) {
      const ids = Object.keys(first.bodies).sort((a, b) => {
        const ba = first.bodies[a]
        const bb = first.bodies[b]
        return ba.x + (ba.z ?? 0) - (bb.x + (bb.z ?? 0))
      })
      for (const id of ids) this.createIsoBody(id)
    }

    this.isoFitToWorld(bounds)
  }

  /** Create a dynamic iso body's graphics (unused by CityEngine today — it has
   * no rigid-body motion — but supported for a future engine that animates
   * ground-plane movement, e.g. cars/pedestrians). */
  private createIsoBody(id: string): void {
    const meta: BodyMeta | undefined = this.trace?.body_meta?.[id]
    const g = this.add.graphics()
    const { w, d, h } = isoFootprint(meta?.size)
    const color = isoColorForBody(id, meta)
    drawIsoProp(g, meta?.kind, w, d, h, color, seedFromId(id))
    this.bodyLayer.add(g)
    this.bodies.set(id, g)
  }

  private renderIsoFrame(index: number): void {
    const trace = this.trace
    if (!trace || trace.frames.length === 0) return
    const clamped = Math.max(0, Math.min(index, trace.frames.length - 1))
    const frame = trace.frames[clamped]
    for (const [id, body] of Object.entries(frame.bodies)) {
      let gfx = this.bodies.get(id)
      if (!gfx) {
        this.createIsoBody(id)
        gfx = this.bodies.get(id)
      }
      if (!gfx) continue
      const { sx, sy } = isoProject(body.x, body.z ?? 0, 0)
      gfx.setPosition(sx, sy)
    }
  }
}
