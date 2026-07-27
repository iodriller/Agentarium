// Procedural, asset-free prop drawing keyed by a body's semantic `kind`.
//
// Each drawer renders an upright, centered shape in the Graphics object's LOCAL
// space (the side-view renderer positions/rotates it). Sizes come in as pixels
// (world size × the renderer's SCALE), so a big building is big and a ball small.
// Plain Phaser Graphics — no sprites, no textures, no new deps.

import type Phaser from 'phaser'
import type { BodyMeta, VisualSpec, VisualStyle } from '../api/types'
import { materialColor } from './visualTheme'

const NEUTRAL = 0x9aa4b2
const AGENT_A = 0xa78bfa
const AGENT_B = 0x38bdf8

// Palette per semantic kind (used when the body has no explicit color).
const KIND_COLOR: Record<string, number> = {
  house: 0xd9a066,
  apartment: 0xc084fc,
  shop: 0x60a5fa,
  tower: 0x9b8ab0,
  school: 0xf87171,
  hospital: 0xf1f5f9,
  factory: 0x78716c,
  power_plant: 0x64748b,
  tree: 0x4a8c4a,
  road: 0x55606e,
  park: 0x4f8a4a,
  plaza: 0x6b7280,
  fountain: 0x38bdf8,
  wall: 0x8a8f98,
  beam: 0x9aa4b2,
  deck: 0x9f7a50,
  ramp: 0x8a8f98,
  leg: 0x7c5ce7,
  foot: 0x5b6472,
  torso: 0x7c3aed,
  chute: 0x7c8798,
  conveyor: 0x4b5563,
  target_pad: 0x64748b,
  terrain: 0x6b7f4a,
  anchor: 0x697386,
  crate: 0xc08a4a,
  ball: 0x4488cc,
  bin: 0x6b7686,
  water: 0x3b82c4,
  goal: 0x34d399,
}

const NAMED: Record<string, number> = {
  red: 0xef4444,
  blue: 0x3b82f6,
  green: 0x22c55e,
  yellow: 0xeab308,
  orange: 0xf97316,
}

// Kinds we draw a custom procedural prop for; anything else falls back to the
// renderer's generic scaled shape.
const SEMANTIC = new Set(Object.keys(KIND_COLOR))

export function isSemanticKind(kind: string | null | undefined): boolean {
  return !!kind && SEMANTIC.has(kind)
}

function parseColor(color: string | null | undefined): number | null {
  if (!color) return null
  if (NAMED[color.toLowerCase()] != null) return NAMED[color.toLowerCase()]
  const n = Number.parseInt(color.replace('#', ''), 16)
  return Number.isNaN(n) ? null : n
}

/** Base fill: explicit color > kind palette > agent tint (from id) > neutral. */
export function colorForBody(id: string, meta: BodyMeta | undefined): number {
  const explicit = parseColor(meta?.color)
  if (explicit !== null) return explicit
  const kind = meta?.kind
  if (kind && KIND_COLOR[kind] !== undefined) return KIND_COLOR[kind]
  const lower = id.toLowerCase()
  if (lower.includes('agent_a')) return AGENT_A
  if (lower.includes('agent_b')) return AGENT_B
  return NEUTRAL
}

/** Pixel footprint for a body from its shape + real world size × scale. */
export function sizePx(meta: BodyMeta | undefined, scale: number): { w: number; h: number } {
  const shape = meta?.shape ?? 'box'
  const s = meta?.size ?? []
  if (shape === 'circle') {
    const r = (s[0] ?? 0.5) * scale
    return { w: r * 2, h: r * 2 }
  }
  if (shape === 'segment') {
    const len = (s[0] ?? 1) * scale
    return { w: Math.max(len, 6), h: Math.max(0.25 * scale, 6) }
  }
  const w = (s[0] ?? 1) * scale
  const h = (s[1] ?? s[0] ?? 1) * scale
  return { w: Math.max(w, 6), h: Math.max(h, 6) }
}

export function shade(color: number, factor: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * factor))
  const g = Math.min(255, Math.round(((color >> 8) & 0xff) * factor))
  const b = Math.min(255, Math.round((color & 0xff) * factor))
  return (r << 16) | (g << 8) | b
}

type G = Phaser.GameObjects.Graphics

