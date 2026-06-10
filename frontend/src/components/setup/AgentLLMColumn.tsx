import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import type {
  AgentConfig,
  AgentRole,
  AgentsConfig,
  BehaviorMode,
  CollaborationMode,
  LaunchConfig,
  LLMProvider,
  MemoryMode,
  MutationStrategy,
  ProviderMeta,
  ProviderStatus,
} from '../../api/types'

// ─── Props ────────────────────────────────────────────────────────────────────

interface AgentLLMColumnProps {
  config: Partial<LaunchConfig>
  onConfigChange: (patch: Partial<LaunchConfig>) => void
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_AGENT_A: AgentConfig = {
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
}

const DEFAULT_AGENT_B: AgentConfig = {
  ...DEFAULT_AGENT_A,
  id: 'agent_b',
  name: 'Agent B',
}

const ROLE_OPTIONS: { value: AgentRole; label: string }[] = [
  { value: 'builder', label: 'Builder' },
  { value: 'crawler', label: 'Crawler' },
  { value: 'structural_engineer', label: 'Structural Engineer' },
  { value: 'controller_designer', label: 'Controller Designer' },
  { value: 'world_planner', label: 'World Planner' },
  { value: 'critic', label: 'Critic' },
  { value: 'mutator', label: 'Mutator' },
]

const BEHAVIOR_OPTIONS: { value: BehaviorMode; label: string }[] = [
  { value: 'engineer', label: 'Engineer' },
  { value: 'mad_scientist', label: 'Mad Scientist' },
  { value: 'evolution', label: 'Evolution' },
  { value: 'minimalist', label: 'Minimalist' },
  { value: 'speed_demon', label: 'Speed Demon' },
  { value: 'builder', label: 'Builder' },
  { value: 'critic', label: 'Critic' },
]

const CONTEXT_OPTIONS: { value: string; label: string }[] = [
  { value: '4k', label: '4k' },
  { value: '8k', label: '8k' },
  { value: '16k', label: '16k' },
  { value: '32k', label: '32k' },
]

const MUTATION_OPTIONS: { value: MutationStrategy; label: string }[] = [
  { value: 'balanced', label: 'Balanced' },
  { value: 'aggressive', label: 'Aggressive' },
  { value: 'conservative', label: 'Conservative' },
]

const MEMORY_OPTIONS: { value: MemoryMode; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'episodic', label: 'Episodic' },
  { value: 'best_attempt_summary', label: 'Best Attempt Summary' },
]

const MULTI_MODES: { value: CollaborationMode; title: string; subtitle: string }[] = [
  { value: 'cooperative', title: 'Cooperative', subtitle: 'Work together' },
  { value: 'competitive', title: 'Competitive', subtitle: 'Optimize individually' },
  { value: 'relay', title: 'Relay', subtitle: 'Handoff & continue' },
  { value: 'sandbox', title: 'Sandbox', subtitle: 'No objectives' },
]

// ─── Shared styles ────────────────────────────────────────────────────────────

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

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
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
      {children}
    </div>
  )
}

function Divider() {
  return <div style={{ borderTop: '1px solid var(--border)', margin: '12px 0' }} />
}

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

function NoOpLink({ children }: { children: React.ReactNode }) {
  return (
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
      {children}
    </a>
  )
}

