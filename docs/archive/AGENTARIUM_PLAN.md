# Agentarium — Comprehensive Implementation Plan

**Repository:** `iodriller/Agentarium`  
**Status:** Planning / bootstrap  
**Working description:** Agentarium is a visual AI physics sandbox where agents build objects in simulated worlds, run experiments, and improve their designs from replayed results.

---

## 1. Product Vision

Agentarium should feel like a visual AI laboratory, toybox, and arena at the same time.

A user should be able to configure a world, choose one or more agents, select what tools those agents are allowed to use, define constraints, launch a simulation, and watch agents build, fail, score, and improve physical designs.

The core loop is:

```text
Scenario setup
  -> world configuration
  -> agent and LLM configuration
  -> tool permissions
  -> simulation constraints
  -> agent design attempts
  -> physics execution
  -> replay frames
  -> score cards
  -> next attempt
```

The key design principle:

> Agents do not create video frames directly. Agents choose tools and produce structured designs. The backend validates those designs, runs the physics engine, records traces, scores the attempt, and the frontend renders the replay.

That separation keeps the system safe, extensible, and understandable.

---

## 2. What the End Product Should Look Like

Agentarium should have two main surfaces.

### 2.1 Simulation Setup

The setup screen is where the user configures the experiment before it runs.

It should include:

- scenario preset,
- world template,
- physics engine,
- objective,
- scoring mode,
- one or more agents,
- local or online LLM provider,
- model selection,
- available agent tools,
- simulation constraints,
- output options,
- setup validation,
- save/load preset,
- launch simulation.

### 2.2 Simulation Studio

The studio screen is where the user watches and inspects the run.

It should include:

- isometric world view,
- running agents,
- objects created by each agent,
- available tool list,
- tool-call log,
- replay timeline,
- attempt history,
- score card,
- score charts,
- design summary,
- export controls.

---

## 3. Core Product Capabilities

### MVP capabilities

- Setup-first workflow.
- Isometric visual simulation UI.
- Single-agent runs.
- Competitive two-agent runs.
- Basic cooperative two-agent runs.
- Explicit tool registry.
- LocalDeploy / OpenAI-compatible LLM integration.
- Manual builder mode.
- Random baseline agent.
- Pymunk2D physics engine.
- Replayable traces.
- Explainable score cards.
- Exported run reports.
- Scenario presets.
- World templates.
- Save/load setup presets.

### Future capabilities

- PyBullet3D engine adapter.
- City/world-builder mode.
- Godot, Three.js, or Babylon viewer.
- Larger prefab libraries.
- Industrial/mechanical challenge packs.
- Agent tournaments.
- Leaderboards.
- GIF/MP4 export.
- User-authored custom challenge packs.

---

## 4. Software Stack

### 4.1 Recommended MVP stack

```text
Backend:
  Python 3.11+
  FastAPI
  Pydantic v2
  Pymunk
  SQLite
  uv
  pytest
  ruff

Frontend:
  Vite
  TypeScript
  React
  Phaser
  CSS modules or Tailwind
  WebSocket client

Agent/LLM:
  LocalDeploy adapter
  OpenAI-compatible adapter
  Mock/random baseline
  Manual builder

Data:
  YAML/JSON specs
  JSON traces
  JSONL tool-call logs
  SQLite metadata
```

### 4.2 Why this stack

- **Python** is best for simulation logic, agent orchestration, schemas, and backend services.
- **FastAPI** gives a clean typed API, WebSocket support, and simple static UI serving.
- **Pydantic** makes the project schema-first and keeps agent outputs validated.
- **Pymunk** is the best MVP physics engine because it is lightweight and good for fast 2D experiments.
- **React + Phaser** gives a real visual sandbox/game feel instead of a static dashboard.
- **SQLite + JSON traces** keeps runs inspectable, portable, and simple.
- **LocalDeploy/OpenAI-compatible APIs** keep the LLM layer flexible.

### 4.3 Future engine strategy

Agentarium should not be a Pymunk-only project. It should be an engine-agnostic sandbox.

