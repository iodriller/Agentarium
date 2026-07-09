// Auto-mirrored from backend/agentarium/core/schemas/setup.py — keep in sync.

export type CollaborationMode =
  | 'single'
  | 'competitive'
  | 'cooperative'
  | 'relay'
  | 'sandbox'

export type BehaviorMode =
  | 'engineer'
  | 'mad_scientist'
  | 'evolution'
  | 'minimalist'
  | 'speed_demon'
  | 'builder'
  | 'critic'

export type AgentRole =
  | 'builder'
  | 'crawler'
  | 'structural_engineer'
  | 'controller_designer'
  | 'world_planner'
  | 'critic'
  | 'mutator'

export type MemoryMode = 'none' | 'episodic' | 'best_attempt_summary'

export type MutationStrategy = 'balanced' | 'aggressive' | 'conservative'

export type LLMProvider = 'localdeploy' | 'openai_compatible' | 'mock' | 'manual'

export type PhysicsEngine = 'pymunk2d' | 'pybullet3d'

export type Terrain = 'grassland' | 'desert' | 'factory' | 'city' | 'cave'

export type VisualStyle = 'realistic' | 'playful' | 'blueprint' | 'neon_lab'

export type CollisionSafety = 'strict' | 'relaxed'

export type WorldBounds = 'enforced' | 'soft' | 'disabled'

export type LaunchState =
  | 'READY'
  | 'MISSING_REQUIRED'
  | 'LLM_OFFLINE'
  | 'TOOL_CHALLENGE_MISMATCH'
  | 'CONSTRAINTS_TOO_LOOSE'
  | 'UNSUPPORTED_ENGINE'
  | 'UNSUPPORTED_MODE'

export interface AgentConfig {
  id: string
  name: string
  role?: AgentRole
  behavior_mode?: BehaviorMode
  provider?: LLMProvider
  model?: string
  endpoint_url?: string | null
  api_key?: string | null
  temperature?: number
  max_attempts?: number
  context_window?: string
  memory_mode?: MemoryMode
  mutation_strategy?: MutationStrategy
  system_prompt_override?: string | null
}

export interface LLMConnectionConfig {
  endpoint_url?: string
  api_key?: string | null
}

export interface ProviderMeta {
  id: string
  name: string
  requires_endpoint: boolean
  requires_api_key: boolean
  description: string
  env_api_key_available?: boolean
  env_api_key_preview?: string | null
}

export interface ProviderStatus {
  online: boolean
  detail: string
  models?: string[]
}

export interface ScenarioConfig {
  preset: string
  objective?: string
  reward?: string
}

export interface WorldConfig {
  template: string
  terrain?: Terrain
  engine?: PhysicsEngine
  gravity?: number
  map_size?: number[]
  active_physics_zones?: number
  visual_style?: VisualStyle
  seed?: number | null
}

export interface AgentsConfig {
  mode?: CollaborationMode
  participants?: AgentConfig[]
}

export interface ToolsConfig {
  enabled?: string[]
}

export interface ConstraintsConfig {
  max_parts?: number
  max_joints?: number
  max_motors?: number
  energy_budget?: number
  max_attempts?: number
  simulation_duration_seconds?: number
  material_budget?: number
  collision_safety?: CollisionSafety
  world_bounds?: WorldBounds
  repair_loop_enabled?: boolean
}

export interface OutputsConfig {
  replay_json?: boolean
  scorecard_json?: boolean
  trace_jsonl?: boolean
  markdown_report?: boolean
  screenshot?: boolean
  video_capture?: boolean
}

export interface LaunchConfig {
  version?: number
  project_name?: string
  scenario: ScenarioConfig
  world: WorldConfig
  agents?: AgentsConfig
  llm_connection?: LLMConnectionConfig
  tools?: ToolsConfig
  constraints?: ConstraintsConfig
  outputs?: OutputsConfig
}

export interface ScenarioPreset {
  id: string
  name: string
  tagline: string
  tags: string[]
  objective: string
  reward: string
  default_world: string
  required_tools: string[]
  recommended_tools: string[]
  goal?: Record<string, number | string>
}

