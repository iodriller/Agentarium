# Agentarium — Remaining Gaps

Captured after Step 27 (all planned MVP steps complete). Items below are deferred from
the gap analysis or post-MVP backlog. Status legend: 🟢 **Fixed** · 🟡 **Deferred**
· 🔵 **Product decision needed**.

The challenge-quality overhaul (do the four challenges look like and score what they
claim?) is tracked in `docs/CHALLENGE_OVERHAUL_PLAN.md` — read that for the full plan;
this file gets the per-item status rows as pieces land.

---

## High value — shorter effort

| ID | Area | Issue | Status |
|----|------|-------|--------|
| P1 | `run_service` | **SQLite persistence** — runs live only in memory; a server restart loses all history and the export endpoints 404 on every prior run. `ARCHITECTURE.md` names SQLite as the planned store. | 🟢 Fixed: write-through SQLite under `runs/agentarium.db`; DB fallback on `get_*`; startup reloads last 200 runs. |
| P2 | `setup/validators` | **`manual` provider launches with a 500** — `ManualProvider.complete()` raises `NotImplementedError`. Nothing stops a user from configuring `provider: "manual"` and clicking Launch. | 🟢 Fixed: validator rejects `manual` provider with a clear message before the run starts. |
| P3 | `setup/validators` + `openai_compatible` | **Real LLM hardening** — single 3s `_TIMEOUT` covers both the `/models` probe and generation calls (real LLM calls can take 30–120s and will `ReadTimeout`); LLM probe in validators sends no auth header and string-concats the URL (double-slash if trailing slash). | 🟢 Fixed: separate `_PROBE_TIMEOUT = 5s` / `_GENERATION_TIMEOUT = 120s`; probe uses auth headers; URL trailing slash stripped. |
| P4 | Frontend (Setup) | **Auto-seed required tools on preset select** — picking Sorter doesn't enable `add_bin` automatically, so `Launch` stays disabled until the user manually finds and enables it. | 🟢 Fixed: `handleSelectPreset` seeds `tools.enabled` from `preset.required_tools`. |
| P5 | `openai_compatible` | **Model dropdown lists non-chat models** — `test_connection` returned every id from `/v1/models` verbatim, so embeddings/tts/whisper/dall-e/moderation models showed up as pickable agent models alongside real chat models. | 🟢 Fixed: `_is_chat_model` denylist filters known non-chat families before the list reaches the Setup dropdown; unknown ids are kept (never hides a real local/custom chat model). |

---

## Medium effort — significant UX

| ID | Area | Issue | Status |
|----|------|-------|--------|
| U1 | Studio UI | **Screenshot / Export Video** — screenshot captures the live viewport as PNG via Phaser `renderer.snapshot`; replay video export records the Phaser canvas in-browser as WebM via `MediaRecorder`. GIF/MP4 export still deferred because it needs a heavier encoder/transcode path. | 🟢 Partly fixed: PNG screenshot + WebM video live; GIF/MP4 deferred |
| U2 | Studio UI | **ReplayTimeline** — hardcoded "Attempt 001" + decorative thumbnails. | 🟢 Fixed: shows the real attempt number, real elapsed/total seconds from the trace, and clickable time ticks that seek the replay. |
| U3 | `agents` | **Real-LLM end-to-end test** — all current tests use the `mock` provider; no integration test for `openai_compatible` against a live endpoint. | 🟡 Deferred (needs API key or local server in CI) |
| U4 | Studio playback | **Pause/Stop appeared broken during live runs** — every `trace_ready`/`run_finished` called `loadTrace` which force-set `playing=true` + `frameIndex=0`, so a manual pause was instantly overridden and the viewport yanked to the newest attempt. | 🟢 Fixed: a `followLive` ref (default on) is turned off by any manual playback action (pause/stop/seek/keyboard/pick-attempt); live auto-follow no longer overrides the user. |
| U5 | Studio + `run_service` | **Could not browse/replay individual attempts of a finished run** — Attempt History was populated only from live WS events, so a run reopened from History showed "No attempts yet". | 🟢 Fixed: new `GET /runs/{id}/attempts` groups attempts via `run_configs` provenance (`parent_run_id`); Studio's historical path populates the Attempt History list so every attempt is replayable. |
| U6 | Frontend (Setup) | **Quick Start card removed** — per product direction the Setup screen now shows only the full (formerly "Advanced") three-column config, always expanded and prepopulated from defaults/workspace. | 🟢 Done |
| U7 | `run_service` + History | **Run History listed every attempt as its own row** — each attempt writes a `run_meta` row, so one 50-attempt launch flooded History with 50 rows. | 🟢 Fixed: `run_meta.parent_run_id` links attempts to their launch; `list_runs`/`leaderboard` collapse a launch to one representative row (best attempt) with an `attempt_count`. History/leaderboard rows link to the best attempt's trace, which loads its siblings on open. Standalone/demo runs (no parent) are unchanged (one row each). |
| U8 | Studio (multi-agent) | Reopening a historical run keyed the summary score under `agent_a` regardless of which agent produced it. | 🟢 Fixed: `loadHistorical` keys the opened attempt's score under its real `agent_id` from the attempts list. |
| U9 | Frontend (Setup) | The Seed field gave no hint that it only affects LLM sampling (physics is deterministic — see E2). | 🟢 Fixed: inline note under the Seed input. |

