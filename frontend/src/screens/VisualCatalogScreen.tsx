import { useMemo, useState } from 'react'
import type {
  BodyMeta,
  EpisodeTrace,
  FrameBody,
  StaticProp,
  VisualStyle,
} from '../api/types'
import { TopBar } from '../components/shared/TopBar'
import { WorldView } from '../components/studio/WorldView'

type CatalogScene = 'city' | 'bridge' | 'crawl' | 'sorter'

const STYLES: { value: VisualStyle; label: string }[] = [
  { value: 'realistic', label: 'Diorama' },
  { value: 'playful', label: 'Playful' },
  { value: 'blueprint', label: 'Blueprint' },
  { value: 'neon_lab', label: 'Neon Lab' },
]

export function VisualCatalogScreen() {
  const [scene, setScene] = useState<CatalogScene>('city')
  const [style, setStyle] = useState<VisualStyle>('realistic')
  const trace = useMemo(() => catalogTrace(scene, style), [scene, style])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <TopBar projectName="Visual Catalog" status="online" />
      <div
        style={{
          padding: '14px 18px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface-1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 style={{ fontSize: 17, color: 'var(--text-1)', marginBottom: 3 }}>
            Renderer visual catalog
          </h1>
          <p style={{ fontSize: 11, color: 'var(--text-2)' }}>
            Deterministic reference scenes for themes, semantic props, materials, joints, and effects.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
          {(['city', 'bridge', 'crawl', 'sorter'] as CatalogScene[]).map((value) => (
            <CatalogButton
              key={value}
              label={value}
              active={scene === value}
              onClick={() => setScene(value)}
            />
          ))}
          <select
            aria-label="Visual style"
            value={style}
            onChange={(event) => setStyle(event.target.value as VisualStyle)}
            style={{
              padding: '6px 9px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--surface-2)',
              color: 'var(--text-1)',
              fontSize: 11,
            }}
          >
            {STYLES.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <WorldView trace={trace} frameIndex={trace.frames.length - 1} />
      </div>
    </div>
  )
}

function CatalogButton({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '6px 9px',
        borderRadius: 6,
        border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
        background: active
          ? 'color-mix(in srgb, var(--accent) 14%, var(--surface-2))'
          : 'var(--surface-2)',
        color: active ? 'var(--accent)' : 'var(--text-2)',
        fontSize: 10,
        fontWeight: 700,
        textTransform: 'uppercase',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}

function visual(material: string | null, seed: number) {
  return { material, seed, variant: `v${seed % 4}`, condition: 'normal' }
}

function prop(
  id: string,
  kind: string,
  x: number,
  y: number,
  size: number[],
  color?: string,
  z = 0,
  material: string | null = null,
): StaticProp {
  return {
    id,
    kind,
    position: [x, y],
    size,
    color,
    z,
    shape: 'box',
    visual: visual(material, id.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)),
  }
}

function catalogTrace(scene: CatalogScene, style: VisualStyle): EpisodeTrace {
  if (scene === 'city') return cityTrace(style)
  if (scene === 'crawl') return crawlTrace(style)
  if (scene === 'sorter') return sorterTrace(style)
  return bridgeTrace(style)
}

function baseTrace(
  scene: string,
  style: VisualStyle,
  terrain: string,
  camera: string,
  worldStatic: StaticProp[],
  bodies: Record<string, FrameBody> = {},
  bodyMeta: Record<string, BodyMeta> = {},
): EpisodeTrace {
  return {
    version: 3,
    run_id: `visual-catalog-${scene}`,
    attempt_id: 'catalog',
    engine: camera === 'iso' ? 'citysim' : 'pymunk2d',
    camera,
    terrain,
    visual_style: style,
    visual_seed: 42,
    dt: 1 / 30,
    world_static: worldStatic,
    body_meta: bodyMeta,
    joints: [],
    frames: [
      { t: 0, bodies },
      { t: 1, bodies },
    ],
  }
}

function cityTrace(style: VisualStyle): EpisodeTrace {
  const props = [
    prop('road-main', 'road', 0, 0, [30, 0.12, 3], '#4b5563', 0),
    prop('road-cross', 'road', 0, 0, [3, 0.12, 25], '#4b5563', 0),
    prop('house-a', 'house', -8, 0, [3.4, 3.2, 3], '#d9a066', -5),
    prop('house-b', 'house', -4, 0, [3, 2.7, 2.6], '#e2a66e', -5),
    prop('apartments', 'apartment', 5, 0, [4.2, 8, 3.8], '#c084fc', -5),
    prop('tower', 'tower', 10, 0, [3.6, 12, 3.6], '#9b8ab0', -4.5),
    prop('shop', 'shop', -7, 0, [4.2, 3.4, 3.2], '#60a5fa', 5),
    prop('school', 'school', -2, 0, [5, 4, 3.8], '#f87171', 5),
    prop('hospital', 'hospital', 4, 0, [4.5, 6.5, 4], '#f1f5f9', 5),
    prop('factory', 'factory', 10, 0, [5.5, 4, 4.5], '#78716c', 5),
    prop('park', 'park', -8, 0, [6.5, 0.15, 5], '#4f8a4a', 11),
    prop('plaza', 'plaza', 0, 0, [5.5, 0.15, 5], '#9ca3af', 11),
    prop('fountain', 'fountain', 0, 0, [2, 0.25, 2], '#38bdf8', 11),
    prop('tree-a', 'tree', 6, 0, [1.4, 3, 1.4], '#4a8c4a', 11),
    prop('tree-b', 'tree', 9, 0, [1.2, 2.6, 1.2], '#4a8c4a', 11),
  ]
  const trace = baseTrace('city', style, 'city', 'iso', props)
  trace.frames = [
    {
      t: 8,
      bodies: {},
      events: [
        {
          type: 'city_tick',
          population: 426,
          budget: 1840,
          happiness: 0.87,
          pollution: 9,
        },
      ],
    },
  ]
  return trace
}

function bridgeTrace(style: VisualStyle): EpisodeTrace {
  const world = [
    prop('left-cliff', 'wall', -9, 1.5, [10, 3], '#64748b', 0, 'concrete'),
    prop('right-cliff', 'wall', 8, 1.2, [10, 2.4], '#64748b', 0, 'concrete'),
    prop('water', 'water', 0, -1.5, [8, 1], '#2563eb'),
    {
      ...prop('deck', 'deck', 0, 3.1, [9, 0.25], '#9a6a3a', 0, 'wood'),
      shape: 'segment',
      angle: -0.04,
    },
    prop('goal', 'goal', 8, 2.5, [1, 2], '#22c55e'),
  ]
  const bodies = { crate: { x: 5.5, y: 3.8, angle: 0.6 } }
  const meta = {
    crate: {
      shape: 'circle',
      size: [0.65],
      color: '#d97706',
      kind: 'crate',
      visual: visual('wood', 12),
    },
  }
  const trace = baseTrace('bridge', style, 'grassland', 'side', world, bodies, meta)
  trace.frames[1].events = [{ type: 'goal_reached', body_id: 'crate', goal_id: 'goal' }]
  return trace
}

function crawlTrace(style: VisualStyle): EpisodeTrace {
  const world = [
    prop('hill', 'park', 0, 0.8, [15, 1.6], '#4d7c0f'),
    prop('clearance', 'beam', 1, 2.3, [4, 0.2], '#64748b', 0, 'metal'),
    prop('goal', 'goal', 7, 1.4, [1, 2], '#22c55e'),
  ]
  const bodies = {
    torso: { x: -1, y: 2.4, angle: 0.08 },
    front_leg: { x: -0.35, y: 1.65, angle: -0.7 },
    rear_leg: { x: -1.7, y: 1.65, angle: 0.55 },
  }
  const meta: Record<string, BodyMeta> = {
    torso: { shape: 'box', size: [1.5, 0.65], color: '#7c3aed', kind: 'torso', visual: visual('rubber', 4) },
    front_leg: { shape: 'segment', size: [1.2], color: '#8b5cf6', kind: 'leg', visual: visual('metal', 7) },
    rear_leg: { shape: 'segment', size: [1.2], color: '#8b5cf6', kind: 'leg', visual: visual('metal', 9) },
  }
  const trace = baseTrace('crawl', style, 'grassland', 'side', world, bodies, meta)
  trace.joints = [
    { id: 'front-hip', body_a: 'torso', body_b: 'front_leg', type: 'pivot', anchor_a: [0.5, -0.3], anchor_b: [-0.5, 0], motor_rate: 1.2 },
    { id: 'rear-hip', body_a: 'torso', body_b: 'rear_leg', type: 'pivot', anchor_a: [-0.5, -0.3], anchor_b: [-0.5, 0], motor_rate: -1.2 },
  ]
  return trace
}

function sorterTrace(style: VisualStyle): EpisodeTrace {
  const world = [
    prop('factory-table', 'conveyor', 0, 0.7, [13, 1.4], '#64748b', 0, 'metal'),
    prop('red-pad', 'target_pad', -3, 1.55, [2.3, 0.25], '#ef4444'),
    prop('blue-pad', 'target_pad', 2, 1.55, [2.3, 0.25], '#3b82f6'),
    prop('red-bin', 'bin', -3, 3, [2.1, 3.2], '#ef4444'),
    prop('blue-bin', 'bin', 2, 3, [2.1, 3.2], '#3b82f6'),
    {
      ...prop('red-chute', 'chute', -3.8, 5.1, [3, 0.25], '#9ca3af', 0, 'metal'),
      shape: 'segment',
      angle: -0.35,
    },
    {
      ...prop('blue-chute', 'chute', 2.8, 5.1, [3, 0.25], '#9ca3af', 0, 'metal'),
      shape: 'segment',
      angle: 0.35,
    },
  ]
  const bodies = {
    red_ball: { x: -3, y: 3.6, angle: 1.1 },
    blue_ball: { x: 2, y: 3.6, angle: -0.8 },
  }
  const meta: Record<string, BodyMeta> = {
    red_ball: { shape: 'circle', size: [0.45], color: 'red', kind: 'ball', visual: visual('rubber', 2) },
    blue_ball: { shape: 'circle', size: [0.45], color: 'blue', kind: 'ball', visual: visual('rubber', 3) },
  }
  const trace = baseTrace('sorter', style, 'factory', 'side', world, bodies, meta)
  trace.frames[1].events = [
    { type: 'object_sorted', body_id: 'red_ball', bin_id: 'red-bin', accepted: true },
    { type: 'object_sorted', body_id: 'blue_ball', bin_id: 'blue-bin', accepted: true },
  ]
  return trace
}
