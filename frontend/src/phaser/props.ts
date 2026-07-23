// Procedural, asset-free prop drawing keyed by a body's semantic `kind`.
//
// Each drawer renders an upright, centered shape in the Graphics object's LOCAL
// space (the side-view renderer positions/rotates it). Sizes come in as pixels
// (world size × the renderer's SCALE), so a big building is big and a ball small.
// Plain Phaser Graphics — no sprites, no textures, no new deps.

import type Phaser from 'phaser'
import type { BodyMeta } from '../api/types'

const NEUTRAL = 0x9aa4b2
const AGENT_A = 0xa78bfa
const AGENT_B = 0x38bdf8

// Palette per semantic kind (used when the body has no explicit color).
const KIND_COLOR: Record<string, number> = {
  house: 0xd9a066,
  shop: 0x60a5fa,
  tower: 0x9b8ab0,
  tree: 0x4a8c4a,
  road: 0x55606e,
  park: 0x4f8a4a,
  plaza: 0x6b7280,
  wall: 0x8a8f98,
  beam: 0x9aa4b2,
  ramp: 0x8a8f98,
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

/** Draw a prop centered at the local origin, scaled to (w, h) px. Screen-up is
 *  -y, so roofs/canopies sit on top. */
export function drawProp(g: G, kind: string | null | undefined, w: number, h: number, color: number): void {
  switch (kind) {
    case 'house':
      return drawHouse(g, w, h, color)
    case 'shop':
      return drawShop(g, w, h, color)
    case 'tower':
      return drawTower(g, w, h, color)
    case 'tree':
      return drawTree(g, w, h)
    case 'road':
    case 'plaza':
      return drawRoad(g, w, h, color)
    case 'park':
      return drawPark(g, w, h, color)
    case 'crate':
      return drawCrate(g, w, h, color)
    case 'ball':
      return drawBall(g, w, color)
    case 'bin':
      return drawBin(g, w, h, color)
    case 'water':
      return drawWater(g, w, h, color)
    case 'goal':
      return drawGoal(g, w, h)
    case 'wall':
    case 'beam':
    case 'ramp':
      return drawBeam(g, w, h, color)
    default:
      return drawBlock(g, w, h, color)
  }
}

function drawHouse(g: G, w: number, h: number, color: number): void {
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
  g.lineStyle(1, 0x000000, 0.25)
  g.strokeRect(-w / 2, top + awningH, w, h - awningH)
}

function drawTower(g: G, w: number, h: number, color: number): void {
  g.fillStyle(color, 1)
  g.fillRect(-w / 2, -h / 2, w, h)
  g.fillStyle(shade(color, 0.78), 1)
  g.fillRect(-w / 2, -h / 2, w * 0.32, h)
  g.fillStyle(0xffe9a8, 0.85)
  const rows = Math.max(2, Math.floor(h / 26))
  for (let i = 0; i < rows; i++) {
    const y = -h / 2 + h * 0.12 + (i * (h * 0.8)) / rows
    g.fillRect(-w * 0.22, y, w * 0.18, h * 0.05)
    g.fillRect(w * 0.06, y, w * 0.18, h * 0.05)
  }
  g.lineStyle(1, 0x000000, 0.25)
  g.strokeRect(-w / 2, -h / 2, w, h)
}

function drawTree(g: G, w: number, h: number): void {
  const trunkW = Math.max(w * 0.16, 3)
  g.fillStyle(0x7a4a24, 1)
  g.fillRect(-trunkW / 2, 0, trunkW, h / 2)
  g.fillStyle(0x3f7a3f, 1)
  g.fillCircle(0, -h * 0.12, Math.max(w, h) * 0.42)
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
  g.lineStyle(1, 0x0b3d1f, 0.35)
  g.strokeRect(-w / 2, -h / 2, w, h)
}

function drawCrate(g: G, w: number, h: number, color: number): void {
  g.fillStyle(color, 1)
  g.fillRect(-w / 2, -h / 2, w, h)
  g.lineStyle(Math.max(1.5, w * 0.04), shade(color, 0.6), 1)
  g.strokeRect(-w / 2, -h / 2, w, h)
  g.lineBetween(-w / 2, -h / 2, w / 2, h / 2)
  g.lineBetween(w / 2, -h / 2, -w / 2, h / 2)
}

function drawBall(g: G, w: number, color: number): void {
  const r = w / 2
  g.fillStyle(color, 1)
  g.fillCircle(0, 0, r)
  g.fillStyle(0xffffff, 0.35)
  g.fillCircle(-r * 0.3, -r * 0.3, r * 0.28)
  g.lineStyle(1.5, 0x000000, 0.25)
  g.strokeCircle(0, 0, r)
}

function drawBin(g: G, w: number, h: number, color: number): void {
  g.fillStyle(color, 0.9)
  g.fillRect(-w / 2, -h / 2, w * 0.16, h)
  g.fillRect(w / 2 - w * 0.16, -h / 2, w * 0.16, h)
  g.fillRect(-w / 2, h / 2 - h * 0.18, w, h * 0.18)
  g.lineStyle(1, 0x000000, 0.3)
  g.strokeRect(-w / 2, -h / 2, w, h)
}

function drawWater(g: G, w: number, h: number, color: number): void {
  g.fillStyle(color, 0.7)
  g.fillRect(-w / 2, -h / 2, w, h)
  g.lineStyle(1.5, 0xffffff, 0.3)
  for (let i = 0; i < 3; i++) {
    const y = -h / 2 + (i + 1) * (h / 4)
    g.lineBetween(-w / 2, y, w / 2, y)
  }
}

function drawGoal(g: G, w: number, h: number): void {
  const r = Math.max(w, h) / 2
  g.fillStyle(KIND_COLOR.goal, 0.18)
  g.fillCircle(0, 0, r)
  g.lineStyle(2, KIND_COLOR.goal, 0.8)
  g.strokeCircle(0, 0, r)
}

function drawBeam(g: G, w: number, h: number, color: number): void {
  g.fillStyle(color, 1)
  g.fillRect(-w / 2, -h / 2, w, h)
  g.fillStyle(shade(color, 0.7), 1)
  g.fillRect(-w / 2, h / 2 - h * 0.35, w, h * 0.35)
  g.lineStyle(1, 0x000000, 0.25)
  g.strokeRect(-w / 2, -h / 2, w, h)
}

function drawBlock(g: G, w: number, h: number, color: number): void {
  g.fillStyle(color, 1)
  g.fillRoundedRect(-w / 2, -h / 2, w, h, 4)
  g.lineStyle(1.5, 0xffffff, 0.3)
  g.strokeRoundedRect(-w / 2, -h / 2, w, h, 4)
}
