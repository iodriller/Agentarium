# Agentarium — Comprehensive Product & Engineering Plan

**Repository:** `iodriller/Agentarium`
**Status:** Planning / bootstrap
**Companion docs:** [`AGENTARIUM_PLAN.md`](AGENTARIUM_PLAN.md) (original roadmap) · [`IMPLEMENTATION_STEPS.md`](IMPLEMENTATION_STEPS.md) (step-by-step build guide)

> **One-liner:** Agentarium is a visual AI physics sandbox where LLM agents pick explicit tools to build creatures, bridges, and machines in an isometric world, run physics experiments, get scored on explainable metrics, and improve across attempts.

This document is the **master plan**. It supersedes nothing in `AGENTARIUM_PLAN.md`; it deepens it with (1) a pixel-accurate UI specification derived from the product mockups, (2) concrete data models, (3) a design system, and (4) a milestone map. For the literal "do step 1, then step 2" build order, read [`IMPLEMENTATION_STEPS.md`](IMPLEMENTATION_STEPS.md).

---

## 1. Product Pillars

1. **Setup-first.** Nothing runs until the user has configured a valid experiment. The setup screen is a first-class product surface, not a modal.
2. **Agents choose tools, not pixels.** Agents emit structured, validated tool calls. The backend simulates; the frontend replays. This separation is the load-bearing architectural rule.
3. **Everything is explainable.** Every attempt yields a scorecard, a tool-call log, a replayable trace, and a "why it failed" summary.
4. **Watchable.** The studio must be fun within 30 seconds — an isometric diorama with visible agents, motion, failures, and score deltas.
5. **Engine-agnostic.** Pymunk2D first; the trace format and renderer must not assume the engine. PyBullet3D is a later adapter, not a rewrite.

---

## 2. The Two Screens (UI Specification)

The mockups define a polished dark UI with a violet accent. Both screens share a top bar and a three-region layout. Treat the breakdowns below as the component contract.

### 2.0 Shared shell

**Top bar (both screens):**
- Left: Agentarium wordmark + logo glyph.
- Center-left: `Project` label with a project dropdown (e.g. "Bridge Builder Lab"), and a **Save Preset** action.
- Right cluster: `● System Online` status pill, **Docs**, **Help**, a notifications bell, and a circular account avatar.

**Design tokens** (see §3 for the full system): near-black canvas, slightly lighter panel surfaces, violet primary (`--accent`), green for "online/ready", amber for "beta/coming soon", red for "stop".

### 2.1 Simulation Setup

Title block: **"Simulation Setup"** with subtitle "Configure your world, agents, tools, and constraints before launch." Below it, three numbered columns.

#### Column ① — Scenario & World Setup *(badge: Required)*

- **Challenge Preset** dropdown (default "Bridge Builder") with a **View Details** link.
- **Challenge cards** (selectable list, one highlighted):
  | Card | Tagline | Tags |
  |---|---|---|
  | Bridge Builder | "Transport the crate to the goal." | Construction, Transport |
  | Crawl Challenge | "Navigate tight spaces to reach goal." | Mobility |
  | Sorter | "Sort objects into correct bins." | Logic, Organization |
  | Tiny City Preview | "Grow a tiny city within constraints." | Economy, Planning |
  | Custom Scenario | "Start from scratch." | Custom |
- **World Settings:**
  - World Template (e.g. "Island Cliff (Small)")
  - Terrain (e.g. "Grassland") with a tiny terrain swatch
  - Physics Engine: **Pymunk 2D (Stable)** selected; **PyBullet 3D (Beta)** shown disabled with a "Coming Soon" amber chip
  - Gravity (m/s²): `-9.81`
  - Map Size: `32 x 32 tiles`
  - Active Physics Zones: numeric (`3`) with an **Edit** affordance
  - Visual Style: "Realistic"
- **Advanced Settings** *(collapsible, Optional)*: Seed, Randomization, Debug, and more.

