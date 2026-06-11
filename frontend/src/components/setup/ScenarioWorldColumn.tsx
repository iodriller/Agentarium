import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import type {
  LaunchConfig,
  PhysicsEngine,
  ScenarioPreset,
  Terrain,
  VisualStyle,
  WorldTemplate,
} from '../../api/types'

// ─── Props ────────────────────────────────────────────────────────────────────

interface ScenarioWorldColumnProps {
  config: Partial<LaunchConfig>
  onConfigChange: (patch: Partial<LaunchConfig>) => void
}

// ─── Custom scenario card (not from API) ──────────────────────────────────────

const CUSTOM_PRESET: ScenarioPreset = {
  id: 'custom',
  name: 'Custom Scenario',
  tagline: 'Start from scratch.',
  tags: ['Custom'],
  objective: '',
  reward: '',
  default_world: '',
  required_tools: [],
  recommended_tools: [],
}

// ─── Shared sub-components (match ToolsLaunchColumn styling) ───────────────────

function SectionHeader({
  title,
  open,
  onToggle,
}: {
  title: string
  open: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        width: '100%',
        background: 'none',
        border: 'none',
        padding: '8px 0 4px',
        cursor: 'pointer',
        color: 'var(--text-1)',
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.8px',
          textTransform: 'uppercase',
          color: 'var(--text-2)',
        }}
      >
        {title}
      </span>
      <span style={{ fontSize: 10, color: 'var(--text-2)' }}>{open ? '▾' : '▸'}</span>
    </button>
  )
}

function Divider() {
  return <div style={{ borderTop: '1px solid var(--border)', margin: '12px 0' }} />
}

function SmallChip({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '1px 6px',
        borderRadius: 8,
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        color: 'var(--text-2)',
        fontSize: 9,
        fontWeight: 600,
      }}
    >
      {children}
    </span>
  )
}

function selectStyle(): React.CSSProperties {
  return {
    background: 'var(--surface-2)',
    color: 'var(--text-1)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    padding: '3px 6px',
    fontSize: 11,
    cursor: 'pointer',
  }
}

function inputStyle(): React.CSSProperties {
  return {
    background: 'var(--surface-2)',
    color: 'var(--text-1)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    padding: '3px 6px',
    fontSize: 11,
    width: '100%',
    boxSizing: 'border-box',
  }
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '120px 1fr',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
      }}
    >
      <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{label}</span>
      {children}
    </div>
  )
}

// ─── Challenge card ───────────────────────────────────────────────────────────

