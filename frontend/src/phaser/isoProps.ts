// Isometric (2:1 dimetric) prop drawing for `citysim` traces (camera === 'iso').
//
// Ground-plane axes (x, z) project to screen X; height (y) projects to screen
// Y (up = -screen y). Every drawer receives METRE dimensions and draws
// relative to a LOCAL origin already translated to the structure's ground
// point (see TraceRenderer) — `isoOffset` converts a (dx, dz, dy) offset from
// that origin into local screen pixels, so callers never juggle world
// coordinates directly. Procedural, asset-free — same philosophy as props.ts,
// just projected in 3D instead of drawn flat.

import type Phaser from 'phaser'
import type { BodyMeta, StaticProp, VisualSpec, VisualStyle } from '../api/types'
import { shade } from './props'
import { materialColor } from './visualTheme'

export const ISO_SCALE = 26 // px per metre, ground-plane axes
export const ISO_HEIGHT_SCALE = 26 // px per metre, vertical axis

// One consistent light direction for every extruded shape: top face is the
// base color, the +x face is medium-shaded, the +z (front) face is darkest.
// Strong contrast is deliberate — a subtle 0.9/0.8 split reads as flat gray
// at typical zoom; a punchy split is what makes an iso box read as a solid.
const FACE_TOP = 1.0
const FACE_RIGHT = 0.66
const FACE_FRONT = 0.4

const NEUTRAL = 0x9aa4b2
const AGENT_A = 0xa78bfa
const AGENT_B = 0x38bdf8

const NAMED: Record<string, number> = {
  red: 0xef4444,
  blue: 0x3b82f6,
  green: 0x22c55e,
  yellow: 0xeab308,
  orange: 0xf97316,
}

// Palette per semantic kind — mirrors props.ts's KIND_COLOR plus the new
// citysim-only kinds (apartment/factory/school/hospital/power_plant/fountain).
const KIND_COLOR: Record<string, number> = {
  house: 0xd9a066,
  apartment: 0xc084fc,
  shop: 0x60a5fa,
  tower: 0x9b8ab0,
  factory: 0x78716c,
  school: 0xf87171,
  hospital: 0xf1f5f9,
  power_plant: 0x64748b,
  tree: 0x4a8c4a,
  road: 0x55606e,
  park: 0x4f8a4a,
  plaza: 0x6b7280,
  fountain: 0x38bdf8,
  water: 0x3b82c4,
  crate: 0xc08a4a,
}

const ISO_KINDS = new Set(Object.keys(KIND_COLOR))

export function isIsoKind(kind: string | null | undefined): boolean {
  return !!kind && ISO_KINDS.has(kind)
}

function parseColor(color: string | null | undefined): number | null {
  if (!color) return null
  if (NAMED[color.toLowerCase()] != null) return NAMED[color.toLowerCase()]
  const n = Number.parseInt(color.replace('#', ''), 16)
  return Number.isNaN(n) ? null : n
}

/** Base fill: explicit color > kind palette > agent tint (from id) > neutral. */
export function isoColorForBody(id: string, meta: BodyMeta | StaticProp | undefined): number {
  const explicit = parseColor(meta?.color)
  if (explicit !== null) return explicit
  const kind = meta?.kind
  if (kind && KIND_COLOR[kind] !== undefined) return KIND_COLOR[kind]
  const lower = id.toLowerCase()
  if (lower.includes('agent_a')) return AGENT_A
  if (lower.includes('agent_b')) return AGENT_B
  return NEUTRAL
}

/** World-metre footprint (w, d, h) for a citysim prop: size = [width, height, depth]. */
export function isoFootprint(size: number[] | undefined): { w: number; d: number; h: number } {
  const s = size ?? []
  const w = Math.max(s[0] ?? 1, 0.1)
  const h = Math.max(s[1] ?? 1, 0.1)
  const d = Math.max(s[2] ?? w, 0.1)
  return { w, d, h }
}

/** Deterministic 0..1 pseudo-random value from a seed (no Math.random — a
 * trace must render identically every time it's replayed). */
export function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

/** Deterministic numeric seed from a body id, for per-building variety
 * (window pattern, tuft placement, tree shape) that stays stable on replay. */
export function seedFromId(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h
}

/** World-space screen offset (px) for a point `(dx, dz, dy)` relative to a
 * structure's ground-plane origin — see the module doc for the projection. */
export function isoOffset(dx: number, dz: number, dy: number): { sx: number; sy: number } {
  return {
    sx: (dx - dz) * ISO_SCALE,
    sy: (dx + dz) * (ISO_SCALE / 2) - dy * ISO_HEIGHT_SCALE,
  }
}

/** Absolute screen position (px) of ground-plane point `(x, z)` at height `y`. */
export function isoProject(x: number, z: number, y: number): { sx: number; sy: number } {
  return isoOffset(x, z, y)
}

type Pt = { sx: number; sy: number }
type G = Phaser.GameObjects.Graphics