#### Column ② — Agent & LLM Setup *(badge: Required)*

- **Collaboration Mode:** a `Single-Agent | Multi-Agent` segmented toggle, then mode cards with a **"How it works"** link:
  | Mode | Subtitle |
  |---|---|
  | Cooperative | "Work together" |
  | Competitive | "Optimize individually" |
  | Relay | "Handoff & continue" |
  | Sandbox | "No objectives" |
- **Agent A** and **Agent B** cards (B appears only in Multi-Agent), each with:
  - Role (e.g. Builder, Crawler) with icon
  - Behavior Mode (e.g. Engineer, Evolution) with icon
  - A delete/remove control
- **LLM / Model Settings** (per agent or shared):
  - Provider (e.g. **LocalDeploy**, with a `Local` chip)
  - Model (e.g. `Llama-3.1-70B-Instruct-Q4_K_M`)
  - Context Window (e.g. `8k`)
  - Temperature slider (e.g. `0.70`)
  - Max Attempts (e.g. `50`)
  - Mutation Strategy (e.g. `Balanced`)
  - Memory Mode (e.g. `Episodic`)
- **LLM Connection:**
  - Endpoint URL (e.g. `http://localhost:1234/v1`)
  - Status: `● Online (Local)`
  - Model Availability: `✓ All models available` (refreshable)
  - API Key (Optional, masked) — note "LocalDeploy API key not required"
  - **Check Connection** button + "About connections" link

#### Column ③ — Tools, Constraints & Launch

- **Available Tools** with a **Select All** / **Clear All** toggle and a per-category enabled count. Each tool is a checkbox row with name + one-line description. Categories and the MVP catalog (see §6):
  - **Building** (e.g. 6/7): `create_body`, `add_joint`, `add_motor`, `add_beam`, `add_ramp`, `add_ball`, `add_bin` *(disabled by default)*
  - **Sensors & Control** (3/3): `add_sensor`, `set_controller`, `get_state`
  - **Physics & Materials**: `set_material`, `set_friction`, `set_density` *(disabled)*
  - **Simulation & Inspection**: `run_simulation`, `inspect_score`, `inspect_failure_events`
  - **Evolution & Utilities**: `mutate_design`, `save_best_design`, `export_design` *(disabled)*
  - Running total chip: e.g. **"16 / 20 tools enabled"**
- **Simulation Constraints** (sliders + numeric):
  - Max Parts `300`, Max Joints `120`, Energy Budget `1200`, Max Attempts `50`, Simulation Duration (s) `180`, Material Budget `2000`
  - Collision Safety: `Strict`
  - World Bounds: `Enforced`
  - Agent Repair Loop: `● Enabled`
- **Launch Summary** card:
  - Isometric world thumbnail (mini preview of the selected world with agent labels)
  - Key/value rows: Challenge, World, Agents (e.g. "2 (Cooperative)"), Models, Engine, Tools Enabled (`16 / 20`), Constraints (`Strict · 50 attempts · 180s`), Est. Run Cost / Time (`~2–4 min`, `Low`)
  - **Outputs** checkboxes: Replay (MP4), Scorecard (JSON), Trace (JSONL), Video Capture *(optional)*
  - **Status banner:** green `✓ Ready to Launch — Your setup is valid. All required fields are configured.` (see launch-state machine §2.3)
  - Buttons: **Validate Setup**, **Save Preset**, and the primary **▶ Launch Simulation** (full-width violet). Caption: "This will start a simulation run with the current configuration."

### 2.2 Simulation Studio

Header shows the project name (e.g. "Creature Builder Lab") and a `Simulation World ● Running` indicator. Three regions:

#### Left rail — Briefing & status