export type PropRenderOptions = Pick<
  VisualSpec,
  'variant' | 'material' | 'condition' | 'seed' | 'emission' | 'animation_state'
> & {
  style?: VisualStyle
  time?: number
  shape?: string
}

/** Draw a prop centered at the local origin, scaled to (w, h) px. Screen-up is
 *  -y, so roofs/canopies sit on top. */
export function drawProp(
  g: G,
  kind: string | null | undefined,
  w: number,
  h: number,
  color: number,
  options: PropRenderOptions = {},
): void {
  const resolved = materialColor(color, options.material, options.style)
  switch (kind) {
    case 'house':
      drawHouse(g, w, h, resolved, options.seed ?? 0)
      break
    case 'shop':
      drawShop(g, w, h, resolved)
      break
    case 'apartment':
    case 'tower':
      drawTower(g, w, h, resolved, options.seed ?? 0)
      break
    case 'school':
      drawSchool(g, w, h, resolved)
      break
    case 'hospital':
      drawHospital(g, w, h, resolved)
      break
    case 'factory':
    case 'power_plant':
      drawFactory(g, w, h, resolved, kind === 'power_plant' ? 2 : 1)
      break
    case 'tree':
      drawTree(g, w, h, options.seed ?? 0)
      break
    case 'road':
    case 'plaza':
      drawRoad(g, w, h, resolved)
      break
    case 'park':
      drawPark(g, w, h, resolved)
      break
    case 'fountain':
      drawFountain(g, w, h, options.time ?? 0)
      break
    case 'crate':
      drawCrate(g, w, h, resolved, options.shape === 'circle')
      break
    case 'ball':
      drawBall(g, w, resolved, options.seed ?? 0)
      break
    case 'bin':
      drawBin(g, w, h, resolved)
      break
    case 'water':
      drawWater(g, w, h, resolved, options.time ?? 0)
      break
    case 'goal':
      drawGoal(g, w, h, options.time ?? 0)
      break
    case 'leg':
    case 'foot':
    case 'torso':
      drawCreaturePart(g, kind, w, h, resolved)
      break
    case 'conveyor':
      drawConveyor(g, w, h, resolved, options.time ?? 0)
      break
    case 'target_pad':
      drawTargetPad(g, w, h, resolved)
      break
    case 'terrain':
      drawTerrainChunk(g, w, h, resolved)
      break
    case 'chute':
    case 'wall':
    case 'beam':
    case 'deck':
    case 'ramp':
    case 'anchor':
      drawBeam(g, w, h, resolved, options.material, kind)
      break
    default:
      drawBlock(g, w, h, resolved)
  }
  if (options.condition && options.condition !== 'normal') {
    drawCondition(g, w, h, options.condition)
  }
}

function drawHouse(g: G, w: number, h: number, color: number, seed: number): void {
  const bodyH = h * 0.62
  const roofH = h * 0.42
  const top = -h / 2
  const wallTop = top + roofH
  g.fillStyle(color, 1)
  g.fillRect(-w / 2, wallTop, w, bodyH)
  g.fillStyle(shade(color, 0.7), 1)
  g.fillTriangle(-w / 2 - w * 0.06, wallTop, w / 2 + w * 0.06, wallTop, 0, top)
  g.fillStyle(shade(color, 0.55), 1)
  const dw = w * 0.24
  g.fillRect(-dw / 2, wallTop + bodyH - h * 0.3, dw, h * 0.3)
  g.fillStyle(0xffe9a8, 0.9)
  g.fillRect(w * 0.14, wallTop + bodyH * 0.2, w * 0.2, h * 0.16)
  if (seed % 3 !== 0) {
    g.fillStyle(0x4b5563, 1)
    g.fillRect(w * 0.24, top + roofH * 0.05, Math.max(3, w * 0.1), roofH * 0.48)
  }
  g.fillStyle(0x70a85d, 0.9)
  g.fillCircle(-w * 0.36, wallTop + bodyH * 0.8, Math.max(2, w * 0.09))
  g.lineStyle(1, 0x000000, 0.25)
  g.strokeRect(-w / 2, wallTop, w, bodyH)
}