export type IsoRenderOptions = Pick<
  VisualSpec,
  'variant' | 'material' | 'condition' | 'seed' | 'emission' | 'animation_state'
> & {
  style?: VisualStyle
  time?: number
  shadowAlpha?: number
}

function fillQuad(g: G, pts: Pt[], color: number, alpha = 1): void {
  g.fillStyle(color, alpha)
  g.lineStyle(1, 0x000000, 0.22)
  g.beginPath()
  g.moveTo(pts[0].sx, pts[0].sy)
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].sx, pts[i].sy)
  g.closePath()
  g.fillPath()
  g.strokePath()
}

/** A soft shadow quad on the ground, offset toward a fixed light direction and
 * scaled a bit by height so tall structures cast a visibly longer shadow. */
function drawIsoShadow(g: G, w: number, d: number, h: number, alpha = 0.38): void {
  const hw = w / 2
  const hd = d / 2
  const off = Math.min(h * 0.32, 2.6)
  const corners = [
    isoOffset(-hw, -hd, 0),
    isoOffset(hw, -hd, 0),
    isoOffset(hw, hd, 0),
    isoOffset(-hw, hd, 0),
  ].map((p) => ({ sx: p.sx + off * ISO_SCALE * 0.6, sy: p.sy + off * ISO_HEIGHT_SCALE * 0.32 }))
  g.fillStyle(0x000000, alpha)
  g.beginPath()
  g.moveTo(corners[0].sx, corners[0].sy)
  for (let i = 1; i < corners.length; i++) g.lineTo(corners[i].sx, corners[i].sy)
  g.closePath()
  g.fillPath()
}

/** The three visible faces of a box (w × d footprint, h tall), base raised to
 * `yBase` — centered at the local origin's ground point. Top (lightest), +x
 * face, +z face (darkest) — the one consistent light direction (FACE_*). */
function drawIsoExtrudedBox(
  g: G,
  w: number,
  d: number,
  h: number,
  color: number,
  yBase = 0,
): void {
  const hw = w / 2
  const hd = d / 2
  const base = {
    bl: isoOffset(-hw, -hd, yBase),
    br: isoOffset(hw, -hd, yBase),
    fr: isoOffset(hw, hd, yBase),
    fl: isoOffset(-hw, hd, yBase),
  }
  const top = {
    bl: isoOffset(-hw, -hd, yBase + h),
    br: isoOffset(hw, -hd, yBase + h),
    fr: isoOffset(hw, hd, yBase + h),
    fl: isoOffset(-hw, hd, yBase + h),
  }
  fillQuad(g, [top.bl, top.br, top.fr, top.fl], shade(color, FACE_TOP))
  fillQuad(g, [top.br, top.fr, base.fr, base.br], shade(color, FACE_RIGHT))
  fillQuad(g, [top.fr, top.fl, base.fl, base.fr], shade(color, FACE_FRONT))
}

/** A pitched-roof cap: a ridge along the z-axis raised above the flat top. */
function drawIsoRoof(g: G, w: number, d: number, h: number, color: number): void {
  const hw = w / 2
  const hd = d / 2
  const ridgeH = h + Math.max(w, 1) * 0.4
  const ridgeFront = isoOffset(0, hd, ridgeH)
  const ridgeBack = isoOffset(0, -hd, ridgeH)
  const topL = isoOffset(-hw, hd, h)
  const topR = isoOffset(hw, hd, h)
  const topRBack = isoOffset(hw, -hd, h)
  fillQuad(g, [ridgeFront, ridgeBack, topRBack, topR], shade(color, FACE_RIGHT))
  fillQuad(g, [ridgeFront, topL, topR], shade(color, FACE_FRONT))
}

/** A window grid on the +x (right) face — reads as an apartment/tower. A
 * fraction of windows are "dark" (unlit) per `seed`, so a row of buildings
 * doesn't look like identical clones. */
function drawIsoWindows(g: G, w: number, d: number, h: number, seed: number): void {
  const hd = d / 2
  const rows = Math.max(2, Math.floor(h / 2))
  const cols = Math.max(1, Math.floor(w / 1.4))
  const rowH = h / (rows + 1)
  for (let i = 1; i <= rows; i++) {
    for (let c = 0; c < cols; c++) {
      const lit = pseudoRandom(seed + i * 13.7 + c * 31.1) > 0.3
      g.fillStyle(lit ? 0xffe9a8 : 0x2b3140, lit ? 0.85 : 0.6)
      const zt = -hd * 0.7 + (c + 0.5) * ((hd * 1.4) / cols)
      const y = i * rowH
      const a = isoOffset(w / 2, zt - (hd * 0.5) / cols, y - rowH * 0.16)
      const b = isoOffset(w / 2, zt + (hd * 0.5) / cols, y - rowH * 0.16)
      const c2 = isoOffset(w / 2, zt + (hd * 0.5) / cols, y + rowH * 0.16)
      const d2 = isoOffset(w / 2, zt - (hd * 0.5) / cols, y + rowH * 0.16)
      g.beginPath()
      g.moveTo(a.sx, a.sy)
      g.lineTo(b.sx, b.sy)
      g.lineTo(c2.sx, c2.sy)
      g.lineTo(d2.sx, d2.sy)
      g.closePath()
      g.fillPath()
    }
  }
}