export interface WorldTemplate {
  id: string
  name: string
  terrain: Terrain
  map_size: number[]
  gravity: number
  active_physics_zones: number
  description: string
}

export interface ValidationResult {
  state: LaunchState
  missing?: string[]
  warnings?: string[]
  estimated_runtime_min?: [number, number] | null
}

export interface WorkspaceConfigResponse {
  config: LaunchConfig
  path: string
  mtime_ns?: number | null
}

export interface WorkspaceConfigStatus {
  path: string
  exists: boolean
  mtime_ns?: number | null
}

// ─── Episode trace (mirrors backend/agentarium/core/schemas/trace.py) ──────────

export interface StaticProp {
  id: string
  kind: string // "ground" | "goal" | "prop" | body shape
  position: number[]
  size?: number[]
  angle?: number // orientation in radians (sloped ramps/beams)
  color?: string | null
  // Actual geometry (box/circle/segment), independent of `kind` — a
  // beam/ramp/wall is semantically e.g. "beam" but geometrically a segment.
  shape?: string
}

export interface FrameBody {
  x: number
  y: number
  angle: number
}

export interface BodyMeta {
  shape: string // box | circle | segment | polygon
  size?: number[]
  color?: string | null
  kind?: string | null // semantic label (house/tower/tree/road/…)
}

export interface Frame {
  t: number
  bodies: Record<string, FrameBody>
  events?: Record<string, unknown>[]
}

export interface EpisodeTrace {
  version: number
  run_id: string
  attempt_id: string
  engine: string
  camera: string
  terrain?: string
  dt: number
  // World-y below which a body in a ground gap has fallen into the chasm. Null
  // when this world has no gap (ground_spans not set).
  kill_y?: number | null
  world_static: StaticProp[]
  body_meta?: Record<string, BodyMeta>
  frames: Frame[]
}

export interface CreateRunResponse {
  run_id: string
}

export interface LaunchResponse {
  run_id: string
}

export interface RunSummary {
  run_id: string
  created_at?: number | null
  project_name?: string | null
  challenge?: string | null
  mode?: string | null
  reward?: string | null
  score_total?: number | null
  success?: boolean | null
  artifact_dir?: string | null
  config_available?: boolean
}

export interface RunConfigResponse {
  run_id: string
  config: LaunchConfig
  provenance?: Record<string, unknown>
}

export interface RelaunchRunRequest {
  patch?: Record<string, unknown>
}

export interface RelaunchRunResponse {
  run_id: string
  source_run_id: string
  config: LaunchConfig
}

// ─── Score / tool-call (mirrors backend score.py / toolcall.py) ────────────────

export type ToolCallStatus = 'success' | 'repaired' | 'rejected'

export interface ToolCallRecord {
  ts: number
  agent_id: string
  tool: string
  args: Record<string, unknown>
  status: ToolCallStatus
  error?: string | null
  source?: string
  mutated?: boolean
  visual_change?: boolean
  new_body_ids?: string[]
  new_joint_ids?: string[]
}

export interface BuildStepRecord {
  attempt_index: number
  step_index: number
  trace_run_id?: string | null
  agent_id: string
  tool: string
  status: ToolCallStatus
  label: string
  mutated: boolean
  visual_change: boolean
  new_body_ids: string[]
  new_joint_ids: string[]
  error?: string | null
  trace: EpisodeTrace
}

export interface ScoreCard {
  score_total: number
  success: boolean
  metrics: Record<string, number>
  failure_events: Record<string, unknown>[]
  summary: string
  reward: string
  // Short deterministic "why it failed / how to improve" derived from metrics.
  improvement_hint?: string
}

export interface DesignSummary {
  bodies: number
  joints: number
  motors: number
  sensors: number
  beams: number
  ramps: number
  total_parts: number
  // Per-kind breakdown (house/tower/tree/road/…) of what was built.
  by_kind?: Record<string, number>
}