function drawShop(g: G, w: number, h: number, color: number): void {
  const top = -h / 2
  const awningH = h * 0.18
  g.fillStyle(color, 1)
  g.fillRect(-w / 2, top + awningH, w, h - awningH)
  g.fillStyle(shade(color, 0.68), 1)
  g.fillRect(-w / 2, top, w, awningH)
  g.fillStyle(0xffffff, 0.85)
  const stripeW = Math.max(4, w / 6)
  for (let x = -w / 2; x < w / 2; x += stripeW * 2) {
    g.fillRect(x, top, stripeW, awningH)
  }
  g.fillStyle(0x88d8ff, 0.75)
  g.fillRect(-w * 0.36, top + h * 0.35, w * 0.28, h * 0.22)
  g.fillRect(w * 0.08, top + h * 0.35, w * 0.28, h * 0.22)
  g.fillStyle(shade(color, 0.48), 1)
  g.fillRect(-w * 0.1, top + h * 0.58, w * 0.2, h * 0.36)
  g.fillStyle(0x172033, 0.9)
  g.fillRoundedRect(-w * 0.28, top + h * 0.08, w * 0.56, Math.max(4, h * 0.12), 2)
  g.lineStyle(1.5, 0xffe9a8, 0.8)
  g.lineBetween(-w * 0.2, top + h * 0.14, w * 0.2, top + h * 0.14)
  g.lineStyle(1, 0x000000, 0.25)
  g.strokeRect(-w / 2, top + awningH, w, h - awningH)
}

function drawTower(g: G, w: number, h: number, color: number, seed: number): void {
  g.fillStyle(color, 1)
  g.fillRect(-w / 2, -h / 2, w, h)
  g.fillStyle(shade(color, 0.78), 1)
  g.fillRect(-w / 2, -h / 2, w * 0.32, h)
  g.fillStyle(0xffe9a8, 0.85)
  const rows = Math.max(2, Math.floor(h / 26))
  for (let i = 0; i < rows; i++) {
    const y = -h / 2 + h * 0.12 + (i * (h * 0.8)) / rows
    g.fillStyle((seed + i) % 4 === 0 ? 0x243244 : 0xffe9a8, 0.85)
    g.fillRect(-w * 0.22, y, w * 0.18, h * 0.05)
    g.fillRect(w * 0.06, y, w * 0.18, h * 0.05)
  }
  g.fillStyle(shade(color, 0.55), 1)
  g.fillRect(-w * 0.28, -h / 2 - Math.max(3, h * 0.04), w * 0.56, Math.max(3, h * 0.04))
  g.lineStyle(1, shade(color, 0.55), 0.8)
  for (let y = -h * 0.32; y < h * 0.45; y += Math.max(10, h * 0.16)) {
    g.lineBetween(-w / 2, y, w / 2, y)
  }
  g.lineStyle(1, 0x000000, 0.25)
  g.strokeRect(-w / 2, -h / 2, w, h)
}

function drawTree(g: G, w: number, h: number, seed: number): void {
  const trunkW = Math.max(w * 0.16, 3)
  g.fillStyle(0x7a4a24, 1)
  g.fillRect(-trunkW / 2, 0, trunkW, h / 2)
  g.fillStyle(0x3f7a3f, 1)
  g.fillCircle(0, -h * 0.12, Math.max(w, h) * (0.36 + (seed % 5) * 0.012))
  g.fillStyle(0x4f9a4f, 1)
  g.fillCircle(-w * 0.12, -h * 0.2, Math.max(w, h) * 0.26)
}

function drawRoad(g: G, w: number, h: number, color: number): void {
  g.fillStyle(color, 1)
  g.fillRect(-w / 2, -h / 2, w, h)
  g.fillStyle(0xe8d27a, 0.8)
  const dashes = Math.max(2, Math.floor(w / 14))
  for (let i = 0; i < dashes; i++) {
    const x = -w / 2 + (i + 0.3) * (w / dashes)
    g.fillRect(x, -h * 0.08, (w / dashes) * 0.4, Math.max(h * 0.16, 1.5))
  }
  g.fillStyle(0xe5e7eb, 0.5)
  g.fillRect(-w / 2, -h / 2, w, Math.max(1, h * 0.08))
  g.fillRect(-w / 2, h / 2 - Math.max(1, h * 0.08), w, Math.max(1, h * 0.08))
}