/** Window rows and a centered door on the front (+z) face. */
function drawIsoFrontFacade(g: G, w: number, d: number, h: number, seed: number): void {
  const hw = w / 2
  const hd = d / 2 + 0.015
  const cols = Math.max(1, Math.floor(w / 1.25))
  const rows = Math.max(1, Math.floor(h / 2))
  const cellW = w / cols
  const cellH = h / (rows + 1)
  for (let row = 1; row <= rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (row === 1 && col === Math.floor(cols / 2)) continue
      const x0 = -hw + col * cellW + cellW * 0.22
      const x1 = -hw + (col + 1) * cellW - cellW * 0.22
      const y = row * cellH
      fillQuad(
        g,
        [
          isoOffset(x0, hd, y - cellH * 0.18),
          isoOffset(x1, hd, y - cellH * 0.18),
          isoOffset(x1, hd, y + cellH * 0.18),
          isoOffset(x0, hd, y + cellH * 0.18),
        ],
        pseudoRandom(seed + row * 19 + col * 7) > 0.28 ? 0xffe6a6 : 0x25334a,
        0.86,
      )
    }
  }
  const doorW = Math.min(w * 0.24, 0.9)
  const doorH = Math.min(h * 0.28, 1.8)
  fillQuad(
    g,
    [
      isoOffset(-doorW / 2, hd, 0.05),
      isoOffset(doorW / 2, hd, 0.05),
      isoOffset(doorW / 2, hd, doorH),
      isoOffset(-doorW / 2, hd, doorH),
    ],
    0x27364a,
    0.95,
  )
}

function drawIsoFloorBands(g: G, w: number, d: number, h: number): void {
  const floors = Math.max(2, Math.floor(h / 2.2))
  g.lineStyle(1.5, 0xe2e8f0, 0.28)
  for (let i = 1; i < floors; i++) {
    const y = (i * h) / floors
    const frontA = isoOffset(-w / 2, d / 2 + 0.02, y)
    const frontB = isoOffset(w / 2, d / 2 + 0.02, y)
    const rightB = isoOffset(w / 2 + 0.02, -d / 2, y)
    g.lineBetween(frontA.sx, frontA.sy, frontB.sx, frontB.sy)
    g.lineBetween(frontB.sx, frontB.sy, rightB.sx, rightB.sy)
  }
}

function drawIsoRoofEquipment(g: G, w: number, d: number, h: number, seed: number): void {
  const units = 1 + (seed % 2)
  for (let i = 0; i < units; i++) {
    const ox = -w * 0.18 + i * w * 0.32
    const oz = -d * 0.12
    drawIsoExtrudedBoxAt(
      g,
      ox,
      oz,
      Math.max(0.35, w * 0.18),
      Math.max(0.3, d * 0.18),
      Math.max(0.25, h * 0.055),
      0x64748b,
      h,
    )
  }
}

function drawIsoFactoryFacade(g: G, w: number, d: number, h: number): void {
  const hd = d / 2 + 0.02
  const doorW = w * 0.48
  const doorH = h * 0.58
  fillQuad(
    g,
    [
      isoOffset(-doorW / 2, hd, 0.05),
      isoOffset(doorW / 2, hd, 0.05),
      isoOffset(doorW / 2, hd, doorH),
      isoOffset(-doorW / 2, hd, doorH),
    ],
    0x303945,
    0.95,
  )
  g.lineStyle(1, 0xaab4bf, 0.55)
  for (let i = 1; i < 5; i++) {
    const y = (i * doorH) / 5
    const a = isoOffset(-doorW / 2, hd + 0.01, y)
    const b = isoOffset(doorW / 2, hd + 0.01, y)
    g.lineBetween(a.sx, a.sy, b.sx, b.sy)
  }
  const sign = isoOffset(0, hd + 0.02, h * 0.82)
  g.fillStyle(0xfbbf24, 0.9)
  g.fillTriangle(sign.sx, sign.sy - 7, sign.sx - 7, sign.sy + 6, sign.sx + 7, sign.sy + 6)
}

/** A wide, striped awning band across the +z (front) face, over a bright
 * storefront glass band beneath it — the single boldest cue that reads as
 * "shop" rather than "generic box." Sized generously (a third of the
 * facade) since a thin band disappears at typical zoom. */