- **Challenge:** name + one-line description.
- **Objective:** e.g. "Move the crate to the goal platform."
- **Constraints:** Max Parts `80`, Energy Budget `1200`, Time Limit `90s`.
- **Reward:** e.g. "Score = Distance + Stability Bonus" + **View Details**.
- **Agent Status** cards (one per agent), each with a live wireframe thumbnail of the current design:
  - Name + role chip + `● Running`
  - Energy % bar, Parts `27 / 80`, live Score `54.2`
- **Score Card** table: Agent | Score | Best Score (e.g. Agent A `54.2 / 61.3`, Agent B `47.8 / 55.9`).

#### Center — Isometric world + telemetry

- **Toolbar:** Camera (`Isometric` dropdown), `Step 2,431`, `Sim Speed 1.0x` slider, **Pause**, **Stop** (red), fullscreen.
- **Isometric viewport:** the diorama — chunky grassland terrain block with dirt paths, trees, a water pond, an arched **bridge** over a gap, a red **goal flag** on a platform, a **crate**, and the agents' built structures labeled **Agent A** / **Agent B**.
- **View controls:** pan, rotate, reset-camera, grid toggle; zoom; **View Options** menu.
- **Bottom telemetry strip** (three cards):
  1. **Score over attempts** — line chart, Agent A vs Agent B, "Last 50 Attempts" selector.
  2. **Metrics over time (latest attempt)** — Distance / Stability / Energy series vs time (s).
  3. **Latest Attempt Summary** — Attempt `29`, Status `Running`, Time Elapsed `38.6s`, Distance `12.7m`, Stability `61%`, Energy Used `480 / 1200`, Failures `0`, **View Full Report**.

#### Right rail — Tools, log, design, replay

- **Available Tools** (searchable, same categories as setup) — read-only reference of what agents may call.
- **Tool Call Log:** timestamped stream, color-coded by agent, e.g. `14:32:11 Agent A → create_body(leg_3)`, `Agent B → add_beam(span_1)`, … with a **Clear** action.
- **Design Summary** (tabs: Agent A | Agent B): Bodies `27`, Joints `26`, Motors `8`, Sensors `4`, Beams `2`, Ramps `1`, Total Parts `68 / 80`, Material `Metal / Rubber / Wood`, **Export Design**.
- **Replay Timeline:** Attempt `29` (`29 / 50`), a filmstrip of thumbnails at `t = 0s / 15s / 30s / 45s / 60s`, a scrubber, ◀ play ▶, speed `1.0x`, **Export Video**, screenshot.

### 2.3 Launch-state machine (setup → studio)

The setup summary banner reflects exactly one state; **Launch** is enabled only in `READY`:

| State | Banner | Launch |
|---|---|---|
| `READY` | "Ready to Launch" (green) | enabled |
| `MISSING_REQUIRED` | lists missing required fields | disabled |
| `LLM_OFFLINE` | "LLM offline — check connection" | disabled |
| `TOOL_CHALLENGE_MISMATCH` | "Selected challenge needs tool X" | disabled |
| `CONSTRAINTS_TOO_LOOSE` | warning (e.g. budgets allow trivial wins) | enabled w/ warning |
| `UNSUPPORTED_ENGINE` | "Engine not available yet" | disabled |

---

## 3. Design System

A small token set keeps both screens consistent and themeable.

```text
Color
  --bg            #0b0d12   (app canvas)
  --surface-1     #12151c   (panels)
  --surface-2     #1a1f29   (cards / inputs)
  --border        #232a36
  --text-1        #e7ebf3   (primary)
  --text-2        #9aa4b2   (secondary)
  --accent        #7c5cff   (violet primary / Launch)
  --accent-soft   #2a2350   (selected row background)
  --ok            #34d399   (online / ready)
  --warn          #f59e0b   (beta / coming soon)
  --danger        #ef4444   (stop)
  --agent-a       #a78bfa   (violet)
  --agent-b       #38bdf8   (sky blue)

Type    Inter / system-ui; 12–14px body, 11px labels (uppercase, tracked), 20px titles
Radius  8px inputs, 12px cards, 14px primary button
Shadow  soft, low-opacity; selected cards get a 1px --accent ring + glow
Layout  3-column setup; 3-region studio; 12px gutters; left/right rails ~320px
```