MVP:

```yaml
engine: pymunk2d
```

Future:

```yaml
engine: pybullet3d
```

The frontend should render engine-neutral traces so the physics engine can change later.

---

## 5. Architecture

```text
Browser UI
  React + Phaser
  Setup Screen
  Studio Screen
      |
      | REST / WebSocket
      v
FastAPI Backend
  Setup Service
  Agent Service
  Tool Registry
  Run Service
  Trace Service
  Scoring Service
  Export Service
      |
      v
Core Schemas
  LaunchConfig
  WorldSpec
  DesignSpec
  ToolDefinition
  ToolCallRecord
  EpisodeTrace
  ScoreCard
      |
      v
Engine Adapters
  Pymunk2D first
  PyBullet3D later
      |
      v
Storage
  SQLite metadata
  JSON/YAML specs
  JSON traces
  Markdown reports
```

---

## 6. Repository Structure

Recommended structure:

```text
Agentarium/
  README.md
  LICENSE
  pyproject.toml
  uv.lock
  .gitignore

  backend/
    agentarium/
      app.py
      cli.py

      core/
        schemas/
          setup.py
          world.py
          design.py
          challenge.py
          agent.py
          tool.py
          trace.py
          score.py
          run.py
        validation.py
        ids.py
        errors.py

      setup/
        presets.py
        validators.py
        launch_config.py

      engines/
        base.py
        pymunk2d/
          engine.py
          builder.py
          serializers.py
          collision.py
          iso_projection.py
        pybullet3d/
          README.md

      worlds/
        templates/
          flat_arena.yaml
          island_cliff_small.yaml
          factory_floor.yaml
          tiny_city_preview.yaml
        prefabs/
          roads.yaml
          buildings.yaml
          bridge_parts.yaml
          creature_parts.yaml

      challenges/
        crawl/
        bridge/
        sorter/
        city_preview/

      tools/
        registry.py
        schemas.py
        building.py
        sensors_control.py
        physics_materials.py
        simulation_inspection.py
        evolution.py

      agents/
        base.py
        localdeploy.py
        openai_compatible.py
        random_agent.py
        manual.py
        prompts.py
        modes.py

      services/
        setup_service.py
        run_service.py
        trace_service.py
        scoring_service.py
        export_service.py
        preset_service.py

      storage/
        sqlite.py
        models.py
        repository.py

      api/
        routes_setup.py
        routes_challenges.py
        routes_agents.py
        routes_tools.py
        routes_runs.py
        routes_exports.py

  frontend/
    src/
      screens/
        SetupScreen.tsx
        StudioScreen.tsx
      components/
        setup/
          ScenarioWorldPanel.tsx
          AgentLLMPanel.tsx
          ToolsConstraintsPanel.tsx
          LaunchSummaryPanel.tsx
        studio/
          IsometricWorldView.ts
          ToolPalette.tsx
          ToolCallLog.tsx
          AttemptTimeline.tsx
          ScoreCharts.tsx
          DesignSummary.tsx
          ReplayTimeline.tsx
      phaser/
        IsoScene.ts
        TraceRenderer.ts
        CameraControls.ts
        Effects.ts
      api/
      styles/

  examples/
    presets/
      bridge_builder.yaml
      crawl_challenge.yaml
      sorter.yaml
      tiny_city_preview.yaml

  docs/
    AGENTARIUM_PLAN.md
    ARCHITECTURE.md
    SETUP_SCREEN.md
    TOOL_SYSTEM.md
    MULTI_AGENT.md
    ISOMETRIC_RENDERING.md
    ENGINE_ADAPTERS.md
    ROADMAP.md

  runs/
```

---

## 7. Setup Screen Design

The setup screen must configure everything required to launch a run.

### 7.1 Layout

```text
Simulation Setup

1. Scenario & World
2. Agent & LLM Setup
3. Tools & Constraints
4. Launch Summary
```

### 7.2 Scenario & World panel

Required fields:

