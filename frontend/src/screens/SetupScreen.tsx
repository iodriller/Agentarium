import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError, api } from '../api/client'
import type { LaunchConfig, LaunchResponse, ValidationResult } from '../api/types'
import { AgentLLMColumn } from '../components/setup/AgentLLMColumn'
import { ScenarioWorldColumn } from '../components/setup/ScenarioWorldColumn'
import { ToolsLaunchColumn } from '../components/setup/ToolsLaunchColumn'
import { TopBar } from '../components/shared/TopBar'

// Sensible defaults for the full config
const DEFAULT_CONFIG: Partial<LaunchConfig> = {
  scenario: { preset: 'bridge_builder', objective: '', reward: '' },
  world: { template: 'island_cliff_small', engine: 'pymunk2d' },
  agents: {
    mode: 'single',
    participants: [
      {
        id: 'agent_a',
        name: 'Agent A',
        role: 'builder',
        behavior_mode: 'engineer',
        provider: 'mock',
        model: 'mock',
        temperature: 0.7,
        max_attempts: 50,
        context_window: '8k',
        memory_mode: 'none',
        mutation_strategy: 'balanced',
      },
    ],
  },
  llm_connection: { endpoint_url: 'http://localhost:1234/v1' },
  tools: { enabled: [] },
  constraints: {
    max_parts: 300,
    max_joints: 120,
    energy_budget: 1200,
    max_attempts: 50,
    simulation_duration_seconds: 180,
    material_budget: 2000,
    collision_safety: 'strict',
    world_bounds: 'enforced',
    repair_loop_enabled: true,
  },
  outputs: {
    replay_json: true,
    scorecard_json: true,
    trace_jsonl: true,
    markdown_report: false,
    screenshot: false,
    video_capture: false,
  },
}

/** Turn a launch failure into a human message, pulling the backend's 422
 *  validation detail (state + missing list) out of an ApiError when present. */
function describeLaunchError(err: unknown): string {
  if (err instanceof ApiError) {
    const body = err.body as { detail?: { missing?: string[]; state?: string } } | null
    const detail = body?.detail
    if (detail?.missing && detail.missing.length > 0) {
      return `Launch blocked: ${detail.missing.join('; ')}`
    }
    if (err.status === 0 || err.status >= 500) {
      return 'Launch failed — the server is unreachable. Is it running?'
    }
    return `Launch failed (${err.status}). Check your configuration and try again.`
  }
  return 'Launch failed — the server is unreachable. Is it running?'
}