Agent identity colors (`--agent-a`, `--agent-b`) are reused everywhere: design wireframes, world object tint, log lines, and chart series. This is the cheapest way to make multi-agent runs legible.

---

## 4. System Architecture

```text
┌──────────────────────────── Browser (React + Phaser) ────────────────────────────┐
│  SetupScreen            StudioScreen                                              │
│   3 config columns       isometric viewport + rails + telemetry                  │
│        │  REST (config, presets, runs)      │  WebSocket (live frames/events)     │
└────────┼──────────────────────────────────┼──────────────────────────────────────┘
         ▼                                  ▼
┌──────────────────────────── FastAPI backend ─────────────────────────────────────┐
│  api/        routes_setup · routes_runs · routes_tools · routes_presets · ws      │
│  services/   setup · run · trace · scoring · export · preset                      │
│  agents/     base · localdeploy · openai_compatible · random · manual             │
│  tools/      registry + validated handlers (the ONLY way to mutate a design)      │
│  engines/    base.EngineAdapter → pymunk2d (MVP) → pybullet3d (later)             │
│  core/       pydantic schemas · validation · ids · errors                         │
│  storage/    sqlite metadata + json/yaml/jsonl artifacts on disk                  │
└───────────────────────────────────────────────────────────────────────────────────┘
```

**The build loop (one attempt):**

```text
LaunchConfig ─▶ AgentRunner builds prompt (challenge + world + enabled tools + memory)
            ─▶ LLM emits tool calls ─▶ ToolRegistry validates & applies to DesignSpec
            ─▶ EngineAdapter.simulate(DesignSpec, WorldSpec) ─▶ EpisodeTrace
            ─▶ Scorer(EpisodeTrace, reward) ─▶ ScoreCard (+ failure events)
            ─▶ persist (trace.json, score.json, toolcalls.jsonl) ─▶ stream to Studio
            ─▶ memory/repair feeds the next attempt
```

The agent **never** touches the engine, the renderer, or files directly — only the tool registry, and only with validated arguments.

---

## 5. Core Data Models

Schema-first (Pydantic v2 on the backend, mirrored TS types on the frontend). Five contracts matter.

### 5.1 `LaunchConfig` — the single output of the setup screen
Carries `scenario`, `world` (template, terrain, engine, gravity, map_size, active_physics_zones, visual_style, seed), `agents` (mode + participants with provider/model/temperature/max_attempts/role/behavior_mode/memory_mode/mutation_strategy), `llm_connection`, `tools.enabled[]`, `constraints` (max_parts/joints/motors, energy_budget, material_budget, simulation_duration_seconds, collision_safety, world_bounds, repair_loop_enabled), and `outputs`. Full YAML example in `AGENTARIUM_PLAN.md` §11.1.

### 5.2 `DesignSpec` — what an agent builds
`parts[]` (bodies with shape/size/mass/position/material/visual/`created_by`), `joints[]` (type pivot|pin|slide|spring, body_a, body_b, motor?, limits), `sensors[]`, `controllers[]`, `materials`, plus `metadata` (name, attempt lineage, owner). Must round-trip to YAML/JSON for export.

### 5.3 `ToolCallRecord` — one logged action
`{ ts, agent_id, tool, args, status: success|repaired|rejected, error? }`. Appended to `toolcalls.jsonl`; powers the Tool Call Log.

### 5.4 `EpisodeTrace` — engine-neutral replay
`{ version, run_id, attempt_id, engine, camera, dt, world_static[], frames[] }` where each frame is `{ t, bodies:{id:{x,y,angle}}, events[] }`. The renderer consumes only this — never engine internals. Keeps Pymunk2D and PyBullet3D interchangeable.