function ModeCard({
  title,
  subtitle,
  selected,
  onSelect,
}: {
  title: string
  subtitle: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      style={{
        textAlign: 'left',
        padding: 10,
        borderRadius: 8,
        border: selected ? '1px solid var(--accent)' : '1px solid var(--border)',
        background: selected ? 'var(--accent-soft)' : 'var(--surface-1)',
        boxShadow: selected ? '0 0 0 1px var(--accent)' : 'none',
        cursor: 'pointer',
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{title}</div>
      <div style={{ fontSize: 10, color: 'var(--text-2)', marginTop: 2 }}>{subtitle}</div>
    </button>
  )
}

// ─── Agent card ───────────────────────────────────────────────────────────────

function AgentCard({
  agent,
  accentVar,
  onChange,
}: {
  agent: AgentConfig
  accentVar: string
  onChange: (patch: Partial<AgentConfig>) => void
}) {
  return (
    <div
      style={{
        borderRadius: 8,
        border: '1px solid var(--border)',
        background: 'var(--surface-1)',
        marginBottom: 8,
        overflow: 'hidden',
      }}
    >
      {/* Colored header */}
      <div
        style={{
          padding: '6px 10px',
          background: `color-mix(in srgb, ${accentVar} 20%, transparent)`,
          borderBottom: `1px solid ${accentVar}`,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: accentVar,
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{agent.name}</span>
      </div>

      {/* Body */}
      <div style={{ padding: 10 }}>
        <FieldRow label="Role">
          <select
            value={agent.role ?? 'builder'}
            onChange={(e) => onChange({ role: e.target.value as AgentRole })}
            style={selectStyle()}
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </FieldRow>

        <FieldRow label="Behavior Mode">
          <select
            value={agent.behavior_mode ?? 'engineer'}
            onChange={(e) => onChange({ behavior_mode: e.target.value as BehaviorMode })}
            style={selectStyle()}
          >
            {BEHAVIOR_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </FieldRow>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AgentLLMColumn({ config, onConfigChange }: AgentLLMColumnProps) {
  const [providers, setProviders] = useState<ProviderMeta[]>([])
  const [status, setStatus] = useState<ProviderStatus | null>(null)
  const [checking, setChecking] = useState(false)
  const [llmSectionOpen, setLlmSectionOpen] = useState(true)
  const [connSectionOpen, setConnSectionOpen] = useState(true)

  // ── Fetch providers on mount ──
  useEffect(() => {
    api
      .get<ProviderMeta[]>('/agents/providers')
      .then(setProviders)
      .catch(() => {
        /* backend may be down in tests */
      })
  }, [])

  // ── Normalize agents state ──
  const agents: AgentsConfig = config.agents ?? { mode: 'single', participants: [] }
  const mode: CollaborationMode = agents.mode ?? 'single'
  const isMulti = mode !== 'single'

  // Ensure at least Agent A exists for display
  const participants: AgentConfig[] =
    agents.participants && agents.participants.length > 0
      ? agents.participants
      : [DEFAULT_AGENT_A]

  const agentA = participants[0] ?? DEFAULT_AGENT_A
  const agentB = participants[1] ?? DEFAULT_AGENT_B

  const llmConnection = config.llm_connection ?? {}
  const selectedProvider: LLMProvider = (agentA.provider ?? 'mock') as LLMProvider
  const providerMeta = providers.find((p) => p.id === selectedProvider)
  const requiresApiKey = providerMeta?.requires_api_key ?? false

  // ── Emit a new agents config ──
  function emitAgents(nextMode: CollaborationMode, nextParticipants: AgentConfig[]) {
    onConfigChange({
      agents: { mode: nextMode, participants: nextParticipants },
    } as Partial<LaunchConfig>)
  }

  // ── Collaboration mode handling ──
  function handleSetSingle() {
    // Keep only the first participant
    emitAgents('single', [participants[0] ?? DEFAULT_AGENT_A])
  }

  function handleSetMulti() {
    // Default multi mode is cooperative; ensure a 2nd participant exists
    const next = [...participants]
    if (next.length < 2) next.push(DEFAULT_AGENT_B)
    emitAgents(mode === 'single' ? 'cooperative' : mode, next.slice(0, 2))
  }

  function handleSelectMultiMode(m: CollaborationMode) {
    const next = [...participants]
    if (next.length < 2) next.push(DEFAULT_AGENT_B)
    emitAgents(m, next.slice(0, 2))
  }

  // ── Edit a single participant immutably ──
  function handleAgentChange(index: number, patch: Partial<AgentConfig>) {
    const next = participants.map((p, i) => (i === index ? { ...p, ...patch } : p))
    emitAgents(mode, next)
  }

  // ── Apply a shared LLM field onto every participant ──
  function handleSharedLLMChange(patch: Partial<AgentConfig>) {
    const next = participants.map((p) => ({ ...p, ...patch }))
    emitAgents(mode, next)
  }

  function handleConnectionChange(patch: Partial<LaunchConfig['llm_connection']>) {
    onConfigChange({
      llm_connection: { ...llmConnection, ...patch },
    } as Partial<LaunchConfig>)
  }

  // ── Check connection ──
  async function handleCheckConnection() {
    setChecking(true)
    setStatus(null)
    try {
      const result = await api.post<ProviderStatus>('/agents/test-connection', {
        provider: selectedProvider,
        endpoint_url: llmConnection.endpoint_url,
        api_key: llmConnection.api_key,
      })
      setStatus(result)
    } catch (e) {
      setStatus({
        online: false,
        detail: e instanceof Error ? e.message : 'Connection failed',
      })
    } finally {
      setChecking(false)
    }
  }

  // Shared LLM values read from Agent A (the primary)
  const sharedTemperature = agentA.temperature ?? 0.7
  const sharedMaxAttempts = agentA.max_attempts ?? 50
  const sharedContext = agentA.context_window ?? '8k'
  const sharedMutation = agentA.mutation_strategy ?? 'balanced'
  const sharedMemory = agentA.memory_mode ?? 'none'
  const sharedModel = agentA.model ?? ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* ── Section 1: Collaboration Mode ── */}
      <SectionLabel>Collaboration Mode</SectionLabel>

      {/* Segmented toggle */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 0,
          border: '1px solid var(--border)',
          borderRadius: 6,
          overflow: 'hidden',
          marginBottom: 10,
        }}
      >
        <button
          onClick={handleSetSingle}
          style={{
            padding: '7px 10px',
            border: 'none',
            background: !isMulti ? 'var(--accent)' : 'var(--surface-2)',
            color: !isMulti ? '#fff' : 'var(--text-2)',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Single-Agent
        </button>
        <button
          onClick={handleSetMulti}
          style={{
            padding: '7px 10px',
            border: 'none',
            borderLeft: '1px solid var(--border)',
            background: isMulti ? 'var(--accent)' : 'var(--surface-2)',
            color: isMulti ? '#fff' : 'var(--text-2)',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Multi-Agent
        </button>
      </div>

      {/* Mode cards (multi only) */}
      {isMulti && (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
              marginBottom: 8,
            }}
          >
            {MULTI_MODES.map((m) => (
              <ModeCard
                key={m.value}
                title={m.title}
                subtitle={m.subtitle}
                selected={mode === m.value}
                onSelect={() => handleSelectMultiMode(m.value)}
              />
            ))}
          </div>
          <div style={{ marginBottom: 10 }}>
            <NoOpLink>How it works</NoOpLink>
          </div>
        </>
      )}

      <Divider />

      {/* ── Section 2: Agent cards ── */}
      <SectionLabel>Agents</SectionLabel>

      <AgentCard
        agent={agentA}
        accentVar="var(--agent-a)"
        onChange={(patch) => handleAgentChange(0, patch)}
      />

      {isMulti && (
        <AgentCard
          agent={agentB}
          accentVar="var(--agent-b)"
          onChange={(patch) => handleAgentChange(1, patch)}
        />
      )}

      <Divider />

      {/* ── Section 3: LLM / Model Settings ── */}
      <SectionHeader
        title="LLM / Model Settings"
        open={llmSectionOpen}
        onToggle={() => setLlmSectionOpen((o) => !o)}
      />

      {llmSectionOpen && (
        <div style={{ marginTop: 6 }}>
          <FieldRow label="Provider">
            <select
              value={selectedProvider}
              onChange={(e) =>
                handleSharedLLMChange({ provider: e.target.value as LLMProvider })
              }
              style={selectStyle()}
            >
              {providers.length === 0 && (
                <option value={selectedProvider}>{selectedProvider}</option>
              )}
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </FieldRow>

          <FieldRow label="Model">
            <input
              type="text"
              value={sharedModel}
              onChange={(e) => handleSharedLLMChange({ model: e.target.value })}
              style={inputStyle()}
            />
          </FieldRow>

          <FieldRow label="Context Window">
            <select
              value={sharedContext}
              onChange={(e) => handleSharedLLMChange({ context_window: e.target.value })}
              style={selectStyle()}
            >
              {CONTEXT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </FieldRow>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '120px 1fr 48px',
              alignItems: 'center',
              gap: 8,
              marginBottom: 8,
            }}
          >
            <span style={{ fontSize: 11, color: 'var(--text-2)' }}>Temperature</span>
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={sharedTemperature}
              onChange={(e) => handleSharedLLMChange({ temperature: Number(e.target.value) })}
              style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
            />
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--text-1)',
                textAlign: 'right',
              }}
            >
              {sharedTemperature.toFixed(2)}
            </span>
          </div>

          <FieldRow label="Max Attempts">
            <input
              type="number"
              min={1}
              value={sharedMaxAttempts}
              onChange={(e) => handleSharedLLMChange({ max_attempts: Number(e.target.value) })}
              style={inputStyle()}
            />
          </FieldRow>

          <FieldRow label="Mutation Strategy">
            <select
              value={sharedMutation}
              onChange={(e) =>
                handleSharedLLMChange({ mutation_strategy: e.target.value as MutationStrategy })
              }
              style={selectStyle()}
            >
              {MUTATION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </FieldRow>

          <FieldRow label="Memory Mode">
            <select
              value={sharedMemory}
              onChange={(e) =>
                handleSharedLLMChange({ memory_mode: e.target.value as MemoryMode })
              }
              style={selectStyle()}
            >
              {MEMORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </FieldRow>
        </div>
      )}

      <Divider />

      {/* ── Section 4: LLM Connection ── */}
      <SectionHeader
        title="LLM Connection"
        open={connSectionOpen}
        onToggle={() => setConnSectionOpen((o) => !o)}
      />

      {connSectionOpen && (
        <div style={{ marginTop: 6 }}>
          <FieldRow label="Endpoint URL">
            <input
              type="text"
              value={llmConnection.endpoint_url ?? ''}
              onChange={(e) => handleConnectionChange({ endpoint_url: e.target.value })}
              placeholder="http://localhost:1234/v1"
              style={inputStyle()}
            />
          </FieldRow>

          <FieldRow label="API Key">
            <input
              type="password"
              value={llmConnection.api_key ?? ''}
              onChange={(e) => handleConnectionChange({ api_key: e.target.value })}
              placeholder="optional"
              style={inputStyle()}
            />
          </FieldRow>

          {!requiresApiKey && (
            <div style={{ fontSize: 10, color: 'var(--text-2)', marginBottom: 8 }}>
              API key not required for this provider.
            </div>
          )}

          {/* Check connection button */}
          <button
            onClick={handleCheckConnection}
            disabled={checking}
            style={{
              width: '100%',
              padding: '7px 12px',
              borderRadius: 5,
              border: '1px solid var(--border)',
              background: 'var(--surface-2)',
              color: 'var(--text-1)',
              fontSize: 11,
              fontWeight: 600,
              cursor: checking ? 'wait' : 'pointer',
              opacity: checking ? 0.7 : 1,
              marginBottom: 8,
            }}
          >
            {checking ? 'Checking…' : 'Check Connection'}
          </button>

          {/* Status pill */}
          {status && (
            <StatusPill status={status} />
          )}

          {/* Models list */}
          {status?.online && status.models && status.models.length > 0 && (
            <div style={{ fontSize: 10, color: 'var(--ok)', marginTop: 6 }}>
              ✓ {status.models.length} models available
              <span style={{ color: 'var(--text-2)', marginLeft: 4 }}>
                ({status.models.slice(0, 2).join(', ')}
                {status.models.length > 2 ? ', …' : ''})
              </span>
            </div>
          )}

          <div style={{ marginTop: 8 }}>
            <NoOpLink>About connections</NoOpLink>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Status pill ──────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: ProviderStatus }) {
  const online = status.online
  const color = online ? 'var(--ok)' : 'var(--danger)'
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px',
        borderRadius: 6,
        background: online
          ? 'color-mix(in srgb, var(--ok) 15%, transparent)'
          : 'color-mix(in srgb, var(--danger) 15%, transparent)',
        border: `1px solid ${color}`,
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 700, color }}>
        {online ? '● Online (Local)' : '● Offline'}
      </span>
      {status.detail && (
        <span style={{ fontSize: 10, color: 'var(--text-2)' }}>{status.detail}</span>
      )}
    </div>
  )
}

export type { AgentLLMColumnProps }