function ChallengeCard({
  preset,
  selected,
  onSelect,
}: {
  preset: ScenarioPreset
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        width: '100%',
        textAlign: 'left',
        padding: 10,
        marginBottom: 8,
        borderRadius: 8,
        border: selected ? '1px solid var(--accent)' : '1px solid var(--border)',
        background: selected ? 'var(--accent-soft)' : 'var(--surface-1)',
        boxShadow: selected ? '0 0 0 1px var(--accent)' : 'none',
        cursor: 'pointer',
      }}
    >
      {/* Icon placeholder box */}
      <div
        style={{
          width: 36,
          height: 36,
          flexShrink: 0,
          borderRadius: 6,
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
        }}
      />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{preset.name}</div>
        <div style={{ fontSize: 10, color: 'var(--text-2)', marginTop: 2 }}>{preset.tagline}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
          {preset.tags.map((tag) => (
            <SmallChip key={tag}>{tag}</SmallChip>
          ))}
        </div>
      </div>
    </button>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ScenarioWorldColumn({ config, onConfigChange }: ScenarioWorldColumnProps) {
  const [presets, setPresets] = useState<ScenarioPreset[]>([])
  const [worlds, setWorlds] = useState<WorldTemplate[]>([])
  const [advancedOpen, setAdvancedOpen] = useState(false)

  // ── Fetch presets + worlds on mount ──
  useEffect(() => {
    api
      .get<ScenarioPreset[]>('/presets')
      .then(setPresets)
      .catch(() => {
        /* backend may be down in tests */
      })
    api
      .get<WorldTemplate[]>('/worlds')
      .then(setWorlds)
      .catch(() => {
        /* backend may be down in tests */
      })
  }, [])

  const scenario = config.scenario
  const world = config.world

  const selectedPresetId = scenario?.preset ?? ''
  const selectedWorldId = world?.template ?? ''

  // All cards: API presets + custom card
  const allCards: ScenarioPreset[] = [...presets, CUSTOM_PRESET]

  // ── Apply a world template's dependent fields ──
  function worldFieldsFor(worldId: string): Partial<LaunchConfig['world']> {
    const w = worlds.find((x) => x.id === worldId)
    if (!w) return { template: worldId }
    return {
      template: w.id,
      terrain: w.terrain,
      map_size: w.map_size,
      gravity: w.gravity,
      active_physics_zones: w.active_physics_zones,
    }
  }

  // ── Selecting a challenge preset auto-fills scenario, world, and required tools ──
  function handleSelectPreset(preset: ScenarioPreset) {
    onConfigChange({
      scenario: {
        preset: preset.id,
        objective: preset.objective,
        reward: preset.reward,
      },
      world: worldFieldsFor(preset.default_world),
      tools: { enabled: preset.required_tools },
    } as Partial<LaunchConfig>)
  }

  function handleSelectPresetById(id: string) {
    const preset = allCards.find((p) => p.id === id)
    if (preset) handleSelectPreset(preset)
  }

  // ── Changing world template updates dependent fields ──
  function handleSelectWorld(worldId: string) {
    onConfigChange({ world: worldFieldsFor(worldId) } as Partial<LaunchConfig>)
  }

  function handleWorldField(patch: Partial<LaunchConfig['world']>) {
    onConfigChange({
      world: { template: selectedWorldId, ...patch },
    } as Partial<LaunchConfig>)
  }

  const selectedWorld = worlds.find((w) => w.id === selectedWorldId)
  const mapSize = world?.map_size ?? selectedWorld?.map_size

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* ── Section 1: Challenge Preset ── */}
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.8px',
          textTransform: 'uppercase',
          color: 'var(--text-2)',
          marginBottom: 8,
        }}
      >
        Challenge Preset
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 10,
        }}
      >
        <select
          value={selectedPresetId}
          onChange={(e) => handleSelectPresetById(e.target.value)}
          style={{ ...selectStyle(), flex: 1 }}
        >
          {allCards.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <a
          href="#"
          onClick={(e) => e.preventDefault()}
          style={{
            fontSize: 11,
            color: 'var(--accent)',
            textDecoration: 'none',
            whiteSpace: 'nowrap',
            cursor: 'pointer',
          }}
        >
          View Details
        </a>
      </div>

      {/* Challenge cards */}
      <div>
        {allCards.map((preset) => (
          <ChallengeCard
            key={preset.id}
            preset={preset}
            selected={preset.id === selectedPresetId}
            onSelect={() => handleSelectPreset(preset)}
          />
        ))}
      </div>

      <Divider />

      {/* ── Section 2: World Settings ── */}
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.8px',
          textTransform: 'uppercase',
          color: 'var(--text-2)',
          marginBottom: 10,
        }}
      >
        World Settings
      </div>

      <FieldRow label="World Template">
        <select
          value={selectedWorldId}
          onChange={(e) => handleSelectWorld(e.target.value)}
          style={selectStyle()}
        >
          {worlds.length === 0 && selectedWorldId && (
            <option value={selectedWorldId}>{selectedWorldId}</option>
          )}
          {worlds.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </FieldRow>

      <FieldRow label="Terrain">
        <select
          value={world?.terrain ?? 'grassland'}
          onChange={(e) => handleWorldField({ terrain: e.target.value as Terrain })}
          style={selectStyle()}
        >
          <option value="grassland">Grassland</option>
          <option value="desert">Desert</option>
          <option value="factory">Factory</option>
          <option value="city">City</option>
          <option value="cave">Cave</option>
        </select>
      </FieldRow>

      {/* Physics Engine — radio-style */}
      <FieldRow label="Physics Engine">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input
              type="radio"
              name="physics-engine"
              checked={(world?.engine ?? 'pymunk2d') === 'pymunk2d'}
              onChange={() => handleWorldField({ engine: 'pymunk2d' as PhysicsEngine })}
              style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
            />
            <span style={{ fontSize: 11, color: 'var(--text-1)' }}>Pymunk 2D (Stable)</span>
          </label>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              cursor: 'not-allowed',
              opacity: 0.6,
            }}
          >
            <input
              type="radio"
              name="physics-engine"
              disabled
              checked={world?.engine === 'pybullet3d'}
              readOnly
              style={{ cursor: 'not-allowed' }}
            />
            <span style={{ fontSize: 11, color: 'var(--text-2)' }}>PyBullet 3D (Beta)</span>
            <span
              style={{
                fontSize: 9,
                fontWeight: 600,
                padding: '1px 6px',
                borderRadius: 8,
                background: 'color-mix(in srgb, var(--warn) 15%, transparent)',
                border: '1px solid var(--warn)',
                color: 'var(--warn)',
              }}
            >
              Coming Soon
            </span>
          </label>
        </div>
      </FieldRow>

      <FieldRow label="Gravity (m/s²)">
        <input
          type="number"
          step={0.01}
          value={world?.gravity ?? -9.81}
          onChange={(e) => handleWorldField({ gravity: Number(e.target.value) })}
          style={inputStyle()}
        />
      </FieldRow>

      <FieldRow label="Map Size">
        <span style={{ fontSize: 11, color: 'var(--text-1)' }}>
          {mapSize ? `${mapSize[0]} x ${mapSize[1]} tiles` : '—'}
        </span>
      </FieldRow>

      <FieldRow label="Physics Zones">
        <input
          type="number"
          min={0}
          value={world?.active_physics_zones ?? 0}
          onChange={(e) => handleWorldField({ active_physics_zones: Number(e.target.value) })}
          style={inputStyle()}
        />
      </FieldRow>

      <FieldRow label="Visual Style">
        <select
          value={world?.visual_style ?? 'realistic'}
          onChange={(e) => handleWorldField({ visual_style: e.target.value as VisualStyle })}
          style={selectStyle()}
        >
          <option value="realistic">Realistic</option>
          <option value="playful">Playful</option>
          <option value="blueprint">Blueprint</option>
          <option value="neon_lab">Neon Lab</option>
        </select>
      </FieldRow>

      <Divider />

      {/* ── Section 3: Advanced Settings (collapsible) ── */}
      <SectionHeader
        title="Advanced Settings · Optional"
        open={advancedOpen}
        onToggle={() => setAdvancedOpen((o) => !o)}
      />

      {advancedOpen && (
        <div style={{ marginTop: 6 }}>
          <FieldRow label="Seed">
            <input
              type="number"
              value={world?.seed ?? ''}
              onChange={(e) =>
                handleWorldField({
                  seed: e.target.value === '' ? null : Number(e.target.value),
                })
              }
              style={inputStyle()}
            />
          </FieldRow>
          <div style={{ fontSize: 10, color: 'var(--text-2)', marginTop: 4 }}>
            Randomization, Debug — coming soon.
          </div>
        </div>
      )}
    </div>
  )
}

export type { ScenarioWorldColumnProps }
