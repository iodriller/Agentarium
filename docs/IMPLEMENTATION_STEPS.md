# Agentarium — Step-by-Step Implementation Guide

**Read this with:** [`COMPREHENSIVE_PLAN.md`](COMPREHENSIVE_PLAN.md) (what we're building and why) and [`AGENTARIUM_PLAN.md`](AGENTARIUM_PLAN.md) (original roadmap, schemas, repo layout).

This is the literal **do step 1, then step 2** build order. Steps are sequential and each ends with an **acceptance check** you can run before moving on. Steps are grouped into stages that map to the milestones (M0–M12) in the comprehensive plan, but the **numbering is continuous** so you can just follow it top to bottom.

> **Rule of thumb:** never start a step until the previous step's acceptance check passes. Commit at the end of every step.

**Legend:** 🟦 backend · 🟪 frontend · 🟩 shared/infra · ✅ acceptance check.

---

## Stage A — Foundations (Milestone M0)

### Step 1 — Initialize the repo tooling 🟩
- Add `pyproject.toml` (backend package `agentarium`, deps: fastapi, uvicorn, pydantic, pymunk, httpx, pyyaml; dev: pytest, ruff). Add `uv.lock` via `uv lock`.
- Add `.gitignore` (Python, Node, `runs/`, `.venv/`, `dist/`).
- Add `Makefile` or task script with `serve`, `test`, `lint`, `fmt`, `web` targets.
- ✅ `uv run python -c "import agentarium"` succeeds; `uv run ruff check .` is clean.

### Step 2 — Stand up the FastAPI app 🟦
- Create `backend/agentarium/app.py` with a FastAPI instance, a `GET /api/health` route returning `{status:"ok"}`, and CORS for the Vite dev origin.
- Create `backend/agentarium/cli.py` exposing `agentarium serve` (runs uvicorn on `127.0.0.1:8765`). Wire the console script in `pyproject.toml`.
- ✅ `uv run agentarium serve` starts; `curl localhost:8765/api/health` returns `{"status":"ok"}`.

### Step 3 — Scaffold the React + Phaser frontend 🟪
- `npm create vite@latest frontend -- --template react-ts`; add Tailwind, a WS/fetch API client, and `phaser`.
- Add routes: `/setup` → `SetupScreen`, `/studio/:runId` → `StudioScreen` (placeholders).
- Apply the design tokens from `COMPREHENSIVE_PLAN.md` §3 as CSS variables / Tailwind theme.
- Have FastAPI serve the built frontend in production; proxy `/api` in dev.
- ✅ Visiting `/setup` shows the top bar + three empty columns; `/studio/test` shows the three-region shell.

### Step 4 — Define the `LaunchConfig` schema (single source of truth) 🟦🟪
- Backend: Pydantic models in `core/schemas/` for `LaunchConfig`, `ScenarioConfig`, `WorldConfig`, `AgentConfig`, `LLMConnection`, `ToolsConfig`, `ConstraintsConfig`, `OutputsConfig` (fields per `COMPREHENSIVE_PLAN.md` §5.1).
- Generate/mirror TypeScript types for the frontend (hand-written or via a schema export).
- Add `POST /api/setup/validate` returning a stub `{state:"READY", missing:[], warnings:[]}`.
- ✅ Posting a sample `LaunchConfig` validates with no 500s; TS types compile.

---

## Stage B — Setup screen becomes real (M1–M3)

### Step 5 — Build the Tool Registry 🟦
- Implement `ToolDefinition` and a registry in `tools/registry.py` populated with the MVP catalog (`COMPREHENSIVE_PLAN.md` §6), each with `category`, `risk`, `enabled_by_default`, `compatible_challenges`, and a JSON-Schema `input_schema`.
- Add `GET /api/tools` returning the catalog grouped by category with counts.
- ✅ `GET /api/tools` lists all categories with correct `enabled_by_default` flags and per-category totals.

### Step 6 — Implement real setup validation 🟦
- Flesh out `POST /api/setup/validate` to produce the launch-state machine from `COMPREHENSIVE_PLAN.md` §2.3: `MISSING_REQUIRED`, `TOOL_CHALLENGE_MISMATCH`, `LLM_OFFLINE`, `CONSTRAINTS_TOO_LOOSE`, `UNSUPPORTED_ENGINE`, `READY`.
- ✅ Removing a required field returns `MISSING_REQUIRED` with the field listed; a complete config returns `READY`.

### Step 7 — Build the Tools, Constraints & Launch column 🟪
- Render `Available Tools` from `/api/tools` as checkbox rows with category counts + Select All/Clear All + the running "X / Y enabled" chip.
- Render the constraints sliders/inputs and the Outputs checkboxes.
- Render the Launch Summary card bound to live config, the status banner from `/validate`, and **Validate / Save Preset / Launch** buttons (Launch disabled unless `READY`).
- ✅ Toggling tools updates the count and re-validates; Launch enables only when the banner is green.

### Step 8 — Scenario, world & preset system 🟦
- Add `ScenarioPreset` and `WorldTemplate` schemas; author preset YAMLs: `bridge_builder`, `crawl_challenge`, `sorter`, `tiny_city_preview` (each declaring objective, reward, world defaults, `required_tools`).
- Add `GET /api/presets`, `GET /api/worlds`, `POST /api/setup/save-preset`, and preset load.
- ✅ `GET /api/presets` returns all four; selecting one server-side yields its world + required-tool defaults.

### Step 9 — Build the Scenario & World column 🟪
- Render the challenge preset dropdown + selectable challenge cards (with tags) and World Settings (template, terrain, engine with PyBullet "Coming Soon" disabled, gravity, map size, active zones, visual style) + collapsible Advanced Settings.
- On challenge select, auto-fill world defaults from `/api/presets`; wire Save/Load Preset.
- ✅ Picking "Bridge Builder" auto-populates Island Cliff + Grassland; a saved custom preset reloads identically.

### Step 10 — Agent & LLM providers 🟦
- Implement the `AgentProvider` interface and `LocalDeploy`, `OpenAICompatible`, and `Mock/Random` providers. Add `GET /api/agents/providers`, `POST /api/agents/test-connection`, `POST /api/agents/test-structured-output`.
- ✅ test-connection returns online for a reachable endpoint and offline otherwise; the Mock provider needs no network.

### Step 11 — Build the Agent & LLM column 🟪
- Render the Single/Multi-Agent toggle, the four collaboration-mode cards, Agent A/B cards (role + behavior mode), the LLM/Model settings (provider, model, context window, temperature slider, max attempts, mutation strategy, memory mode), and the LLM Connection block with a working **Check Connection** button + status pill.
- ✅ Configuring Agent A + B and clicking Check Connection reflects real online/offline state and feeds the validator (`LLM_OFFLINE` when down).

**End of Stage B:** the entire setup screen matches `COMPREHENSIVE_PLAN.md` §2.1, validates correctly, and persists presets — but Launch doesn't run physics yet.

---

## Stage C — Physics & the Studio renderer (M4–M5)

### Step 12 — Engine adapter interface + Pymunk2D 🟦
- Define `engines/base.py` (`EngineAdapter`: build/step/simulate). Implement `pymunk2d/engine.py` + `builder.py` translating `DesignSpec` (bodies, joints, motors, beams, ramps) into a Pymunk space; load `flat_arena` and `island_cliff_small` world templates.
- ✅ A unit test builds a hardcoded design and steps the space N times without error.

### Step 13 — Emit engine-neutral `EpisodeTrace` 🟦
- Implement trace recording (`core/schemas/trace.py` + serializers): per-frame `{t, bodies:{id:{x,y,angle}}, events[]}`, with `world_static[]`, `dt`, `engine`, `camera`. Add `POST /api/runs` (run a hardcoded design) and `GET /api/runs/{id}/trace`.
- ✅ Running a hardcoded bridge/crawler yields a downloadable trace JSON the frontend can fetch.

### Step 14 — Phaser isometric scene 🟪
- Implement `phaser/IsoScene.ts` + `TraceRenderer.ts` consuming **only** `EpisodeTrace`. Project physics `(x,y)` to isometric (`COMPREHENSIVE_PLAN.md` §8), render terrain tiles, static props (trees/water/goal flag/crate), and dynamic bodies tinted by `created_by`.
- Add `CameraControls.ts` (pan/rotate/reset/grid/zoom).
- ✅ Loading the Step 13 trace shows the design moving in an isometric world.

### Step 15 — Studio playback controls 🟪
- Add the center toolbar (Camera, Step counter, Sim Speed slider, Pause, Stop, fullscreen) and the Replay Timeline (attempt selector, filmstrip thumbnails, scrubber, play/speed).
- ✅ Pause/scrub/seek work against a recorded trace; speed changes playback rate.

---

## Stage D — The agent build loop (M6)

### Step 16 — `apply_tool_call` chokepoint 🟦
- Implement the single mutation path: validate args against `input_schema`, enforce the `LaunchConfig` allowlist, mutate `DesignSpec`, and append a `ToolCallRecord` (status success|repaired|rejected) to `toolcalls.jsonl`.
- ✅ A valid call mutates the design and logs `success`; an invalid call is `rejected` and never mutates.

### Step 17 — Single-agent runner 🟦
- Implement `agents/base.py` runner + `prompts.py`: build the prompt from challenge + world summary + enabled tools + memory; parse the model's tool-call list; apply via Step 16; call `run_simulation`; score; persist `design/trace/score/toolcalls`.
- Use the **Mock provider** first so the loop is testable offline.
- ✅ With the Mock agent, `POST /api/runs` produces a completed attempt with a trace, a scorecard, and a tool log.

### Step 18 — Scoring service 🟦
- Implement `scoring_service.py` with named rewards (`distance_plus_stability`, etc.): compute `metrics`, `score_total`, `success`, `failure_events`, and a human `summary` (`COMPREHENSIVE_PLAN.md` §9). Add `GET /api/runs/{id}/score`.
- ✅ A run returns a scorecard whose metrics match the trace (distance, stability, energy, falls).

### Step 19 — Live run streaming 🟦🟪
- Add `WS /ws/runs/{run_id}` emitting frames + tool-call + score events; wire `routes_runs.py` to start a run and the Studio to subscribe.
- ✅ Launching from setup navigates to `/studio/:runId` and the world animates live as the agent builds.

### Step 20 — Wire the Studio rails to live data 🟪
- Bind the left rail (Challenge/Objective/Constraints/Reward, Agent Status cards with energy/parts/score, Score Card table), the right rail (Tool Call Log streaming, Design Summary tabs, Available Tools reference), and the bottom telemetry (Score-over-attempts, Metrics-over-time, Latest Attempt Summary).
- ✅ A single-agent run drives every panel in `COMPREHENSIVE_PLAN.md` §2.2 with live values.

**End of Stage D:** click **Launch Simulation** → watch one agent build, simulate, and score in the isometric studio. This is the first end-to-end demo.

---

## Stage E — Multi-agent & improvement (M7–M9)

### Step 21 — Competitive mode 🟦🟪
- Run two agents on the same challenge with separate `DesignSpec`/tool logs; tint objects + log lines + chart series by agent; compute a winner.
- ✅ Agent A vs Agent B produce separate scored designs; the comparison chart and winner indicator render.

### Step 22 — Cooperative mode 🟦🟪
- Add a shared `DesignSpec` with per-part `created_by`, turn order (A proposes structure → B tunes controller/stability → simulate), simple conflict handling, and a shared score; Design Summary shows ownership.
- ✅ Two agents co-build one bridge/creature; the UI shows who added what.

### Step 23 — Repair & improvement loop 🟦🟪
- Implement `repair_invalid_design`, failure summaries, memory-driven adjustment strategies, attempt lineage, best-design tracking, and an attempt **diff view**.
- ✅ Scores trend upward across attempts; the best attempt is replayable; the diff explains changes.

---

## Stage F — Content, export, polish (M10–M12)

### Step 24 — Complete the challenge pack 🟦🟪
- For Bridge, Crawl, Sorter (+ Tiny City shell): finalize preset, world template, required tools, scoring function, an example design, and the UI card.
- ✅ Every challenge card launches and runs end-to-end.

### Step 25 — Exports & reporting 🟦🟪
- Implement `export_service.py`: design (YAML/JSON), trace (JSONL), scorecard (JSON), Markdown run report, screenshot. Add `/api/exports/*` and the Studio Export buttons (Export Design, Export Video placeholder, View Full Report).
- ✅ "View Full Report" / export produces a self-contained Markdown report + artifacts.

### Step 26 — Tests, CI, and quality gates 🟩
- pytest coverage for schemas, tool validation, engine step, scoring, and the Mock build loop; ruff in CI; a GitHub Actions workflow (lint + test on push/PR). Consider a SessionStart hook so web sessions can run tests/lint (see the `session-start-hook` skill).
- ✅ CI is green on a clean checkout; `uv run pytest` passes.

### Step 27 — Public polish 🟩🟪
- README with screenshots/GIF of both screens, a quickstart, architecture/tool/multi-agent docs, and example reports. Verify the 30-second-fun and 5-minute-comprehension bars from the DoD.
- ✅ A stranger clones, runs `uv run agentarium serve` + the web build, and reaches a live run without help.

---

## Milestone ↔ Step map

| Milestone | Steps |
|---|---|
| M0 Skeleton | 1–4 |
| M1 Tools + validation | 5–7 |
| M2 Presets/worlds | 8–9 |
| M3 Agent/LLM config | 10–11 |
| M4 Pymunk2D + trace | 12–13 |
| M5 Iso renderer | 14–15 |
| M6 Single-agent loop | 16–20 |
| M7 Competitive | 21 |
| M8 Cooperative | 22 |
| M9 Repair/improve | 23 |
| M10 Challenge pack | 24 |
| M11 Exports | 25 |
| M12 Polish | 26–27 |

**MVP ships after Step 25** (with Bridge/Crawl/Sorter from Step 24); Steps 26–27 are the public-launch gate.

---

## Suggested first PR slices

To keep PRs reviewable, ship in this order, one PR each (or a couple of small steps per PR):
1. **PR 1 — Skeleton:** Steps 1–4 (tooling, FastAPI health, Vite shell, `LaunchConfig`).
2. **PR 2 — Setup column 3:** Steps 5–7 (tool registry, validation, tools/constraints/launch UI).
3. **PR 3 — Setup columns 1–2:** Steps 8–11 (presets/worlds, agent/LLM config + UI).
4. **PR 4 — Physics + renderer:** Steps 12–15 (Pymunk2D, trace, Phaser iso scene, playback).
5. **PR 5 — First live run:** Steps 16–20 (tool chokepoint, single-agent loop, scoring, WS, studio rails).
6. **PR 6+ — Multi-agent, improvement, content, exports, polish:** Steps 21–27.

Each PR should land with its acceptance checks passing and tests added.