export function SetupScreen() {
  const navigate = useNavigate()
  const [config, setConfig] = useState<Partial<LaunchConfig>>(DEFAULT_CONFIG)
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null)
  const [launching, setLaunching] = useState(false)
  // null = unknown (not yet checked); true/false = last server call reachable.
  const [backendReachable, setBackendReachable] = useState<boolean | null>(null)
  const [launchError, setLaunchError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Merged config change handler
  const handleConfigChange = useCallback((patch: Partial<LaunchConfig>) => {
    setConfig((prev) => ({
      ...prev,
      ...patch,
      // Deep-merge nested objects so partial patches don't clobber sibling keys
      ...(patch.scenario !== undefined
        ? { scenario: { ...prev.scenario, ...patch.scenario } }
        : {}),
      ...(patch.world !== undefined
        ? { world: { ...prev.world, ...patch.world } }
        : {}),
      ...(patch.tools !== undefined
        ? { tools: { ...prev.tools, ...patch.tools } }
        : {}),
      ...(patch.constraints !== undefined
        ? { constraints: { ...prev.constraints, ...patch.constraints } }
        : {}),
      ...(patch.outputs !== undefined
        ? { outputs: { ...prev.outputs, ...patch.outputs } }
        : {}),
      // agents arrives as a full object from AgentLLMColumn — shallow merge is fine
      ...(patch.agents !== undefined
        ? { agents: { ...prev.agents, ...patch.agents } }
        : {}),
      ...(patch.llm_connection !== undefined
        ? { llm_connection: { ...prev.llm_connection, ...patch.llm_connection } }
        : {}),
    }))
  }, [])

  // Debounced validation
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      runValidation(config)
    }, 400)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [config])

  async function runValidation(cfg: Partial<LaunchConfig>) {
    try {
      const result = await api.post<ValidationResult>('/setup/validate', cfg)
      setValidationResult(result)
      setBackendReachable(true)
    } catch {
      // Couldn't reach the validation endpoint — surface it instead of leaving
      // the banner stuck on an eternal "Validating…".
      setBackendReachable(false)
    }
  }

  function handleValidateNow() {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    runValidation(config)
  }

  async function handleLaunch() {
    if (launching) return
    setLaunching(true)
    setLaunchError(null)
    try {
      const { run_id } = await api.post<LaunchResponse>('/setup/launch', config)
      navigate(`/studio/${run_id}`)
    } catch (err) {
      setLaunchError(describeLaunchError(err))
      setLaunching(false)
    }
  }

  async function handleSavePreset() {
    const name = window.prompt('Save preset as:')?.trim()
    if (!name) return
    try {
      await api.post('/setup/save-preset', { name, config })
      window.alert(`Saved preset "${name}".`)
    } catch (err) {
      console.error('Save preset failed', err)
      window.alert('Save preset failed — see console for details.')
    }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <TopBar
        projectName="Bridge Builder Lab"
        status={
          backendReachable === null ? 'connecting' : backendReachable ? 'online' : 'offline'
        }
      />

      {/* Title block */}
      <div
        style={{
          padding: '20px 24px 16px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface-1)',
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-1)', marginBottom: 4 }}>
          Simulation Setup
        </h1>
        <p style={{ fontSize: 12, color: 'var(--text-2)' }}>
          Configure your world, agents, tools, and constraints before launch.
        </p>
        {launchError && (
          <div
            role="alert"
            style={{
              marginTop: 12,
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid var(--danger)',
              background: 'color-mix(in srgb, var(--danger) 12%, transparent)',
              color: 'var(--danger)',
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <span>{launchError}</span>
            <button
              onClick={() => setLaunchError(null)}
              aria-label="Dismiss"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--danger)',
                cursor: 'pointer',
                fontSize: 14,
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Three-column layout */}
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 0,
          overflow: 'hidden',
        }}
      >
        {/* Column 1 — Scenario & World */}
        <div
          style={{
            borderRight: '1px solid var(--border)',
            padding: 16,
            overflowY: 'auto',
          }}
        >
          <ColumnHeader number={1} title="Scenario & World Setup" badge="Required" />
          <ScenarioWorldColumn config={config} onConfigChange={handleConfigChange} />
        </div>

        {/* Column 2 — Agent & LLM */}
        <div
          style={{
            borderRight: '1px solid var(--border)',
            padding: 16,
            overflowY: 'auto',
          }}
        >
          <ColumnHeader number={2} title="Agent & LLM Setup" badge="Required" />
          <AgentLLMColumn config={config} onConfigChange={handleConfigChange} />
        </div>

        {/* Column 3 — Tools, Constraints & Launch */}
        <div style={{ padding: 16, overflowY: 'auto' }}>
          <ColumnHeader number={3} title="Tools, Constraints & Launch" />
          <ToolsLaunchColumn
            config={config}
            onConfigChange={handleConfigChange}
            validationResult={validationResult}
            onValidateNow={handleValidateNow}
            onLaunch={handleLaunch}
            onSavePreset={handleSavePreset}
          />
        </div>
      </div>
    </div>
  )
}

function ColumnHeader({
  number,
  title,
  badge,
}: {
  number: number
  title: string
  badge?: string
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 16,
        paddingBottom: 12,
        borderBottom: '1px solid var(--border)',
      }}
    >
      <span
        style={{
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: 'var(--accent)',
          color: '#fff',
          fontSize: 11,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {number}
      </span>
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--text-1)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        {title}
      </span>
      {badge && (
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 10,
            padding: '2px 6px',
            borderRadius: 4,
            background: 'var(--accent-soft)',
            color: 'var(--accent)',
            border: '1px solid var(--accent)',
            fontWeight: 600,
          }}
        >
          {badge}
        </span>
      )}
    </div>
  )
}