function drawPark(g: G, w: number, h: number, color: number): void {
  g.fillStyle(color, 1)
  g.fillRect(-w / 2, -h / 2, w, h)
  g.fillStyle(0x9bd86f, 0.95)
  const mounds = Math.max(3, Math.floor(w / 18))
  for (let i = 0; i < mounds; i++) {
    const x = -w / 2 + (i + 0.5) * (w / mounds)
    g.fillCircle(x, -h * 0.18, Math.max(h * 0.35, 3))
  }
  g.fillStyle(0xd6c28a, 0.7)
  g.fillRect(-w / 2, -Math.max(1, h * 0.08), w, Math.max(2, h * 0.16))
  g.lineStyle(1, 0x0b3d1f, 0.35)
  g.strokeRect(-w / 2, -h / 2, w, h)
}

function drawCrate(g: G, w: number, h: number, color: number, round: boolean): void {
  if (round) {
    const radius = Math.min(w, h) / 2
    g.fillStyle(color, 1)
    g.fillCircle(0, 0, radius)
    g.lineStyle(Math.max(2, radius * 0.12), shade(color, 0.55), 1)
    g.strokeCircle(0, 0, radius)
    g.lineBetween(-radius * 0.72, 0, radius * 0.72, 0)
    g.lineBetween(0, -radius * 0.72, 0, radius * 0.72)
    g.fillStyle(0xffffff, 0.28)
    g.fillCircle(-radius * 0.3, -radius * 0.3, radius * 0.18)
    return
  }
  g.fillStyle(color, 1)
  g.fillRect(-w / 2, -h / 2, w, h)
  g.lineStyle(Math.max(1.5, w * 0.04), shade(color, 0.6), 1)
  g.strokeRect(-w / 2, -h / 2, w, h)
  g.lineBetween(-w / 2, -h / 2, w / 2, h / 2)
  g.lineBetween(w / 2, -h / 2, -w / 2, h / 2)
}

function drawBall(g: G, w: number, color: number, seed: number): void {
  const r = w / 2
  g.fillStyle(color, 1)
  g.fillCircle(0, 0, r)
  g.fillStyle(0xffffff, 0.35)
  g.fillCircle(-r * 0.3, -r * 0.3, r * 0.28)
  g.lineStyle(1.5, 0x000000, 0.25)
  g.strokeCircle(0, 0, r)
  g.lineStyle(Math.max(1, r * 0.08), shade(color, 0.55), 0.8)
  if (seed % 2 === 0) g.strokeCircle(0, 0, r * 0.62)
  else g.lineBetween(-r * 0.7, 0, r * 0.7, 0)
}

function drawBin(g: G, w: number, h: number, color: number): void {
  g.fillStyle(shade(color, 0.55), 0.55)
  g.fillRect(-w * 0.42, -h * 0.34, w * 0.84, h * 0.7)
  g.fillStyle(color, 0.9)
  g.fillRect(-w / 2, -h / 2, w * 0.16, h)
  g.fillRect(w / 2 - w * 0.16, -h / 2, w * 0.16, h)
  g.fillRect(-w / 2, h / 2 - h * 0.18, w, h * 0.18)
  g.lineStyle(1, 0x000000, 0.3)
  g.strokeRect(-w / 2, -h / 2, w, h)
  g.fillStyle(0xffffff, 0.75)
  g.fillRoundedRect(-w * 0.22, h * 0.08, w * 0.44, Math.max(3, h * 0.11), 2)
}

function drawWater(g: G, w: number, h: number, color: number, time: number): void {
  g.fillStyle(color, 0.7)
  g.fillRect(-w / 2, -h / 2, w, h)
  g.lineStyle(1.5, 0xffffff, 0.3)
  for (let i = 0; i < 3; i++) {
    const y = -h / 2 + (i + 1) * (h / 4) + Math.sin(time * 3 + i) * Math.min(3, h * 0.08)
    const segments = Math.max(3, Math.floor(w / 18))
    for (let s = 0; s < segments; s++) {
      const x0 = -w / 2 + (s * w) / segments
      const x1 = -w / 2 + ((s + 0.65) * w) / segments
      g.lineBetween(x0, y + Math.sin(s + time * 2) * 1.5, x1, y)
    }
  }
}