| Field | Required | Description |
|---|---:|---|
| Challenge Preset | Yes | Crawl, Bridge Builder, Sorter, Tiny City Preview, Custom |
| World Template | Yes | Terrain/world layout |
| Physics Engine | Yes | Pymunk2D for MVP, PyBullet3D later |
| Scenario Objective | Yes | Human-readable goal |
| Scoring Mode | Yes | How success is measured |

Optional fields:

| Field | Required | Description |
|---|---:|---|
| Terrain Theme | No | Grassland, desert, factory, city, cave |
| Visual Style | No | Realistic, playful, blueprint, neon lab |
| Random Seed | No | Deterministic replay |
| Active Physics Zones | No | Used for larger worlds |
| Environment Effects | No | Future weather/terrain modifiers |

Initial scenario presets:

- Crawl Challenge
- Bridge Builder
- Sorter
- Tiny City Preview
- Custom Scenario

Initial world templates:

- `flat_arena`
- `island_cliff_small`
- `hill_path`
- `gap_crossing`
- `factory_floor`
- `sorting_table`
- `tiny_city_block`

### 7.3 Agent & LLM panel

Required fields:

| Field | Required | Description |
|---|---:|---|
| Agent Count | Yes | Single or multi-agent |
| Collaboration Mode | Yes | Single, competitive, cooperative |
| Provider | Yes | LocalDeploy, OpenAI-compatible, mock/random, manual |
| Model | Yes | Model name/profile |
| Endpoint URL | Required for local/custom | API endpoint |
| Temperature | Yes | Agent creativity |
| Max Attempts | Yes | Run budget |

Optional fields:

| Field | Required | Description |
|---|---:|---|
| API Key | Optional | Required only for online providers |
| System Prompt Override | Optional | Advanced customization |
| Memory Mode | Optional | None, episodic, best-attempt summary |
| Timeout | Optional | Model call timeout |
| Retry Count | Optional | Retry/repair loop |
| Structured Output Mode | Optional | JSON/schema output controls |

Agent modes:

- Engineer
- Mad Scientist
- Evolution
- Minimalist
- Speed Demon
- Builder
- Critic

Agent roles:

- Builder
- Crawler
- Structural Engineer
- Controller Designer
- World Planner
- Critic / Inspector
- Mutator

### 7.4 Tools & Constraints panel

This is one of the most important product surfaces. The agent must not have invisible capabilities. The user should see exactly which tools are enabled.

Tool categories:

- Building
- Sensors & Control
- Physics & Materials
- Simulation & Inspection
- Evolution & Utilities

Each tool should have:

- name,
- description,
- category,
- risk level,
- enabled/disabled state,
- compatible scenarios,
- input schema.

### 7.5 Launch Summary panel

The launch summary should show:

- selected challenge,
- selected world,
- selected engine,
- agents,
- LLM connection status,
- enabled tools,
- constraints,
- output options,
- validation status,
- estimated runtime.

Buttons:

- Validate Setup
- Save Preset
- Launch Simulation

Launch states:

- Ready to Launch
- Missing Required Fields
- LLM Offline
- Tool/Challenge Mismatch
- Constraints Too Loose
- Unsupported Engine

---

## 8. Tool System

Agents use tools to create and modify the world/design. Tool calls should be structured, validated, logged, and replayable.

### 8.1 Tool categories

#### Building tools

| Tool | Description | MVP |
|---|---|---:|
| `create_body` | Create a physical body/part | Yes |
| `add_joint` | Connect two bodies | Yes |
| `add_motor` | Add motor to a joint | Yes |
| `add_beam` | Add structural beam | Yes |
| `add_ramp` | Add ramp shape | Yes |
| `add_ball` | Add ball/object | Yes |
| `add_bin` | Add target bin | Yes |

#### Sensors and control tools

| Tool | Description | MVP |
|---|---|---:|
| `add_sensor` | Add sensor to a design/world | Yes, simple |
| `set_controller` | Set motor control logic | Yes |
| `get_state` | Read current world/design state | Yes |
| `set_goal_marker` | Place target/flag/goal | Yes |

#### Physics and materials tools

