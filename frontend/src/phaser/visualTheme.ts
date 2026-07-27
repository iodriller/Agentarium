import type { VisualStyle } from '../api/types'

export interface VisualTheme {
  style: VisualStyle
  skyTop: number
  skyBottom: number
  ground: number
  groundEdge: number
  grid: number
  outline: number
  haze: number
  accent: number
  hazard: number
  shadowAlpha: number
}

const TERRAIN: Record<string, { skyTop: number; skyBottom: number; ground: number; edge: number }> = {
  grassland: { skyTop: 0x0d1726, skyBottom: 0x243d52, ground: 0x416f31, edge: 0x294a22 },
  desert: { skyTop: 0x24170c, skyBottom: 0x765331, ground: 0xb47b3b, edge: 0x754923 },
  factory: { skyTop: 0x10151d, skyBottom: 0x313d4a, ground: 0x4b5059, edge: 0x2d333b },
  city: { skyTop: 0x0b1320, skyBottom: 0x2b3d56, ground: 0x3a4658, edge: 0x222d3b },
  cave: { skyTop: 0x08090d, skyBottom: 0x241f23, ground: 0x2e2924, edge: 0x171512 },
}

function channel(color: number, shift: number): number {
  return (color >> shift) & 0xff
}

export function mixColor(a: number, b: number, amount: number): number {
  const t = Math.max(0, Math.min(1, amount))
  const mix = (shift: number) => Math.round(channel(a, shift) * (1 - t) + channel(b, shift) * t)
  return (mix(16) << 16) | (mix(8) << 8) | mix(0)
}

export function styleColor(color: number, style: VisualStyle | undefined): number {
  switch (style) {
    case 'blueprint': {
      const brightness = (channel(color, 16) + channel(color, 8) + channel(color, 0)) / (255 * 3)
      return mixColor(0x315a77, 0x92e7ff, 0.18 + brightness * 0.6)
    }
    case 'neon_lab':
      return mixColor(color, channel(color, 16) > channel(color, 0) ? 0xff4fd8 : 0x39f6ff, 0.24)
    case 'playful':
      return mixColor(color, 0xffe7a3, 0.12)
    default:
      return color
  }
}

export function materialColor(
  color: number,
  material: string | null | undefined,
  style?: VisualStyle,
): number {
  let resolved = color
  switch (material) {
    case 'wood':
      resolved = mixColor(color, 0xb7793f, 0.48)
      break
    case 'rubber':
      resolved = mixColor(color, 0x252b34, 0.58)
      break
    case 'glass':
      resolved = mixColor(color, 0xa8e7f5, 0.5)
      break
    case 'concrete':
      resolved = mixColor(color, 0x9ca3a6, 0.45)
      break
    case 'steel':
    case 'metal':
      resolved = mixColor(color, 0x8f9aaa, 0.35)
      break
  }
  return styleColor(resolved, style)
}

export function resolveVisualTheme(
  terrain = 'grassland',
  style: VisualStyle = 'realistic',
): VisualTheme {
  const base = TERRAIN[terrain] ?? TERRAIN.grassland
  if (style === 'blueprint') {
    return {
      style,
      skyTop: 0x061724,
      skyBottom: 0x103c59,
      ground: 0x0e3046,
      groundEdge: 0x5fdcff,
      grid: 0x5fdcff,
      outline: 0x07131d,
      haze: 0x1b6687,
      accent: 0x8cecff,
      hazard: 0xff9e64,
      shadowAlpha: 0.2,
    }
  }
  if (style === 'neon_lab') {
    return {
      style,
      skyTop: 0x090815,
      skyBottom: 0x241444,
      ground: mixColor(base.ground, 0x17132d, 0.7),
      groundEdge: 0x7c5cff,
      grid: 0x3f7d9d,
      outline: 0x05040b,
      haze: 0x4b2275,
      accent: 0x39f6ff,
      hazard: 0xff4f8b,
      shadowAlpha: 0.52,
    }
  }
  if (style === 'playful') {
    return {
      style,
      skyTop: mixColor(base.skyTop, 0x4d78a8, 0.35),
      skyBottom: mixColor(base.skyBottom, 0x8ec5e8, 0.35),
      ground: mixColor(base.ground, 0x75ad55, 0.26),
      groundEdge: base.edge,
      grid: 0x45566c,
      outline: 0x151921,
      haze: 0x7893ae,
      accent: 0xffd166,
      hazard: 0xff7657,
      shadowAlpha: 0.28,
    }
  }
  return {
    style,
    skyTop: base.skyTop,
    skyBottom: base.skyBottom,
    ground: base.ground,
    groundEdge: base.edge,
    grid: 0x273243,
    outline: 0x0b0e14,
    haze: base.skyBottom,
    accent: 0xf6c85f,
    hazard: 0xf59e0b,
    shadowAlpha: 0.38,
  }
}
