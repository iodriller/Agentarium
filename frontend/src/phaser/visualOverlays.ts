import type Phaser from 'phaser'
import type {
  EpisodeTrace,
  Frame,
  FrameBody,
  JointMeta,
  TraceVisualEvent,
} from '../api/types'
import { isoProject } from './isoProps'

type G = Phaser.GameObjects.Graphics
type Point = { sx: number; sy: number }
type ProjectSide = (x: number, y: number) => Point

function bodyPose(trace: EpisodeTrace, frame: Frame, id: string): FrameBody | null {
  const dynamic = frame.bodies[id]
  if (dynamic) return dynamic
  const prop = trace.world_static.find((item) => item.id === id)
  if (!prop) return null
  return {
    x: prop.position[0] ?? 0,
    y: prop.position[1] ?? 0,
    angle: prop.angle ?? 0,
    z: prop.z ?? 0,
  }
}

function anchorPoint(body: FrameBody, anchor: number[]): { x: number; y: number } {
  const ax = anchor[0] ?? 0
  const ay = anchor[1] ?? 0
  const cos = Math.cos(body.angle)
  const sin = Math.sin(body.angle)
  return {
    x: body.x + ax * cos - ay * sin,
    y: body.y + ax * sin + ay * cos,
  }
}

function jointColor(joint: JointMeta): number {
  if (joint.motor_rate != null) return 0xc084fc
  if (joint.type === 'spring') return 0x38bdf8
  if (joint.type === 'slide') return 0xf59e0b
  return 0xcbd5e1
}

export function drawSideJoints(
  g: G,
  trace: EpisodeTrace,
  frame: Frame,
  project: ProjectSide,
  time: number,
  engineering: boolean,
): void {
  for (const joint of trace.joints ?? []) {
    const bodyA = bodyPose(trace, frame, joint.body_a)
    const bodyB = bodyPose(trace, frame, joint.body_b)
    if (!bodyA || !bodyB) continue
    const anchorA = anchorPoint(bodyA, joint.anchor_a)
    const anchorB = anchorPoint(bodyB, joint.anchor_b)
    const a = project(anchorA.x, anchorA.y)
    const b = project(anchorB.x, anchorB.y)
    const color = jointColor(joint)

    if (joint.type === 'spring') {
      const segments = 8
      const dx = b.sx - a.sx
      const dy = b.sy - a.sy
      const length = Math.hypot(dx, dy) || 1
      const nx = -dy / length
      const ny = dx / length
      g.lineStyle(engineering ? 2 : 1.5, color, engineering ? 0.95 : 0.65)
      g.beginPath()
      g.moveTo(a.sx, a.sy)
      for (let i = 1; i < segments; i++) {
        const t = i / segments
        const offset = (i % 2 === 0 ? -1 : 1) * 4
        g.lineTo(a.sx + dx * t + nx * offset, a.sy + dy * t + ny * offset)
      }
      g.lineTo(b.sx, b.sy)
      g.strokePath()
    } else {
      g.lineStyle(engineering ? 2 : 1.2, color, engineering ? 0.9 : 0.42)
      g.lineBetween(a.sx, a.sy, b.sx, b.sy)
    }

    const pulse = joint.motor_rate == null ? 0 : 1.5 + Math.sin(time * 6 * joint.motor_rate) * 1.5
    g.fillStyle(0x111827, 0.9)
    g.fillCircle(a.sx, a.sy, engineering ? 6 : 4)
    g.fillStyle(color, 1)
    g.fillCircle(a.sx, a.sy, (engineering ? 3.5 : 2.5) + pulse)
    g.fillStyle(0x111827, 0.9)
    g.fillCircle(b.sx, b.sy, engineering ? 6 : 4)
    g.fillStyle(color, 1)
    g.fillCircle(b.sx, b.sy, engineering ? 3.5 : 2.5)

    if (joint.motor_rate != null) {
      g.lineStyle(2, color, 0.8)
      const radius = engineering ? 12 : 8
      g.beginPath()
      g.arc(a.sx, a.sy, radius, -1.2, 1.8, joint.motor_rate < 0)
      g.strokePath()
    }
  }
}