| Tool | Description | MVP |
|---|---|---:|
| `set_material` | Set friction/elasticity/density | Yes |
| `set_friction` | Shortcut friction update | Yes |
| `set_density` | Configure density/mass | Later |
| `set_collision_group` | Configure collision rules | Later |
| `set_gravity` | Configure world gravity | Later/advanced |

#### Simulation and inspection tools

| Tool | Description | MVP |
|---|---|---:|
| `run_simulation` | Run physics episode | Yes |
| `inspect_score` | Get score breakdown | Yes |
| `inspect_failure_events` | Get failure events | Yes |
| `inspect_trace_summary` | Get replay summary | Yes |
| `compare_attempts` | Compare two attempts | Later |

#### Evolution and utilities

| Tool | Description | MVP |
|---|---|---:|
| `mutate_design` | Create variant of current design | Yes |
| `save_best_design` | Save current best | Yes |
| `export_design` | Export design YAML/JSON | Yes |
| `repair_invalid_design` | Fix validation errors | Yes |
| `name_design` | Generate fun design name | Yes |

### 8.2 Example tool call

```json
{
  "tool": "create_body",
  "args": {
    "id": "leg_left",
    "shape": "segment",
    "length": 0.8,
    "radius": 0.05,
    "mass": 0.35,
    "position": [-0.4, 0.7],
    "visual": {
      "color": "#66ccff"
    }
  }
}
```

### 8.3 Tool permissions

Tools should have risk levels:

```yaml
tools:
  create_body:
    risk: low
  run_simulation:
    risk: low
  mutate_design:
    risk: low
  set_gravity:
    risk: medium
  custom_code_controller:
    risk: high
    enabled: false
```

MVP should not enable high-risk tools by default.

---

## 9. Multi-Agent Design

### 9.1 Modes

#### Single-agent

One agent designs and improves alone.

#### Competitive

Two agents generate separate designs under the same constraints. Higher score wins.

This should be the first multi-agent mode because it is simple and visually clear.

#### Cooperative

Two agents contribute to one shared design.

Example:

- Agent A builds structure.
- Agent B adjusts controller or improves stability.

#### Relay

Agent A creates the base design. Agent B improves it. Agent C critiques it.

This can become the future “Agentception” mode.

### 9.2 Multi-agent metadata

Every tool call should include agent ID:

```json
{
  "agent_id": "agent_a",
  "tool": "add_joint",
  "args": {
    "id": "hip_left"
  },
  "status": "success"
}
```

Design elements should include creator metadata:

```yaml
parts:
  - id: leg_left
    created_by: agent_a
```

The UI can then color objects by agent.

---

## 10. Isometric Rendering Strategy

The first physics engine can be 2D, while the presentation is isometric.

Physics coordinates:

```text
x, y
```

Isometric screen projection:

```text
screen_x = (x - y) * tile_width / 2
screen_y = (x + y) * tile_height / 2
```

World layers:

- terrain tiles,
- decorations,
- static prefabs,
- active physics zones,
- agent-built objects,
- effects,
- labels,
- UI overlays.

For future larger worlds, most objects should be visual prefabs. Only selected zones should run active physics.

Example:

```yaml
world:
  name: tiny_city
  layers:
    visual_prefabs:
      - roads
      - houses
      - river
      - trees
    active_physics_zones:
      - id: bridge_zone
        bounds: [10, 10, 18, 16]
        engine: pymunk2d
      - id: factory_sorter_zone
        bounds: [20, 8, 28, 16]
        engine: pymunk2d
```

---

## 11. Core Schemas

### 11.1 LaunchConfig

The setup screen should produce one object: `LaunchConfig`.

