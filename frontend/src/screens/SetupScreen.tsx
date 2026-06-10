import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import type { LaunchConfig, ValidationResult } from '../api/types'
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

export function SetupScreen() {
  const [config, setConfig] = useState<Partial<LaunchConfig>>(DEFAULT_CONFIG)
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null)
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
    } catch {
      // Validation endpoint may not be reachable in dev; ignore
    }
  }

  function handleValidateNow() {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    runValidation(config)
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <TopBar projectName="Bridge Builder Lab" />

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