### 5.5 `ScoreCard` — explainable result
`{ score_total, success, metrics:{distance_m, stability, energy, falls, broken_joints, parts_used, …}, failure_events[], summary }`. `metrics` + `summary` drive the Latest Attempt Summary and the "why it failed" text.

---

## 6. Tool System

The tool registry is the agent's entire action space and is rendered verbatim in both screens. Each `ToolDefinition` has `name, category, description, risk (low|medium|high), enabled_by_default, compatible_challenges[], input_schema (JSON Schema)`.

MVP catalog (matches the mockup category counts):

| Category | Tools (MVP) | Default off |
|---|---|---|
| Building | create_body, add_joint, add_motor, add_beam, add_ramp, add_ball | add_bin (challenge-gated) |
| Sensors & Control | add_sensor, set_controller, get_state | — |
| Physics & Materials | set_material, set_friction | set_density, set_collision_group, set_gravity |
| Simulation & Inspection | run_simulation, inspect_score, inspect_failure_events | compare_attempts |
| Evolution & Utilities | mutate_design, save_best_design, repair_invalid_design, name_design | export_design |

**Rules:** every call is validated against `input_schema` before mutating the design; failures route to `repair_invalid_design` when the repair loop is on, else are logged as `rejected`. `risk: high` tools (e.g. arbitrary code controllers) are never enabled by default and require explicit opt-in. Challenge presets declare `required_tools`; the setup validator blocks launch on `TOOL_CHALLENGE_MISMATCH`.

---

## 7. Agents & LLM Layer

- **Providers** behind one `AgentProvider` interface: `LocalDeploy` (OpenAI-compatible local endpoint), `OpenAICompatible` (hosted), `Mock/Random` (deterministic baseline, no network — used for tests and demos), `Manual` (the human builds via the same tool calls).
- **Structured output:** prompts request a JSON list of tool calls; responses are parsed and schema-validated. A `test-structured-output` probe verifies a model can comply before launch.
- **Behavior modes** (Engineer, Mad Scientist, Evolution, Minimalist, Speed Demon, Builder, Critic) are prompt presets that bias strategy. **Roles** (Builder, Crawler, Structural Engineer, Controller Designer, World Planner, Critic, Mutator) scope what an agent focuses on in multi-agent runs.
- **Memory modes:** None, Episodic (recent attempts + outcomes), Best-attempt summary. Feeds the repair/improvement loop.

---

## 8. Physics & Isometric Rendering

- **Engine adapter** interface: `build(DesignSpec, WorldSpec) → world handle`, `step(dt) → frame`, `simulate(...) → EpisodeTrace`. Pymunk2D is the MVP implementation; PyBullet3D later implements the same interface.
- **2D physics, isometric presentation.** Physics runs in `(x, y)`; the renderer projects:
  `screen_x = (x − y) · tile_w/2`, `screen_y = (x + y) · tile_h/2`.
- **Render layers:** terrain tiles → decorations → static prefabs → active physics zones → agent-built objects (tinted by `created_by`) → effects → labels → UI overlays.
- **Scalability:** large worlds are mostly visual prefabs; only declared `active_physics_zones` run the engine. This is how "Tiny City" stays cheap while a bridge zone is fully simulated.

---

## 9. Scoring

Reward functions are named and pluggable (e.g. `distance_plus_stability`, `sorting_accuracy`, `crossing_time`). A scorer reads the `EpisodeTrace`, computes `metrics`, applies the reward to produce `score_total`, derives `success`, collects `failure_events` (falls, broken joints, out-of-bounds, timeouts), and writes a one-line human `summary`. The same `metrics` power the live "Metrics over time" chart by emitting partial values per streamed frame.

---

## 10. Persistence & Exports