---

## Engine / infrastructure

| ID | Area | Issue | Status |
|----|------|-------|--------|
| E1 | Engines | **PyBullet3D adapter** — `EngineAdapter` base is designed for it; Pymunk2D is the only live implementation. Big physics upgrade. | 🟡 Deferred (separate epic) |
| E2 | `LaunchConfig` constraints | `max_parts` / `max_joints` enforced at the apply chokepoint (over-budget body/joint calls rejected). `energy_budget` (post-sim metric) and `world.seed` (no stochastic element yet — pymunk is already deterministic) still advisory. | 🟢 Partly fixed: parts/joints enforced; energy_budget + seed remain advisory |
| E3 | `runner` | `simulation_duration_seconds` (user-set, default 180) was silently hard-capped to 5s. | 🟢 Fixed: named `_MAX_SIM_DURATION_SECONDS = 60`; durations honored up to the cap |
| E4 | `runner` | `_parse_tool_calls` was duplicated in `runner.py` and `openai_compatible.py` with slightly different logic. | 🟢 Fixed: consolidated into `agents/parsing.py::parse_tool_calls`, used by both |
| E5 | `tools/apply` | A body spawned deeply embedded in the ground (e.g. `create_body` with the schema-default `position: [0, 0]` on a 1×1 box, which engulfs the paper-thin `radius=0.1` ground segment) could tunnel through it forever instead of resting on top — observed `y -> -4412` by t=30s. Found via `mock_provider`'s own placeholder body (`IMPROVEMENTS.md` §8), and any agent (real LLM included) placing a body at/below ground level hit the same tunneling, silently scoring 0 with no error. | 🟢 Fixed (`IMPROVEMENTS.md` §9): `apply.py::_clamp_to_ground` clamps a new DYNAMIC body's spawn y to rest at/above the surface (`create_body`, `add_ball`); static bodies are untouched (terrain is allowed to be embedded on purpose) |
| E6 | `engines/pymunk2d`, `worlds` | **Every world had one continuous, invisible floor spanning the whole map** — `build_space` always added a single full-width static ground segment, so no challenge could ever have a real gap/pit. Bridge Builder's "gap" was empty air over a solid floor: a crate rolling off the slope just landed on the hidden floor and got stuck against the goal cliff's wall, never needing (or able to use) a bridge. | 🟢 Fixed: `WorldTemplate.ground_spans`/`kill_y` (optional, default = one full-width span, fully backward compatible) let a world carve a real gap; `builder.build_space` emits one ground segment per span; `EpisodeTrace.kill_y` carries it to the renderer, which draws a water/hazard band in the gap instead of continuous ground. `scoring_service.compute_metrics` uses `kill_y` (falling back to the old generic threshold when unset) both to count falls and to stop crediting position once a body is in an unbounded free-fall — see CHALLENGE_OVERHAUL_PLAN.md Phase 1. |
| E7 | `core/schemas/design`, `engines/pymunk2d/builder` | **A solid "goal" marker physically blocks whatever is meant to reach it** — Bridge Builder's goal marker was a normal collidable static box; the crate got stuck against its face and could never register `reached_goal`, no matter how good the bridge was. | 🟢 Fixed: `BodySpec.sensor` (default `False`) — a sensor shape detects overlap without blocking movement; the pymunk shape's `.sensor` flag is set from it. Bridge's and Crawl's `goal_marker` scaffolds are now `sensor: true`. |
| E8 | `core/schemas/trace`, `phaser/TraceRenderer` | **Static "beam"/"ramp"/"wall" props rendered as fat squares, not thin planks** — `StaticProp` never carried the body's real shape, only its semantic `kind` (e.g. "beam"); the renderer's semantic-prop path hardcoded `shape: 'box'`, so a segment's `size=[length]` got read as both width AND height, squaring it. This is a big reason a hand-built bridge deck looked like a boulder instead of a plank. | 🟢 Fixed: `StaticProp.shape` (mirrors `BodyMeta.shape`) carries the real geometry; the renderer's semantic-prop path uses it instead of a hardcoded box, so segment-shaped props size as a thin plank via the existing `sizePx` segment branch. |
| E9 | `tools/apply` (`add_bin`) | **A bin was one solid box, not a container** — a ball rolling toward it hit its outer face/top and rested outside, so `bins_in_target`/`bins_correct` were reachable only by scripting a ball's position directly inside the box, never by real physics. Every Sorter attempt was effectively unwinnable. | 🟢 Fixed: `add_bin` now builds a floor + two side walls (real, non-sensor colliders) that catch the ball, plus a full-size `sensor: true` prop (see E7) purely for the recognizable open-top visual. Verified end-to-end: the mock's chute+bin layout now scores 100% (`test_sorter_with_real_physics_balls_land_in_matching_bins`). |
| E10 | `engines/pymunk2d/builder` (`_add_joint`) | **A pivot joint silently ignored `anchor_b`** — it used pymunk's single-world-point `PivotJoint(a, b, pivot_point)` form (computed from `anchor_a` only), so unless `body_b` already happened to sit exactly at that point, pymunk had to snap it there on the very first step. A hinged creature (Crawl's legs, anchored at realistic non-center points) exploded: the mock's own crawler ended up thousands of metres away and thousands of metres underground purely from this joint "pop," regardless of the motor. This was a known gap (see former L4 below). | 🟢 Fixed: switched to pymunk's two-anchor form `PivotJoint(a, b, anchor_a, anchor_b)` (matching how `PinJoint`/`SlideJoint` already worked in the same function) — pins anchor_a (local to a) to anchor_b (local to b) properly. Also exposed `anchor_a`/`anchor_b` in the `add_joint` tool schema (the mutation path already read them; nothing told an agent — real or mock — that they existed). Verified: `test_engine.py::test_pivot_joint_honors_both_anchors`, `test_runner.py::test_crawl_with_real_physics_crosses_threshold`. |
| E11 | `phaser/TraceRenderer`, `worlds` | **A world's default (no `ground_spans`) floor is `map_size[0]` wide *on each side*, not `map_size[0]` total** — `hill_path`'s declared `map_size: [40, 20]` produces an 80m-wide ground prop, which dominates `worldBounds` and zooms the camera out a lot, shrinking a creature that only travels ~30m into a barely-visible speck. Noticed self-evaluating the Crawl golden screenshot. | 🟡 Deferred — cosmetic, not a correctness bug; either halve the default span, or have `worldBounds` cap ground's contribution, or state the "half-width" convention explicitly in `WorldTemplate.map_size`'s docstring. |

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
| L1 | `scoring_service` | `sorting_accuracy` / `city_score` rewards are rough proxies; real scoring would use actual physics outcomes. | 🟡 Deferred — `sorting_accuracy` is now backed by real containment physics (E9), not just a proxy. `city_score` gained an infra-variety bonus (road/park/tree counts, height variety, §8), an overlapping-footprint penalty now scoped to BUILDING-vs-BUILDING only (a road/park/tree running under a building's frontage is normal and no longer wrongly penalized), a cap on the raw part-count term (a pile of boxes can't out-score a real mix), and a success bar that requires the actual objective (6+ buildings, a road, a park, 2+ trees) instead of "4+ things, spaced out" — still a metrics proxy overall, not a visual-correctness check. |
| L6 | Studio UI | `IsometricWorldView` component name + `PlaybackToolbar`'s "CAMERA: Isometric" label both claim isometric, but `TraceRenderer` is a straight side view (x-right, y-up). Noticed while visually verifying the 2026-07-05 city renderer pass. | 🟢 Fixed: component renamed to `WorldView`, label now "Side View", dead `phaser/iso.ts` (never imported) deleted |
| L2 | `run_service` | `create_run_from_design` always scores with `"default"` baseline; the runner re-scores with the named reward. Every attempt scores twice. | 🟡 Deferred: skip baseline score on the runner path |
| L3 | `orchestrator` | `_design_summary` reports beams/ramps/sensors as 0 even though beams/ramps exist as `segment` bodies → UI part breakdown undercounts. | 🟢 Fixed: beams/ramps derive from `by_kind`; sensors remain 0 because sensors are not implemented |
| L4 | `builder` | `SlideJoint`/`Spring` use hardcoded geometry (`min=0.0, max=2.0` / `rest_length=1.0`, not derived from the bodies' actual distance). | 🟡 Deferred: derive from body distance. (Pivot's `anchor_b` half of this row is 🟢 fixed — see E10.) |
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