```yaml
version: 1
project_name: Bridge Builder Lab

scenario:
  preset: bridge_builder
  objective: Move the crate to the goal platform.
  reward: distance_plus_stability

world:
  template: island_cliff_small
  terrain: grassland
  engine: pymunk2d
  camera: isometric
  gravity: -9.81
  map_size: [32, 32]
  active_physics_zones: 3

agents:
  mode: cooperative
  participants:
    - id: agent_a
      name: Agent A
      role: Builder
      behavior_mode: Engineer
      provider: localdeploy
      model: llama-3.1-70b-instruct-q4
      temperature: 0.7
      max_attempts: 50
      memory_mode: episodic

    - id: agent_b
      name: Agent B
      role: Crawler
      behavior_mode: Evolution
      provider: localdeploy
      model: llama-3.1-70b-instruct-q4
      temperature: 0.7
      max_attempts: 50
      memory_mode: episodic

llm_connection:
  endpoint_url: http://localhost:1234/v1
  api_key: null
  status: online_local

tools:
  enabled:
    - create_body
    - add_joint
    - add_motor
    - add_beam
    - add_ramp
    - add_sensor
    - set_controller
    - get_state
    - set_material
    - set_friction
    - run_simulation
    - inspect_score
    - inspect_failure_events
    - mutate_design
    - save_best_design
    - export_design

constraints:
  max_parts: 300
  max_joints: 120
  max_motors: 40
  energy_budget: 1200
  max_attempts: 50
  simulation_duration_seconds: 180
  material_budget: 2000
  collision_safety: strict
  world_bounds: enforced
  repair_loop_enabled: true

outputs:
  replay_json: true
  scorecard_json: true
  trace_jsonl: true
  markdown_report: true
  screenshot: true
  video_capture: false
```

### 11.2 ToolDefinition

```yaml
name: add_joint
category: building
description: Connect two existing bodies with a joint.
risk: low
enabled_by_default: true
compatible_challenges:
  - crawl
  - bridge
  - sorter
input_schema:
  type: object
  required:
    - id
    - body_a
    - body_b
    - type
  properties:
    id:
      type: string
    body_a:
      type: string
    body_b:
      type: string
    type:
      enum: [pivot, pin, slide, spring]
    limits_degrees:
      type: array
      items:
        type: number
```

### 11.3 EpisodeTrace

The frontend should render traces, not physics engine internals.

```json
{
  "version": 1,
  "run_id": "run_001",
  "attempt_id": "attempt_003",
  "engine": "pymunk2d",
  "camera": "isometric",
  "dt": 0.0166667,
  "frames": [
    {
      "t": 0.0,
      "bodies": {
        "body": {"x": 0.0, "y": 1.0, "angle": 0.0}
      },
      "events": []
    }
  ]
}
```

### 11.4 ScoreCard

```json
{
  "score_total": 82.4,
  "success": true,
  "metrics": {
    "distance_m": 5.1,
    "falls": 1,
    "energy": 74.3,
    "broken_joints": 0,
    "stability": 0.78
  },
  "summary": "Reached the target distance with one flip and moderate energy use."
}
```

---

## 12. API Design

### Setup

```text
GET  /api/presets
GET  /api/worlds
GET  /api/tools
POST /api/setup/validate
POST /api/setup/save-preset
POST /api/setup/launch
```

### Agents

```text
GET  /api/agents/providers
POST /api/agents/test-connection
POST /api/agents/test-structured-output
```

### Runs

```text
POST /api/runs
GET  /api/runs/{run_id}
GET  /api/runs/{run_id}/attempts
GET  /api/runs/{run_id}/trace
GET  /api/runs/{run_id}/score
WS   /ws/runs/{run_id}
```

### Exports

```text
POST /api/exports/report
POST /api/exports/replay
POST /api/exports/screenshot
```

---

## 13. Implementation Phases

## Phase 0 — Product Skeleton and Setup-First Architecture

Goal: create the repo and build the skeleton around setup -> launch -> studio.

Tasks:

- Add Python package.
- Add FastAPI app.
- Add React/Vite app.
- Add `/setup` screen.
- Add `/studio/{run_id}` screen.
- Add `LaunchConfig` schema.
- Add placeholder setup validation endpoint.

Acceptance:

```bash
uv run agentarium serve
```

Opens setup screen at:

```text
http://127.0.0.1:8765/setup
```

---

## Phase 1 — Tool Registry and Setup Validation