function drawIsoAwning(g: G, w: number, d: number, h: number): void {
  const hw = w / 2
  const hd = d / 2
  const bandH = Math.max(h * 0.3, 0.5)
  const top = h
  const bottom = h - bandH
  // Alternating red/white stripes (a classic storefront awning), each drawn
  // as its own quad along the face.
  const stripes = Math.max(3, Math.round(w / 0.6))
  for (let i = 0; i < stripes; i++) {
    const x0 = -hw + (i * w) / stripes
    const x1 = -hw + ((i + 1) * w) / stripes
    fillQuad(
      g,
      [
        isoOffset(x0, hd, top),
        isoOffset(x1, hd, top),
        isoOffset(x1, hd, bottom),
        isoOffset(x0, hd, bottom),
      ],
      i % 2 === 0 ? 0xdc2626 : 0xf8fafc,
      1,
    )
  }
  // A thin dark trim under the awning's front lip.
  const a = isoOffset(-hw, hd, bottom)
  const b = isoOffset(hw, hd, bottom)
  g.lineStyle(2, 0x1f2937, 0.8)
  g.lineBetween(a.sx, a.sy, b.sx, b.sy)
  // Bright ground-floor storefront glass filling most of the rest of the face.
  fillQuad(
    g,
    [
      isoOffset(-hw * 0.82, hd, bottom - 0.08),
      isoOffset(hw * 0.82, hd, bottom - 0.08),
      isoOffset(hw * 0.82, hd, 0.15),
      isoOffset(-hw * 0.82, hd, 0.15),
    ],
    0xbae6fd,
    0.8,
  )
}

/** A small extra chimney box near one corner + a rising smoke wisp — reads as
 * a factory/power plant. */
function drawIsoChimney(
  g: G,
  w: number,
  d: number,
  h: number,
  count: number,
  time = 0,
): void {
  const cw = Math.max(w * 0.12, 0.3)
  const ch = h * 0.5
  for (let i = 0; i < count; i++) {
    const ox = -w / 2 + cw * (1 + i * 2.2)
    const oz = -d / 2 + cw
    drawIsoExtrudedBoxAt(g, ox, oz, cw, cw, ch, 0x4b5563, h)
    const smokeBase = isoOffset(ox, oz, h + ch)
    for (let s = 0; s < 3; s++) {
      const r = pseudoRandom(i * 17 + s * 3.3 + Math.floor(time * 2))
      g.fillStyle(0xd1d5db, 0.35 - s * 0.09)
      g.fillCircle(
        smokeBase.sx + (r - 0.5) * 10 + s * 3 + Math.sin(time + s) * 2,
        smokeBase.sy - s * 10 - 4 - (time % 1) * 5,
        5 + s * 2,
      )
    }
  }
}

/** `drawIsoExtrudedBox` offset to a local (ox, oz) footprint center. */
function drawIsoExtrudedBoxAt(
  g: G,
  ox: number,
  oz: number,
  w: number,
  d: number,
  h: number,
  color: number,
  yBase: number,
): void {
  const hw = w / 2
  const hd = d / 2
  const base = {
    bl: isoOffset(ox - hw, oz - hd, yBase),
    br: isoOffset(ox + hw, oz - hd, yBase),
    fr: isoOffset(ox + hw, oz + hd, yBase),
    fl: isoOffset(ox - hw, oz + hd, yBase),
  }
  const top = {
    bl: isoOffset(ox - hw, oz - hd, yBase + h),
    br: isoOffset(ox + hw, oz - hd, yBase + h),
    fr: isoOffset(ox + hw, oz + hd, yBase + h),
    fl: isoOffset(ox - hw, oz + hd, yBase + h),
  }
  fillQuad(g, [top.bl, top.br, top.fr, top.fl], shade(color, FACE_TOP))
  fillQuad(g, [top.br, top.fr, base.fr, base.br], shade(color, FACE_RIGHT))
}

/** A red cross on the +z (front) face — reads as a hospital. */
function drawIsoCross(g: G, w: number, d: number, h: number): void {
  const hd = d / 2 + 0.02 // just proud of the face itself, avoids z-fighting
  const cy = h * 0.6
  const arm = Math.min(w, h) * 0.14
  const thick = arm * 0.4
  g.fillStyle(0xef4444, 0.95)
  const vPts = [
    isoOffset(-thick, hd, cy - arm),
    isoOffset(thick, hd, cy - arm),
    isoOffset(thick, hd, cy + arm),
    isoOffset(-thick, hd, cy + arm),
  ]
  g.beginPath()
  g.moveTo(vPts[0].sx, vPts[0].sy)
  for (let i = 1; i < 4; i++) g.lineTo(vPts[i].sx, vPts[i].sy)
  g.closePath()
  g.fillPath()
  const hPts = [
    isoOffset(-arm, hd, cy - thick),
    isoOffset(arm, hd, cy - thick),
    isoOffset(arm, hd, cy + thick),
    isoOffset(-arm, hd, cy + thick),
  ]
  g.beginPath()
  g.moveTo(hPts[0].sx, hPts[0].sy)
  for (let i = 1; i < 4; i++) g.lineTo(hPts[i].sx, hPts[i].sy)
  g.closePath()
  g.fillPath()
}