function eventBodyId(event: TraceVisualEvent): string | null {
  if ('body_id' in event && typeof event.body_id === 'string') return event.body_id
  if ('body_a' in event && typeof event.body_a === 'string' && event.body_a !== '__ground__') {
    return event.body_a
  }
  if ('body_b' in event && typeof event.body_b === 'string' && event.body_b !== '__ground__') {
    return event.body_b
  }
  return null
}

export function drawSideFrameEffects(
  g: G,
  trace: EpisodeTrace,
  frame: Frame,
  previous: Frame | undefined,
  project: ProjectSide,
  engineering: boolean,
): void {
  if (previous) {
    for (const [id, body] of Object.entries(frame.bodies)) {
      const before = previous.bodies[id]
      if (!before) continue
      const a = project(before.x, before.y)
      const b = project(body.x, body.y)
      const distance = Math.hypot(b.sx - a.sx, b.sy - a.sy)
      if (distance < 1.5) continue
      g.lineStyle(engineering ? 2 : 1.2, engineering ? 0x67e8f9 : 0xffffff, engineering ? 0.85 : 0.18)
      g.lineBetween(a.sx, a.sy, b.sx, b.sy)
      if (engineering) {
        const angle = Math.atan2(b.sy - a.sy, b.sx - a.sx)
        g.lineBetween(b.sx, b.sy, b.sx - Math.cos(angle - 0.5) * 7, b.sy - Math.sin(angle - 0.5) * 7)
        g.lineBetween(b.sx, b.sy, b.sx - Math.cos(angle + 0.5) * 7, b.sy - Math.sin(angle + 0.5) * 7)
      }
    }
  }

  for (const event of frame.events ?? []) {
    const id = eventBodyId(event)
    const body = id ? bodyPose(trace, frame, id) : null
    const point = body ? project(body.x, body.y) : null
    if (event.type === 'body_created' && point) {
      g.lineStyle(2, 0x67e8f9, 0.8)
      g.strokeCircle(point.sx, point.sy, 18)
    } else if (event.type === 'contact_started' && point) {
      g.fillStyle(0xfbbf24, 0.85)
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI * 2 * i) / 6
        g.fillCircle(point.sx + Math.cos(angle) * 10, point.sy + Math.sin(angle) * 10, 2)
      }
    } else if (event.type === 'goal_reached' && point) {
      g.lineStyle(4, 0x34d399, 0.9)
      g.strokeCircle(point.sx, point.sy, 28)
      g.strokeCircle(point.sx, point.sy, 40)
    } else if (event.type === 'structure_stressed' && point) {
      const level = typeof event.level === 'number' ? event.level : 0.5
      g.lineStyle(3, level > 0.75 ? 0xef4444 : 0xf59e0b, 0.9)
      g.strokeCircle(point.sx, point.sy, 12 + level * 12)
    } else if (event.type === 'object_sorted' && point) {
      const accepted = event.accepted !== false
      g.lineStyle(4, accepted ? 0x34d399 : 0xef4444, 0.9)
      g.strokeCircle(point.sx, point.sy, 22)
      g.lineStyle(2, accepted ? 0x6ee7b7 : 0xfda4af, 0.65)
      g.strokeCircle(point.sx, point.sy, 32)
    } else if (event.type === 'body_destroyed' && point) {
      g.lineStyle(3, 0xfb7185, 0.9)
      for (let i = 0; i < 9; i++) {
        const angle = (Math.PI * 2 * i) / 9
        g.lineBetween(
          point.sx + Math.cos(angle) * 5,
          point.sy + Math.sin(angle) * 5,
          point.sx + Math.cos(angle) * 28,
          point.sy + Math.sin(angle) * 28,
        )
      }
    }
  }
}

export function drawIsoFrameEffects(
  g: G,
  frame: Frame,
  previous: Frame | undefined,
  engineering: boolean,
): void {
  if (!previous) return
  for (const [id, body] of Object.entries(frame.bodies)) {
    const before = previous.bodies[id]
    if (!before) continue
    const a = isoProject(before.x, before.z ?? 0, 0)
    const b = isoProject(body.x, body.z ?? 0, 0)
    g.lineStyle(2, engineering ? 0x67e8f9 : 0xffffff, engineering ? 0.85 : 0.18)
    g.lineBetween(a.sx, a.sy, b.sx, b.sy)
  }
}