Goal: make available tools real and visible.

Tasks:

- Implement `ToolDefinition`.
- Create initial tool registry.
- Implement `/api/tools`.
- Implement `/api/setup/validate`.
- Connect tool checkboxes to `LaunchConfig`.
- Add challenge/tool compatibility validation.

Acceptance:

- Setup screen shows tool categories.
- Required tools are marked.
- Disabled or incompatible tools show clear warnings.
- Launch button enables only when setup is valid.

---

## Phase 2 — Scenario, World, and Preset System

Goal: make setup presets real.

Tasks:

- Add `ScenarioPreset`.
- Add `WorldTemplate`.
- Add preset YAMLs:
  - bridge_builder.yaml
  - crawl_challenge.yaml
  - sorter.yaml
  - tiny_city_preview.yaml
- Add `/api/presets`.
- Add `/api/worlds`.
- Add Save Preset.
- Add Load Preset.

Acceptance:

- User selects Bridge Builder.
- World defaults populate automatically.
- User can save a custom preset and reload it.

---

## Phase 3 — Agent and LLM Setup

Goal: make agent/LLM configuration real.

Tasks:

- Add `AgentConfig`.
- Add `LLMProviderConfig`.
- Add LocalDeploy provider.
- Add OpenAI-compatible provider.
- Add mock provider.
- Add `/api/agents/providers`.
- Add `/api/agents/test-connection`.
- Add structured-output test.
- Add multi-agent config support.

Acceptance:

- Setup screen can configure Agent A and Agent B.
- Model connection can be validated.
- UI shows online/offline status.

---

## Phase 4 — Pymunk2D Engine and Isometric Trace

Goal: run the first physics simulation and produce renderer-friendly traces.

Tasks:

- Implement engine adapter interface.
- Implement Pymunk2D engine.
- Implement isometric trace metadata.
- Implement flat/island world template loading.
- Implement bodies, joints, motors, beams, ramps.
- Record trace frames.
- Add `/api/runs/{id}/trace`.

Acceptance:

- A hardcoded bridge or crawler world can run.
- The backend produces a trace that the frontend can load.

---

## Phase 5 — Isometric Studio Renderer

Goal: render the simulation in the Studio screen.

Tasks:

- Implement Phaser isometric scene.
- Render terrain tiles.
- Render bodies.
- Render joints.
- Render agent colors and labels.
- Render goal flag/crate/world props.
- Add camera controls.
- Add replay slider.
- Add pause/stop.

Acceptance:

- Studio screen shows an isometric world.
- Replay data appears visually.
- Agent/tool panels surround the world.

---

## Phase 6 — Single-Agent Build Loop

Goal: let one agent build and simulate.

Tasks:

- Implement agent prompt.
- Include enabled tools in prompt.
- Include challenge/world summary.
- Parse tool-call output.
- Apply tool calls.
- Validate design.
- Run simulation.
- Score attempt.
- Save trace/score/tool log.

Acceptance:

- Click Launch Simulation with one agent.
- A completed attempt appears with tool logs and score.

---

## Phase 7 — Multi-Agent Competitive Mode

Goal: let two agents produce separate designs and compare scores.

Tasks:

- Add per-agent design states.
- Add per-agent tool logs.
- Color objects by agent.
- Run separate attempts under the same challenge.
- Compare scores.
- Add chart with Agent A vs Agent B.
- Add winner indicator.

Acceptance:

- Agent A and Agent B both attempt the same challenge.
- Scores and designs are shown separately.

---

## Phase 8 — Multi-Agent Cooperative Mode

Goal: let two agents contribute to one shared design.

Tasks:

- Add shared design state.
- Add tool ownership metadata.
- Add simple conflict handling.
- Add turn order:
  - Agent A proposes structure.
  - Agent B proposes controller/stability changes.
  - Simulation runs.
- Add shared score.
- Add design summary by ownership.

Acceptance:

- Agents can work together on one bridge/creature.
- UI shows who added what.

---

## Phase 9 — Repair and Improvement Loop