/** Dashed centerline + solid edge lines along a road's long ground-plane axis. */
function drawIsoRoadMarkings(g: G, w: number, d: number, h: number): void {
  const long = w >= d ? 'x' : 'z'
  const half = (long === 'x' ? w : d) / 2
  const edgeHalf = (long === 'x' ? d : w) / 2
  const top = h + 0.01
  // Solid edge lines along both long sides.
  g.lineStyle(2, 0xe5e7eb, 0.55)
  for (const side of [-1, 1]) {
    const a = long === 'x' ? isoOffset(-half, side * edgeHalf, top) : isoOffset(side * edgeHalf, -half, top)
    const b = long === 'x' ? isoOffset(half, side * edgeHalf, top) : isoOffset(side * edgeHalf, half, top)
    g.lineBetween(a.sx, a.sy, b.sx, b.sy)
  }
  // Dashed centerline.
  const dashCount = Math.max(2, Math.floor(half / 1.6))
  g.lineStyle(2, 0xe8d27a, 0.85)
  for (let i = 0; i < dashCount; i++) {
    const t = -half + (i + 0.5) * ((half * 2) / dashCount)
    const a = long === 'x' ? isoOffset(t - 0.5, 0, top) : isoOffset(0, t - 0.5, top)
    const b = long === 'x' ? isoOffset(t + 0.5, 0, top) : isoOffset(0, t + 0.5, top)
    g.lineBetween(a.sx, a.sy, b.sx, b.sy)
  }
}

/** Canopy (a small cluster of blobs, not one circle) + trunk, anchored at the
 * ground point. `seed` gives each tree a slightly different silhouette. */
function drawIsoTree(g: G, w: number, h: number, seed: number): void {
  const trunkW = Math.max(w * 0.14, 0.1)
  const trunkH = h * 0.4
  drawIsoExtrudedBox(g, trunkW, trunkW, trunkH, 0x7a4a24)
  const baseR = Math.max(w, h) * 0.34
  const blobs = 4
  for (let i = 0; i < blobs; i++) {
    const rx = (pseudoRandom(seed + i * 4.1) - 0.5) * baseR * 0.9
    const rz = (pseudoRandom(seed + i * 9.7) - 0.5) * baseR * 0.9
    const ry = h * (0.72 + pseudoRandom(seed + i * 6.3) * 0.22)
    // Metres, matching every other radius in this file — fillEllipse below
    // converts to px (a bare `r` here previously produced a sub-pixel,
    // invisible canopy).
    const r = baseR * (0.55 + pseudoRandom(seed + i * 2.6) * 0.35)
    const center = isoOffset(rx * 0.3, rz * 0.3, ry)
    const tone = i === 0 ? 0x3f7a3f : 0x4f9a4f
    g.fillStyle(tone, 1)
    g.fillEllipse(center.sx, center.sy, r * 2 * ISO_SCALE, r * 1.15 * ISO_SCALE)
  }
}

/** Flat pad + a small raised basin — reads as a fountain. */
function drawIsoFountain(g: G, w: number, d: number, h: number, time = 0): void {
  drawIsoExtrudedBox(g, w, d, Math.max(h, 0.15), 0x9ca3af)
  const center = isoOffset(0, 0, Math.max(h, 0.15))
  g.fillStyle(0x38bdf8, 0.85)
  g.fillEllipse(center.sx, center.sy, w * ISO_SCALE * 0.7, w * (ISO_SCALE / 2) * 0.7)
  drawIsoExtrudedBox(g, w * 0.2, d * 0.2, h + w * 0.3, 0x9ca3af)
  const jetTop = isoOffset(0, 0, h + w * (0.78 + Math.sin(time * 3) * 0.04))
  g.lineStyle(2, 0xa5f3fc, 0.8)
  g.lineBetween(center.sx, center.sy - 3, jetTop.sx, jetTop.sy)
  for (const direction of [-1, 1]) {
    g.lineBetween(jetTop.sx, jetTop.sy, jetTop.sx + direction * w * 5, center.sy - 2)
  }
}

function drawIsoPark(g: G, w: number, d: number, h: number, seed: number): void {
  drawIsoExtrudedBox(g, w, d, Math.max(h, 0.12), 0x4f8a4a)
  const top = Math.max(h, 0.12) + 0.02
  const pathW = Math.max(0.35, Math.min(w, d) * 0.16)
  fillQuad(
    g,
    [
      isoOffset(-w / 2, -pathW / 2, top),
      isoOffset(w / 2, -pathW / 2, top),
      isoOffset(w / 2, pathW / 2, top),
      isoOffset(-w / 2, pathW / 2, top),
    ],
    0xd6c28a,
    0.9,
  )
  const treeCount = Math.max(2, Math.min(5, Math.floor((w + d) / 3)))
  for (let i = 0; i < treeCount; i++) {
    const ox = (pseudoRandom(seed + i * 7.1) - 0.5) * w * 0.72
    const oz = (pseudoRandom(seed + i * 11.7) - 0.5) * d * 0.62
    const origin = isoOffset(ox, oz, top)
    g.save()
    g.translateCanvas(origin.sx, origin.sy)
    drawIsoTree(g, Math.min(w, d) * 0.18, Math.max(1.1, Math.min(w, d) * 0.35), seed + i)
    g.restore()
  }
}