- **SQLite** for run/attempt metadata, presets, and indexes.
- **Filesystem** under `runs/{run_id}/{attempt_id}/`: `design.yaml`, `trace.json`, `toolcalls.jsonl`, `score.json`, optional `screenshot.png` / `replay.mp4`.
- **Exports:** design (YAML/JSON), trace (JSONL), scorecard (JSON), Markdown run report, screenshot; GIF/MP4 capture is a fast-follow.

---

## 11. Tech Stack & Repository Layout

Stack (unchanged from `AGENTARIUM_PLAN.md` §4, restated): **Backend** Python 3.11+, FastAPI, Pydantic v2, Pymunk, SQLite, `uv`, pytest, ruff. **Frontend** Vite + TypeScript + React + Phaser + Tailwind + WS client. **Agents** LocalDeploy / OpenAI-compatible / Mock / Manual. Repo structure is specified in `AGENTARIUM_PLAN.md` §6 and realized incrementally by `IMPLEMENTATION_STEPS.md`.

---

## 12. Milestone Map

Each milestone is a demoable slice. (The fine-grained, numbered tasks live in `IMPLEMENTATION_STEPS.md`; the mapping is shown there.)

| # | Milestone | Demoable outcome |
|---|---|---|
| M0 | Skeleton | `uv run agentarium serve` opens an empty Setup screen and a Studio route. |
| M1 | Tool registry + validation | Setup shows real tool categories with counts; Launch gates on validity. |
| M2 | Presets, worlds, save/load | Picking Bridge Builder auto-fills world defaults; custom presets persist. |
| M3 | Agent/LLM config | Agent A/B configurable; Check Connection shows online/offline. |
| M4 | Pymunk2D + trace | A hardcoded design simulates and emits an `EpisodeTrace`. |
| M5 | Isometric Studio renderer | The trace plays back as an isometric diorama with replay controls. |
| M6 | Single-agent build loop | Launch → one agent builds, simulates, and scores an attempt live. |
| M7 | Competitive mode | Agent A vs Agent B, color-coded, with a score comparison chart + winner. |
| M8 | Cooperative mode | Two agents co-edit one design; UI shows who built what. |
| M9 | Repair/improvement loop | Attempts improve over time; best attempt is replayable; diff view. |
| M10 | Challenge pack | Bridge, Crawl, Sorter, Tiny City shell all launch and run. |
| M11 | Exports & reporting | One-click Markdown report + artifacts from the Studio. |
| M12 | Public polish | A stranger clones, runs, and "gets it" in <5 min; fun in 30s. |

MVP = **M0–M9 + Bridge/Crawl/Sorter from M10 + M11**. M12 is the launch gate.

---

## 13. Key Decisions & Risks

- **Engine-neutral trace is non-negotiable.** If the renderer ever reads Pymunk objects directly, the 3D path dies. Mitigation: the renderer's only input type is `EpisodeTrace`; enforce with a type boundary + test.
- **Tool registry is the security boundary.** No design mutation outside validated tools; high-risk tools default off. Mitigation: a single `apply_tool_call` chokepoint with schema validation and an allowlist from `LaunchConfig`.
- **LLM unreliability.** Models emit malformed tool calls. Mitigation: strict parse → `repair_invalid_design` → bounded retries → `rejected` log; the Mock provider keeps the whole pipeline testable with zero network.
- **Scope creep toward 3D / city-builder.** Mitigation: those are explicit post-MVP adapters; the milestone map ends MVP at M11.
- **Determinism for replay.** Seeded worlds + fixed `dt`; record everything needed to replay from the trace alone.

---

## 14. Definition of Done (MVP)

Restated from `AGENTARIUM_PLAN.md` §15 and bound to this UI spec: setup configures and validates everything in §2.1; save/load presets works; launch transitions to a live Studio matching §2.2; one agent builds+simulates+scores; competitive and basic cooperative modes work; traces replay; scores are explainable with a failure summary; Bridge/Crawl/Sorter run end-to-end; reports export; and the studio is fun within 30 seconds.