function drawGoal(g: G, w: number, h: number, time: number): void {
  const r = Math.max(w, h) / 2
  g.fillStyle(KIND_COLOR.goal, 0.12 + Math.sin(time * 4) * 0.03)
  g.fillCircle(0, 0, r * 1.05)
  g.lineStyle(2, KIND_COLOR.goal, 0.8)
  g.strokeCircle(0, 0, r)
  const poleX = -Math.min(w * 0.24, 8)
  g.lineStyle(Math.max(2, w * 0.06), 0xe5e7eb, 0.95)
  g.lineBetween(poleX, h * 0.34, poleX, -h * 0.38)
  g.fillStyle(0x34d399, 0.95)
  g.fillTriangle(poleX, -h * 0.38, poleX + w * 0.56, -h * 0.24, poleX, -h * 0.1)
}

function drawBeam(
  g: G,
  w: number,
  h: number,
  color: number,
  material: string | null | undefined,
  kind: string | null | undefined,
): void {
  g.fillStyle(color, 1)
  g.fillRect(-w / 2, -h / 2, w, h)
  g.fillStyle(shade(color, 0.7), 1)
  g.fillRect(-w / 2, h / 2 - h * 0.35, w, h * 0.35)
  g.lineStyle(1, 0x000000, 0.25)
  g.strokeRect(-w / 2, -h / 2, w, h)
  if (material === 'wood' || kind === 'deck') {
    g.lineStyle(1, shade(color, 0.55), 0.55)
    for (let x = -w / 2 + 8; x < w / 2; x += 12) g.lineBetween(x, -h / 2, x, h / 2)
  } else {
    g.fillStyle(0xdbe4ee, 0.75)
    const step = Math.max(14, Math.min(28, w / 5))
    for (let x = -w / 2 + step / 2; x < w / 2; x += step) {
      g.fillCircle(x, 0, Math.max(1.5, Math.min(3, h * 0.16)))
    }
  }
}

function drawBlock(g: G, w: number, h: number, color: number): void {
  g.fillStyle(color, 1)
  g.fillRoundedRect(-w / 2, -h / 2, w, h, 4)
  g.lineStyle(1.5, 0xffffff, 0.3)
  g.strokeRoundedRect(-w / 2, -h / 2, w, h, 4)
}

function drawSchool(g: G, w: number, h: number, color: number): void {
  drawHouse(g, w, h, color, 1)
  g.fillStyle(0xf8fafc, 0.95)
  g.fillCircle(0, -h * 0.05, Math.max(3, Math.min(w, h) * 0.1))
  g.lineStyle(1.5, 0x334155, 0.8)
  g.lineBetween(0, -h * 0.05, 0, -h * 0.11)
  g.lineBetween(0, -h * 0.05, w * 0.05, -h * 0.02)
}

function drawHospital(g: G, w: number, h: number, color: number): void {
  drawTower(g, w, h, color, 2)
  const arm = Math.min(w, h) * 0.12
  g.fillStyle(0xef4444, 0.95)
  g.fillRect(-arm * 0.32, -arm, arm * 0.64, arm * 2)
  g.fillRect(-arm, -arm * 0.32, arm * 2, arm * 0.64)
}

function drawFactory(g: G, w: number, h: number, color: number, stacks: number): void {
  g.fillStyle(color, 1)
  g.fillRect(-w / 2, -h * 0.25, w, h * 0.75)
  g.fillStyle(shade(color, 0.72), 1)
  const tooth = w / 4
  for (let i = 0; i < 4; i++) {
    const x = -w / 2 + i * tooth
    g.fillTriangle(x, -h * 0.25, x + tooth, -h * 0.25, x + tooth, -h * 0.48)
  }
  for (let i = 0; i < stacks; i++) {
    const x = -w * 0.34 + i * w * 0.23
    g.fillStyle(0x4b5563, 1)
    g.fillRect(x, -h / 2, Math.max(4, w * 0.1), h * 0.42)
    g.fillStyle(0xcbd5e1, 0.25)
    g.fillCircle(x + w * 0.05, -h * 0.64, Math.max(4, w * 0.09))
  }
}