function drawIsoPlaza(g: G, w: number, d: number, h: number): void {
  drawIsoExtrudedBox(g, w, d, Math.max(h, 0.12), 0xa3a7ad)
  const top = Math.max(h, 0.12) + 0.02
  g.lineStyle(1, 0x626a73, 0.42)
  const lines = Math.max(2, Math.floor(Math.max(w, d) / 1.2))
  for (let i = 1; i < lines; i++) {
    const tx = -w / 2 + (i * w) / lines
    const tz = -d / 2 + (i * d) / lines
    const xa = isoOffset(tx, -d / 2, top)
    const xb = isoOffset(tx, d / 2, top)
    const za = isoOffset(-w / 2, tz, top)
    const zb = isoOffset(w / 2, tz, top)
    g.lineBetween(xa.sx, xa.sy, xb.sx, xb.sy)
    g.lineBetween(za.sx, za.sy, zb.sx, zb.sy)
  }
}

// Kinds with real vertical extent — get a ground shadow before anything else.
const _SHADOWED_KINDS = new Set([
  'house', 'apartment', 'shop', 'tower', 'factory', 'school', 'hospital',
  'power_plant', 'fountain', 'tree',
])

/** Draw a citysim prop, centered at the LOCAL origin (already translated to
 * its ground point by the caller). `w`/`d`/`h` and everything else are in
 * real-world METRES — this function does all the metre-to-pixel projection.
 * `seed` (usually derived from the body id) drives per-instance variety. */
export function drawIsoProp(
  g: G,
  kind: string | null | undefined,
  w: number,
  d: number,
  h: number,
  color: number,
  seed = 0,
  options: IsoRenderOptions = {},
): void {
  const resolved = materialColor(color, options.material, options.style)
  const visualSeed = options.seed ?? seed
  if (kind && _SHADOWED_KINDS.has(kind)) {
    drawIsoShadow(g, w, d, h, options.shadowAlpha ?? 0.38)
  }
  switch (kind) {
    case 'house':
      drawIsoExtrudedBox(g, w, d, h, resolved)
      drawIsoRoof(g, w, d, h, shade(resolved, 0.65))
      drawIsoFrontFacade(g, w, d, h, visualSeed)
      return
    case 'apartment':
      drawIsoExtrudedBox(g, w, d, h, resolved)
      drawIsoWindows(g, w, d, h, visualSeed)
      drawIsoFrontFacade(g, w, d, h, visualSeed + 3)
      drawIsoFloorBands(g, w, d, h)
      drawIsoRoofEquipment(g, w, d, h, visualSeed)
      return
    case 'tower':
      drawIsoExtrudedBox(g, w, d, h, resolved)
      drawIsoWindows(g, w, d, h, visualSeed)
      drawIsoFrontFacade(g, w, d, h, visualSeed + 5)
      drawIsoFloorBands(g, w, d, h)
      drawIsoRoofEquipment(g, w, d, h, visualSeed)
      return
    case 'shop':
      drawIsoExtrudedBox(g, w, d, h, resolved)
      drawIsoAwning(g, w, d, h)
      return
    case 'school':
      drawIsoExtrudedBox(g, w, d, h, resolved)
      drawIsoWindows(g, w, d, h, visualSeed)
      drawIsoFrontFacade(g, w, d, h, visualSeed + 11)
      return
    case 'hospital':
      drawIsoExtrudedBox(g, w, d, h, resolved)
      drawIsoFrontFacade(g, w, d, h, visualSeed)
      drawIsoCross(g, w, d, h)
      return
    case 'factory':
      drawIsoExtrudedBox(g, w, d, h, resolved)
      drawIsoFactoryFacade(g, w, d, h)
      drawIsoChimney(g, w, d, h, 1, options.time)
      return
    case 'power_plant':
      drawIsoExtrudedBox(g, w, d, h, resolved)
      drawIsoFactoryFacade(g, w, d, h)
      drawIsoChimney(g, w, d, h, 2, options.time)
      return
    case 'road':
      drawIsoExtrudedBox(g, w, d, h, resolved)
      drawIsoRoadMarkings(g, w, d, h)
      return
    case 'park':
      drawIsoPark(g, w, d, h, visualSeed)
      return
    case 'plaza':
      drawIsoPlaza(g, w, d, h)
      return
    case 'water':
      drawIsoExtrudedBox(g, w, d, h, resolved)
      return
    case 'tree':
      drawIsoTree(g, w, h, visualSeed)
      return
    case 'fountain':
      drawIsoFountain(g, w, d, h, options.time)
      return
    default:
      drawIsoExtrudedBox(g, w, d, h, resolved)
  }
}

// ── Ground tiles (grass texture + sidewalks bordering roads) ────────────────