Goal: make agents improve over attempts.

Tasks:

- Add validation error repair.
- Add failure summaries.
- Add design-adjustment strategies.
- Add attempt lineage.
- Add best design tracking.
- Add “why it failed” summaries.
- Add diff view between attempts.

Acceptance:

- Multiple attempts are shown.
- Agent changes are understandable.
- Best attempt is replayable.

---

## Phase 10 — Challenge Pack Completion

Goal: finish the initial challenge pack.

Challenges:

- Bridge Builder
- Crawl Challenge
- Sorter
- Tiny City Preview shell

For each challenge, create:

- preset,
- world template,
- required tools,
- scoring function,
- example design,
- UI card.

Acceptance:

- All challenge cards launch and run.

---

## Phase 11 — Export and Reporting

Goal: make runs shareable.

Tasks:

- Export design JSON/YAML.
- Export trace JSONL.
- Export scorecard JSON.
- Export Markdown report.
- Export screenshot.
- Add future GIF/MP4 placeholder.

Acceptance:

- User can export a report from the Studio.

---

## Phase 12 — Public Polish

Goal: make the repository pinnable.

Tasks:

- README with screenshots/GIF.
- Setup screen screenshot.
- Studio screen screenshot.
- Quickstart.
- Architecture docs.
- Tool system docs.
- Multi-agent docs.
- Example reports.
- CI.
- Tests.
- License.

Acceptance:

- A stranger can clone and run the project.
- They understand what it does in under five minutes.
- The app feels fun within 30 seconds.

---

## 14. Exact Build Order

1. Bootstrap repo and app skeleton.
2. Define `LaunchConfig`.
3. Implement tool registry.
4. Implement preset/world/challenge registry.
5. Build setup UI.
6. Add setup validation.
7. Build Pymunk2D engine.
8. Build trace schema.
9. Build isometric renderer.
10. Implement manual builder.
11. Implement single-agent LLM loop.
12. Implement scoring and reports.
13. Add competitive multi-agent mode.
14. Add cooperative multi-agent mode.
15. Add repair/improvement loop.
16. Add bridge/crawl/sorter challenge pack.
17. Add exports.
18. Polish public launch.

---

## 15. MVP Definition of Done

Agentarium MVP is complete when:

1. Setup screen configures scenario, world, agents, LLMs, tools, constraints, and outputs.
2. Setup validation clearly shows missing required fields and warnings.
3. User can save/load presets.
4. User can launch a run from setup.
5. Studio screen shows an isometric world.
6. Available tools and tool-call logs are visible during the run.
7. One agent can build and simulate a design.
8. Two agents can run in competitive mode.
9. Two agents can run in basic cooperative mode.
10. Physics traces are replayable.
11. Scores are explainable.
12. Agent attempts are saved.
13. Repair/improvement loop works.
14. Crawl, Bridge, and Sorter scenarios work.
15. Reports can be exported.
16. The app feels fun within 30 seconds.

---

## 16. First Public Demo

Recommended demo:

> Two agents compete to build a machine or creature that reaches a goal in a small isometric world.

The demo should show:

- setup screen,
- two agents,
- enabled tools,
- a small world,
- physics replay,
- visible failures,
- score comparison,
- best attempt replay,
- exported report.

This is the clearest public hook.

---

## 17. Future: Agentception Mode

Agentception can be a future advanced mode inside Agentarium.

Concept:

> One agent designs the world, another agent builds in it, and another agent critiques or improves the result.

Possible roles:

- World Agent — creates scenario and environment.
- Builder Agent — creates the design.
- Critic Agent — inspects failures.
- Evolution Agent — proposes next attempt.

This keeps Agentarium as the main product name while preserving the recursive agent idea.

---

## 18. Final Recommendation

Build Agentarium around two strong screens:

1. **Simulation Setup** — configure everything carefully.
2. **Simulation Studio** — watch agents build, fail, compete, cooperate, and improve.

The most important implementation rule:

> Keep the agent, physics engine, trace system, and renderer separate.

That is how the project stays fun now and scalable later.
