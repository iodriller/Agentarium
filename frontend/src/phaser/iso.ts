// Pure isometric projection helpers — no Phaser dependency.
//
// Physics space: x to the right, y up-positive (a falling body has decreasing y).
// Screen space:  x to the right, y down-positive.
//
// We project onto a 2:1 isometric grid. The world-vertical axis (physics y) is
// inverted so that a body whose physics y decreases moves *downward* on screen.

export const TILE_W = 64
export const TILE_H = 32

export interface IsoPoint {
  sx: number
  sy: number
}

/**
 * Project a physics-space (x, y) coordinate into screen-space isometric pixels.
 *
 * sx = (x - y) * tileW / 2
 * sy = (x + y) * tileH / 2
 *
 * Because physics y is up-positive but screen y is down-positive, we feed the
 * negated physics y into the projection so falling bodies descend on screen.
 */
export function isoProject(
  x: number,
  y: number,
  tileW: number = TILE_W,
  tileH: number = TILE_H,
): IsoPoint {
  const wy = -y // invert: physics-up -> screen-down
  return {
    sx: (x - wy) * (tileW / 2),
    sy: (x + wy) * (tileH / 2),
  }
}