const TILE_SIZE = 2
const _MAX_TILES = 3000
const SIDEWALK_WIDTH = 1.2
const SIDEWALK_COLOR = 0xb8bcc4

function nearFootprint(px: number, pz: number, prop: StaticProp, margin: number): boolean {
  const { w, d } = isoFootprint(prop.size)
  const cx = prop.position[0] ?? 0
  const cz = prop.z ?? 0
  return Math.abs(px - cx) <= w / 2 + margin && Math.abs(pz - cz) <= d / 2 + margin
}

/** Adaptive tile size so a very large built area still renders in bounded time. */
function chooseTileSize(minX: number, maxX: number, minZ: number, maxZ: number): number {
  let size = TILE_SIZE
  while (((maxX - minX) / size) * ((maxZ - minZ) / size) > _MAX_TILES) size *= 1.5
  return size
}

/** Textured ground: a subtly mottled grass fill, plus a lighter sidewalk strip
 * bordering every road footprint — the single biggest "reads like a street"
 * cue, since roads previously had nothing framing them. Road tiles themselves
 * are left to the road prop's own draw call (it already covers its footprint). */
export function drawIsoGroundTiles(
  g: G,
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  groundColor: number,
  roads: StaticProp[],
): void {
  const size = chooseTileSize(bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ)
  const x0 = Math.floor(bounds.minX / size) * size
  const x1 = Math.ceil(bounds.maxX / size) * size
  const z0 = Math.floor(bounds.minZ / size) * size
  const z1 = Math.ceil(bounds.maxZ / size) * size
  let i = 0
  for (let x = x0; x < x1; x += size) {
    for (let z = z0; z < z1; z += size) {
      i++
      const cx = x + size / 2
      const cz = z + size / 2
      const onRoad = roads.some((r) => nearFootprint(cx, cz, r, 0))
      if (onRoad) continue // the road prop itself paints this tile
      const nearRoad = roads.some((r) => nearFootprint(cx, cz, r, SIDEWALK_WIDTH))
      const color = nearRoad ? SIDEWALK_COLOR : shade(groundColor, 0.92 + pseudoRandom(i) * 0.14)
      const corners = [
        isoProject(x, z, 0),
        isoProject(x + size, z, 0),
        isoProject(x + size, z + size, 0),
        isoProject(x, z + size, 0),
      ]
      g.fillStyle(color, 1)
      g.beginPath()
      g.moveTo(corners[0].sx, corners[0].sy)
      for (let k = 1; k < 4; k++) g.lineTo(corners[k].sx, corners[k].sy)
      g.closePath()
      g.fillPath()
      if (!nearRoad && pseudoRandom(i * 7.13) < 0.3) {
        const tuft = isoProject(cx, cz, 0)
        g.fillStyle(shade(groundColor, 0.7), 0.55)
        g.fillEllipse(tuft.sx, tuft.sy - 2, size * ISO_SCALE * 0.18, size * (ISO_HEIGHT_SCALE / 2) * 0.18)
      }
    }
  }
}

// ── Road intersections ───────────────────────────────────────────────────────

/** The overlapping (x, z) rectangle of two road footprints, or null if they
 * don't overlap — an intersection where two street segments cross. */
export function roadOverlap(
  a: StaticProp,
  b: StaticProp,
): { cx: number; cz: number; w: number; d: number } | null {
  const fa = isoFootprint(a.size)
  const fb = isoFootprint(b.size)
  const acx = a.position[0] ?? 0
  const acz = a.z ?? 0
  const bcx = b.position[0] ?? 0
  const bcz = b.z ?? 0
  const loX = Math.max(acx - fa.w / 2, bcx - fb.w / 2)
  const hiX = Math.min(acx + fa.w / 2, bcx + fb.w / 2)
  const loZ = Math.max(acz - fa.d / 2, bcz - fb.d / 2)
  const hiZ = Math.min(acz + fa.d / 2, bcz + fb.d / 2)
  if (hiX <= loX || hiZ <= loZ) return null
  return { cx: (loX + hiX) / 2, cz: (loZ + hiZ) / 2, w: hiX - loX, d: hiZ - loZ }
}

/** A clean paved patch over a road intersection (drawn after all road props
 * so it sits on top of both crossing segments' center-dash markings). */
export function drawIsoIntersectionPatch(
  g: G,
  cx: number,
  cz: number,
  w: number,
  d: number,
  topY: number,
): void {
  const hw = w / 2
  const hd = d / 2
  const y = topY + 0.01
  const corners = [
    isoProject(cx - hw, cz - hd, y),
    isoProject(cx + hw, cz - hd, y),
    isoProject(cx + hw, cz + hd, y),
    isoProject(cx - hw, cz + hd, y),
  ]
  g.fillStyle(0xd1d5db, 0.95)
  g.beginPath()
  g.moveTo(corners[0].sx, corners[0].sy)
  for (let i = 1; i < 4; i++) g.lineTo(corners[i].sx, corners[i].sy)
  g.closePath()
  g.fillPath()
}

