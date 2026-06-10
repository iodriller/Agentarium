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

// ─── Episode trace (mirrors backend/agentarium/core/schemas/trace.py) ──────────

export interface StaticProp {
  id: string
  kind: string // "ground" | "goal" | "prop" | body shape
  position: number[]
  size?: number[]
  color?: string | null
}

export interface FrameBody {
  x: number
  y: number
  angle: number
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
  dt: number
  world_static: StaticProp[]
  frames: Frame[]
}

export interface CreateRunResponse {
  run_id: string
}
