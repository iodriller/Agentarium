# Agentarium — Remaining Gaps

Captured after Step 27 (all planned MVP steps complete). Items below are deferred from
the gap analysis or post-MVP backlog. Status legend: 🟢 **Fixed** · 🟡 **Deferred**
· 🔵 **Product decision needed**.

---

## High value — shorter effort

| ID | Area | Issue | Status |
|----|------|-------|--------|
| P1 | `run_service` | **SQLite persistence** — runs live only in memory; a server restart loses all history and the export endpoints 404 on every prior run. `ARCHITECTURE.md` names SQLite as the planned store. | 🟢 Fixed: write-through SQLite under `runs/agentarium.db`; DB fallback on `get_*`; startup reloads last 200 runs. |
| P2 | `setup/validators` | **`manual` provider launches with a 500** — `ManualProvider.complete()` raises `NotImplementedError`. Nothing stops a user from configuring `provider: "manual"` and clicking Launch. | 🟢 Fixed: validator rejects `manual` provider with a clear message before the run starts. |
| P3 | `setup/validators` + `openai_compatible` | **Real LLM hardening** — single 3s `_TIMEOUT` covers both the `/models` probe and generation calls (real LLM calls can take 30–120s and will `ReadTimeout`); LLM probe in validators sends no auth header and string-concats the URL (double-slash if trailing slash). | 🟢 Fixed: separate `_PROBE_TIMEOUT = 5s` / `_GENERATION_TIMEOUT = 120s`; probe uses auth headers; URL trailing slash stripped. |
| P4 | Frontend (Setup) | **Auto-seed required tools on preset select** — picking Sorter doesn't enable `add_bin` automatically, so `Launch` stays disabled until the user manually finds and enables it. | 🟢 Fixed: `handleSelectPreset` seeds `tools.enabled` from `preset.required_tools`. |

---

## Medium effort — significant UX

| ID | Area | Issue | Status |
|----|------|-------|--------|
| U1 | Studio UI | **Screenshot / Export Video** — screenshot captures the live viewport as PNG via Phaser `renderer.snapshot`; replay video export records the Phaser canvas in-browser as WebM via `MediaRecorder`. GIF/MP4 export still deferred because it needs a heavier encoder/transcode path. | 🟢 Partly fixed: PNG screenshot + WebM video live; GIF/MP4 deferred |
| U2 | Studio UI | **ReplayTimeline** — hardcoded "Attempt 001" + decorative thumbnails. | 🟢 Fixed: shows the real attempt number, real elapsed/total seconds from the trace, and clickable time ticks that seek the replay. |
| U3 | `agents` | **Real-LLM end-to-end test** — all current tests use the `mock` provider; no integration test for `openai_compatible` against a live endpoint. | 🟡 Deferred (needs API key or local server in CI) |

---

## Engine / infrastructure

| ID | Area | Issue | Status |
|----|------|-------|--------|
| E1 | Engines | **PyBullet3D adapter** — `EngineAdapter` base is designed for it; Pymunk2D is the only live implementation. Big physics upgrade. | 🟡 Deferred (separate epic) |
| E2 | `LaunchConfig` constraints | `max_parts` / `max_joints` enforced at the apply chokepoint (over-budget body/joint calls rejected). `energy_budget` (post-sim metric) and `world.seed` (no stochastic element yet — pymunk is already deterministic) still advisory. | 🟢 Partly fixed: parts/joints enforced; energy_budget + seed remain advisory |
| E3 | `runner` | `simulation_duration_seconds` (user-set, default 180) was silently hard-capped to 5s. | 🟢 Fixed: named `_MAX_SIM_DURATION_SECONDS = 60`; durations honored up to the cap |
| E4 | `runner` | `_parse_tool_calls` was duplicated in `runner.py` and `openai_compatible.py` with slightly different logic. | 🟢 Fixed: consolidated into `agents/parsing.py::parse_tool_calls`, used by both |
| E5 | `tools/apply` | A body spawned deeply embedded in the ground (e.g. `create_body` with the schema-default `position: [0, 0]` on a 1×1 box, which engulfs the paper-thin `radius=0.1` ground segment) could tunnel through it forever instead of resting on top — observed `y -> -4412` by t=30s. Found via `mock_provider`'s own placeholder body (`IMPROVEMENTS.md` §8), and any agent (real LLM included) placing a body at/below ground level hit the same tunneling, silently scoring 0 with no error. | 🟢 Fixed (`IMPROVEMENTS.md` §9): `apply.py::_clamp_to_ground` clamps a new DYNAMIC body's spawn y to rest at/above the surface (`create_body`, `add_ball`); static bodies are untouched (terrain is allowed to be embedded on purpose) |

---

## Multi-agent / modes

| ID | Area | Issue | Status |
|----|------|-------|--------|
| MA1 | Orchestrator / Setup | `relay` and `sandbox` modes should not pretend to be live. | 🟢 Fixed for honesty: hidden in Setup and rejected by validation with `UNSUPPORTED_MODE`; implementation remains future work |
| MA2 | Studio UI | Competitive mode "winner" star uses a global attempt index → wrong agent highlighted when per-agent indices diverge past attempt 1. | 🟢 Already fixed in Steps 21-25 |

---

## Code cleanliness / low priority

| ID | Area | Issue | Status |
|----|------|-------|--------|
| L1 | `scoring_service` | `sorting_accuracy` / `city_score` rewards are rough proxies; real scoring would use actual physics outcomes. | 🟡 Deferred — `city_score` gained an infra-variety bonus (road/park/tree counts, height variety, §8) and an overlapping-footprint penalty (§9), still a metrics proxy, not a visual-correctness check |
| L6 | Studio UI | `IsometricWorldView` component name + `PlaybackToolbar`'s "CAMERA: Isometric" label both claim isometric, but `TraceRenderer` is a straight side view (x-right, y-up). Noticed while visually verifying the 2026-07-05 city renderer pass. | 🟢 Fixed: component renamed to `WorldView`, label now "Side View", dead `phaser/iso.ts` (never imported) deleted |
| L2 | `run_service` | `create_run_from_design` always scores with `"default"` baseline; the runner re-scores with the named reward. Every attempt scores twice. | 🟡 Deferred: skip baseline score on the runner path |
| L3 | `orchestrator` | `_design_summary` reports beams/ramps/sensors as 0 even though beams/ramps exist as `segment` bodies → UI part breakdown undercounts. | 🟢 Fixed: beams/ramps derive from `by_kind`; sensors remain 0 because sensors are not implemented |
| L4 | `builder` | `SlideJoint`/`Spring` use hardcoded geometry; pivot ignores `anchor_b`. | 🟡 Deferred: derive from body distance / two-anchor pivot |
| L5 | `validators` | LLM_OFFLINE probe in `validators.py` is a separate, simpler reimplementation of `OpenAICompatibleProvider.test_connection()`; should delegate to the provider. | 🟡 Deferred: consolidate after provider registry is accessible from validators |

---

## Open test gaps

| Gap | Notes |
|-----|-------|
| `subscribe()` on a run that errors before `run_finished` — hang regression guard | Medium |
| `manual` provider launch path (now validated away; test the rejection) | Small (added with P2 fix) |
| `openai_compatible.complete()` timeout handling with real timeout | Needs mock HTTP server |
| `relay`/`sandbox` mode routing | Covered by MA1 honesty guard; implement later when behavior differs |
| SQLite DB fallback for evicted runs | Added with P1 fix |