// ─── Live run events (mirrors backend orchestrator event protocol) ─────────────

export interface RunAgentInfo {
  id: string
  name: string
  role: string
}

export interface RunStartedEvent {
  type: 'run_started'
  run_id: string
  project_name: string
  mode: string
  objective: string
  reward?: string
  max_attempts: number
  // Effective MVP caps vs. what the user requested (for the "running 3 of 50" note).
  requested_attempts?: number
  attempts_cap?: number
  requested_duration_s?: number
  simulation_cap_s?: number
  constraints?: Partial<ConstraintsConfig>
  agents?: RunAgentInfo[]
}

export interface RunCaps {
  effectiveAttempts: number
  requestedAttempts?: number
  simCapS?: number
  requestedDurationS?: number
}

export interface AttemptStartedEvent {
  type: 'attempt_started'
  attempt_index: number
  agent_id?: string
  // Cooperative attempts are shared by several agents at once.
  agent_ids?: string[]
  // Lineage: id of the previous attempt this one iterates on (null for first).
  parent_attempt_id?: string | null
}

export interface ToolCallEvent {
  type: 'tool_call'
  attempt_index: number
  agent_id?: string
  record: ToolCallRecord
}

export interface DesignUpdateEvent {
  type: 'design_update'
  attempt_index: number
  // Single/competitive: the owning agent. Cooperative omits it in favour of
  // ``agent_ids`` + ``by_agent``.
  agent_id?: string
  agent_ids?: string[]
  summary: DesignSummary
  // Cooperative ownership breakdown: who built which parts of the shared design.
  by_agent?: Record<string, Partial<DesignSummary>>
}

export interface DesignSnapshotEvent {
  type: 'design_snapshot'
  attempt_index: number
  agent_id?: string
  // Index into the attempt's tool_calls, matching one-to-one with ToolCallEvent.
  step_index: number
  trace_run_id?: string | null
  tool: string
  status: ToolCallStatus
  label: string
  mutated: boolean
  visual_change: boolean
  new_body_ids: string[]
  new_joint_ids: string[]
  error?: string | null
  // Un-simulated, single-frame EpisodeTrace-shaped snapshot of the design as it
  // stood right after this tool call — lets the Studio replay the CONSTRUCTION
  // sequence (Build Timeline) with the same renderer used for physics replay.
  trace: EpisodeTrace
}

export interface TraceReadyEvent {
  type: 'trace_ready'
  attempt_index: number
  agent_id?: string
  agent_ids?: string[]
  trace_run_id: string
}

export interface AttemptDiff {
  prev_attempt_index: number
  parts_delta: number
  joints_delta: number
  added_parts: string[]
  removed_parts: string[]
  moved_parts: string[]
  prev_score: number
  score_delta: number
  failure_events: string[]
}

export interface ScoreEvent {
  type: 'score'
  attempt_index: number
  // Cooperative emits a single shared score with agent_id === "shared".
  agent_id?: string
  scorecard: ScoreCard
  diff?: AttemptDiff | null
}

export interface AttemptFinishedEvent {
  type: 'attempt_finished'
  attempt_index: number
  agent_id?: string
  agent_ids?: string[]
}

export interface WinnerEvent {
  type: 'winner'
  agent_id: string
  score: number
}

export interface RunFinishedEvent {
  type: 'run_finished'
  best_attempt_index: number
  best_score: number
  // trace_run_id of the best attempt, for one-click replay of the winner.
  best_trace_run_id?: string | null
  winner_agent_id?: string | null
}

export interface ErrorEvent {
  type: 'error'
  detail: string
  // Structured failure kind for LLM errors (auth/timeout/server/…).
  kind?: string
}

export type RunEvent =
  | RunStartedEvent
  | AttemptStartedEvent
  | ToolCallEvent
  | DesignSnapshotEvent
  | DesignUpdateEvent
  | TraceReadyEvent
  | ScoreEvent
  | AttemptFinishedEvent
  | WinnerEvent
  | RunFinishedEvent
  | ErrorEvent