// ── Street furniture (decorative, derived client-side from roads/buildings) ─

export interface FurnitureItem {
  kind: 'streetlight' | 'car' | 'bench' | 'hydrant' | 'pedestrian'
  x: number
  z: number
  /** Footprint long axis: 'x' means the item's longer dimension runs along x. */
  axis: 'x' | 'z'
}

const _FURNITURE_SPACING = 5
const _MAX_FURNITURE = 16

/** Scatter streetlights/parked cars along road edges, spaced out and skipping
 * anywhere too close to an existing building — cheap, deterministic (seeded
 * by index), and purely cosmetic (never sent to/from the backend). */
export function computeStreetFurniture(
  roads: StaticProp[],
  buildings: StaticProp[],
): FurnitureItem[] {
  const items: FurnitureItem[] = []
  let seed = 0
  for (const road of roads) {
    if (items.length >= _MAX_FURNITURE) break
    const { w, d } = isoFootprint(road.size)
    const cx = road.position[0] ?? 0
    const cz = road.z ?? 0
    const longAxisIsX = w >= d
    const length = longAxisIsX ? w : d
    const halfWidth = (longAxisIsX ? d : w) / 2
    const count = Math.max(1, Math.floor(length / _FURNITURE_SPACING) - 1)
    for (let i = 0; i < count && items.length < _MAX_FURNITURE; i++) {
      seed++
      const t = -length / 2 + (i + 0.5) * (length / count)
      const side = i % 2 === 0 ? 1 : -1
      const offset = halfWidth + 1.0
      const px = longAxisIsX ? cx + t : cx + side * offset
      const pz = longAxisIsX ? cz + side * offset : cz + t
      if (buildings.some((b) => nearFootprint(px, pz, b, 0.4))) continue
      if (roads.some((r) => nearFootprint(px, pz, r, 0))) continue
      const r = pseudoRandom(seed * 3.7)
      const kind: FurnitureItem['kind'] =
        r < 0.42
          ? 'streetlight'
          : r < 0.66
            ? 'car'
            : r < 0.8
              ? 'bench'
              : r < 0.9
                ? 'hydrant'
                : 'pedestrian'
      items.push({
        kind,
        x: px,
        z: pz,
        axis: longAxisIsX ? 'z' : 'x', // car sits crosswise to the road it parks along
      })
    }
  }
  return items
}

export function drawIsoFurniture(g: G, item: FurnitureItem, seed: number): void {
  if (item.kind === 'streetlight') {
    const h = 3.2
    drawIsoExtrudedBox(g, 0.12, 0.12, h, 0x3f3f46)
    const lamp = isoOffset(0, 0, h + 0.1)
    g.fillStyle(0xfef3c7, 0.55)
    g.fillCircle(lamp.sx, lamp.sy, 9)
    g.fillStyle(0xfef3c7, 0.95)
    g.fillCircle(lamp.sx, lamp.sy, 4)
    return
  }
  if (item.kind === 'bench') {
    drawIsoExtrudedBox(g, item.axis === 'x' ? 1.4 : 0.35, item.axis === 'x' ? 0.35 : 1.4, 0.18, 0x8b5e3c)
    drawIsoExtrudedBox(g, item.axis === 'x' ? 1.4 : 0.16, item.axis === 'x' ? 0.16 : 1.4, 0.45, 0x71462b, 0.2)
    return
  }
  if (item.kind === 'hydrant') {
    drawIsoExtrudedBox(g, 0.28, 0.28, 0.65, 0xdc2626)
    const cap = isoOffset(0, 0, 0.72)
    g.fillStyle(0xf87171, 1)
    g.fillCircle(cap.sx, cap.sy, 4)
    return
  }
  if (item.kind === 'pedestrian') {
    const body = isoOffset(0, 0, 0.85)
    const head = isoOffset(0, 0, 1.55)
    g.lineStyle(4, [0xf97316, 0x22c55e, 0xa78bfa][seed % 3], 0.95)
    g.lineBetween(body.sx, body.sy, head.sx, head.sy + 3)
    g.fillStyle(0xf1c7a5, 1)
    g.fillCircle(head.sx, head.sy, 4)
    return
  }
  // Parked car: a low body + slightly narrower cabin on top, oriented so its
  // long side runs along `item.axis`.
  const bodyColor = [0xef4444, 0x3b82f6, 0xf1f5f9, 0x22c55e, 0x1f2937][Math.floor(pseudoRandom(seed) * 5)]
  const w = item.axis === 'x' ? 2.0 : 1.0
  const d = item.axis === 'x' ? 1.0 : 2.0
  drawIsoShadow(g, w, d, 0.6)
  drawIsoExtrudedBox(g, w, d, 0.5, bodyColor)
  drawIsoExtrudedBoxAt(g, 0, 0, w * 0.55, d * 0.6, 0.35, shade(bodyColor, 0.9), 0.5)
}