function drawFountain(g: G, w: number, h: number, time: number): void {
  g.fillStyle(0x8b949e, 1)
  g.fillEllipse(0, h * 0.22, w, Math.max(5, h * 0.35))
  g.fillStyle(0x38bdf8, 0.8)
  g.fillEllipse(0, h * 0.18, w * 0.78, Math.max(4, h * 0.24))
  g.lineStyle(2, 0x9eeaff, 0.75)
  const jet = h * (0.45 + Math.sin(time * 4) * 0.04)
  g.lineBetween(0, h * 0.13, 0, -jet)
  g.lineBetween(0, -jet, -w * 0.18, -h * 0.08)
  g.lineBetween(0, -jet, w * 0.18, -h * 0.08)
}

function drawCreaturePart(g: G, kind: string, w: number, h: number, color: number): void {
  const radius = kind === 'foot' ? Math.min(5, h * 0.4) : Math.min(8, h * 0.45)
  g.fillStyle(color, 1)
  g.fillRoundedRect(-w / 2, -h / 2, w, h, radius)
  g.fillStyle(shade(color, 0.65), 0.7)
  g.fillRect(-w / 2, h * 0.18, w, h * 0.32)
  g.lineStyle(2, 0xd8b4fe, 0.75)
  g.strokeRoundedRect(-w / 2, -h / 2, w, h, radius)
  if (kind === 'torso') {
    g.fillStyle(0x67e8f9, 0.8)
    g.fillRoundedRect(-w * 0.22, -h * 0.22, w * 0.44, h * 0.24, 3)
  }
}

function drawConveyor(g: G, w: number, h: number, color: number, time: number): void {
  g.fillStyle(color, 1)
  g.fillRoundedRect(-w / 2, -h / 2, w, h, Math.min(5, h / 2))
  g.fillStyle(0x202733, 1)
  const rollerR = Math.max(2, h * 0.26)
  const spacing = Math.max(rollerR * 2.6, 9)
  const phase = (time * 18) % spacing
  for (let x = -w / 2 + phase; x < w / 2; x += spacing) {
    g.fillCircle(x, 0, rollerR)
    g.lineStyle(1, 0x94a3b8, 0.8)
    g.lineBetween(x - rollerR * 0.7, 0, x + rollerR * 0.7, 0)
  }
}

function drawTargetPad(g: G, w: number, h: number, color: number): void {
  g.fillStyle(color, 0.3)
  g.fillRoundedRect(-w / 2, -h / 2, w, h, Math.min(5, h / 2))
  g.lineStyle(2, color, 0.95)
  g.strokeRoundedRect(-w / 2, -h / 2, w, h, Math.min(5, h / 2))
  g.lineStyle(1.5, 0xffffff, 0.5)
  const stripe = Math.max(7, h * 0.55)
  for (let x = -w / 2 - h; x < w / 2; x += stripe * 2) {
    g.lineBetween(x, h / 2, x + h, -h / 2)
  }
}

function drawTerrainChunk(g: G, w: number, h: number, color: number): void {
  g.fillStyle(0x66523a, 1)
  g.fillRect(-w / 2, -h / 2, w, h)
  g.fillStyle(color, 1)
  g.fillRect(-w / 2, -h / 2, w, Math.max(4, h * 0.18))
  g.lineStyle(1.5, 0x3f3225, 0.42)
  for (let y = -h * 0.18; y < h / 2; y += Math.max(7, h * 0.18)) {
    for (let x = -w / 2; x < w / 2; x += 30) {
      g.lineBetween(x, y, Math.min(x + 20, w / 2), y + 2)
    }
  }
}

function drawCondition(g: G, w: number, h: number, condition: string): void {
  if (condition === 'selected') {
    g.lineStyle(3, 0x67e8f9, 0.9)
    g.strokeRoundedRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, 5)
    return
  }
  if (condition === 'stressed' || condition === 'damaged') {
    g.lineStyle(2, condition === 'damaged' ? 0xef4444 : 0xf59e0b, 0.9)
    g.beginPath()
    g.moveTo(-w * 0.3, -h * 0.35)
    g.lineTo(-w * 0.08, -h * 0.05)
    g.lineTo(-w * 0.22, h * 0.18)
    g.lineTo(w * 0.28, h * 0.34)
    g.strokePath()
  }
}
