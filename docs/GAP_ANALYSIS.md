# Agentarium — Gap Analysis & Technical-Debt Review

**Date:** 2026-06-10 · **Scope:** Steps 1–23 (milestones M0–M9). **Method:** manual code
reading of the high-risk paths plus two focused read-only reviews (backend + frontend),
with crash claims confirmed by executing the real `pymunk` / `apply` paths.

Status legend: ✅ **Fixed** in this pass · 🟡 **Deferred** (documented, safe to ship for
MVP) · 🔵 **Product decision** (needs a call before building).

---

## Critical (crash / data-loss / process-kill)

| ID | Area | Issue | Status |
|----|------|-------|--------|
| C1 | engine/builder | **Negative `mass` → C-level `abort()` (SIGABRT)** that kills the whole server process — uncatchable by Python `try/except`. Reachable from `create_body`/`add_ball` args. | ✅ Fixed: builder clamps `mass`/moment to positive minimums; validator rejects `mass < 0.001` at the apply layer. |
| C2 | engine/builder | Zero-mass (or zero-size → zero-moment) dynamic body raises `AssertionError` on `step`, aborting the run. | ✅ Fixed: same mass/dimension clamps; `create_body`/`add_ball` schemas now declare `minimum: 0.001`. |
| C3 | tools/apply | Malformed `position` (wrong length / non-numeric) passed validation → `IndexError`/garbage in the builder. | ✅ Fixed: validator enforces `minItems`/`maxItems` + numeric array items; builder reads positions defensively. |

## High (incorrect behavior / hang / fragility)

| ID | Area | Issue | Status |
|----|------|-------|--------|
| H1 | engine | NaN/inf positions propagate into the trace (invalid JSON, NaN scores). | ✅ Fixed: validator rejects non-finite numbers; builder coerces non-finite positions to 0. |
| H2 | orchestrator | `_emit`/`finally` used unguarded `self._runs[run_id]`; a missing-state path could throw inside the background task and hang subscribers. | ✅ Fixed: both now use `.get()` and no-op when state is gone. |
| H4 | orchestrator | `asyncio.create_task` result discarded → task can be GC'd mid-run (asyncio holds only a weak ref). | ✅ Fixed: the task is retained on `_RunState.task`. |
| H7 | validators | Participant id/name only checked for multi-agent, and the error message indexed by the (possibly blank) id; `mode != "single"` compared enum to a raw string. | ✅ Fixed: validate every participant by list index; compare against `CollaborationMode.single`. |
| H-fe | studio WS | No `ws.onclose` → an abnormal socket drop left the UI stuck on "Building…" forever. | ✅ Fixed: `onclose` leaves the `running` state. |
| H3 | run_service / orchestrator | **Unbounded in-memory growth** — `RUNS`, `SCORES`, `DESIGNS`, `_runs`, and per-run event buffers are never evicted. Fine for short sessions; a long-lived server leaks/OOMs. | ✅ Fixed: `run_service` evicts oldest runs across all three stores together (cap 200); the orchestrator evicts oldest *finished* runs (cap 100), never in-flight ones. |
| H5 | agents/manual | `ManualProvider.complete()` raises `NotImplementedError`; nothing validates against launching a `manual` participant → generic 500-ish run error. | 🔵 Product: manual mode needs a UI-driven design path; until then the validator should reject `manual` with a clear message. |
| H6 | runner (coop) | Cooperative id-namespacing (`{agent}_{id}`) rewrites references to *existing* ids from a prior agent, so genuine cross-agent joints get rejected as "body not present". Works for the mock (no cross-refs) but blocks the feature it enables. | ✅ Fixed: `_remap_ids` namespaces only an agent's *own newly-created* ids (tracked per turn) and leaves cross-agent references to already-live ids intact, so cooperative joints resolve. |

## Medium (edge-case bugs / brittleness)

| ID | Area | Issue | Status |
|----|------|-------|--------|
| M1 | tools/apply | `_validate_args` ignored `minimum`/`maximum`, `minItems`/`maxItems`, array item types, and non-string enums. | ✅ Fixed: all now enforced (feeds C1–C3/H1). |
| M8b | preset_service | One malformed challenge/world YAML 500-ed `/presets`, `/worlds`, **and** `/setup/validate` + `/launch`. Empty file → `**None` TypeError. | ✅ Fixed: per-file try/except (skip+log); `None` coerced to `{}`. |
| M1-fe | studio | Best-attempt ★ used a global index → showed on the wrong agent in competitive mode (per-agent indices overlap). | ✅ Fixed: marker scoped to the winning agent. |
| M6-fe | renderer | Bodies first appearing in a later frame (incremental builds) were never created → silently invisible. | ✅ Fixed: lazy-create on first sighting in `renderFrame`. |
| M7-fe | renderer | `world_static` iterated without a null guard; props with short `position` drew NaN. | ✅ Fixed: `?? []` + length guard. |
| M8-fe | studio | `run_finished.best_trace_run_id` (for one-click winner replay) was never used. | ✅ Fixed: auto-loads the best trace at run end. |
| M4 | runner | `simulation_duration_seconds` (user-set, default 180) is silently hard-capped to 5s. | 🟡 Deferred: named constant + surface the cap (or honor a higher limit). MVP-acceptable. |
| M5 | builder | SlideJoint/Spring use hardcoded geometry; pivot ignores `anchor_b`. | 🟡 Deferred: derive from body distance / use two-anchor pivot. Cosmetic for current designs. |
| M6b | providers | The 3s `/models` probe timeout is reused for `complete()`; real LLM calls will `ReadTimeout` and propagate raw. | 🔵 Product (real-LLM): separate short-probe vs long-generation timeouts; wrap `complete` errors. No effect on mock. |
| M7b | validators | LLM probe sends no auth header and string-concats the URL → false `LLM_OFFLINE` for keyed/trailing-slash endpoints. | 🟡 Deferred: reuse the provider's `test_connection`. Mock/local unaffected. |
| M2/M3 | apply/registry | `add_motor` requires an unused `id`; `add_sensor`/`set_controller`/`set_density`/`set_gravity` are no-ops recorded as `success`; degenerate beam/ramp silently coerced; `add_ramp.angle` never read. | 🟡 Deferred: implement or clearly mark as no-op; drop unused `id`. |
| M2-fe/H1-fe | setup | Selecting a challenge whose required tools aren't all default-enabled (e.g. Sorter needs `add_bin`, off by default) leaves Launch disabled until the user finds+enables them. | 🟡 Deferred: seed `preset.required_tools` into `tools.enabled` on preset select (cross-component; needs care). Default Bridge Builder is launchable today. |

## Low (tech debt / cleanliness)

| ID | Issue | Status |
|----|------|--------|
| L5 | Dead identical `if spec.static … else …` branch in `build_space`. | ✅ Fixed: collapsed. |
| L1 | Many `LaunchConfig` fields are advertised but unenforced: `constraints.max_parts/max_joints/max_motors/energy_budget/material_budget/collision_safety/world_bounds`, `world.seed` (runs aren't actually reproducible), agent `context_window/mutation_strategy/behavior_mode`. | 🟡 Deferred: enforce in apply/engine or mark clearly as forthcoming. |
| L2 | `create_run_from_design` always computes a `"default"` score, then the runner re-scores — every attempt scores twice. | 🟡 Deferred: skip the baseline score on the runner path. |
| L3 | `_design_summary` reports beams/ramps/sensors as 0 though beams/ramps exist as `segment` bodies → UI part breakdown undercounts. | 🟡 Deferred. |
| L4 | `sorting_accuracy` / `city_score` rewards are stability/part-count proxies, not real scoring. | 🟡 Deferred to Step 24 (challenge pack). |
| L6 | WS breaks on `error` before delivering the following `run_finished`. | 🟡 Deferred (minor protocol nit; client now also handles `onclose`). |
| L7 | `_parse_tool_calls` duplicated in `runner.py` and `openai_compatible.py` with slightly different logic. | 🟡 Deferred: consolidate. |
| L-fe | Stubbed UI with live backends: ~~Save Preset~~, ~~Export Design~~, Export Video, Fullscreen; `ReplayTimeline` hardcodes "Attempt 001" + decorative thumbnails; dead demo-fallback effect (no `/studio` route without `:runId`). | 🟡 Partly fixed: **Save Preset** now POSTs to `/setup/save-preset`; **Export Design / View Full Report** wired (Step 25). Export Video, Fullscreen, ReplayTimeline labels still deferred. |

## Test gaps closed

- ✅ `test_engine_robustness.py` — zero/negative-mass and zero-size designs simulate without crashing (finite trace).
- ✅ `test_apply_robustness.py` — negative/zero mass, short/non-numeric position, and out-of-range friction are rejected at the chokepoint and never mutate the design.

## Still-open test gaps (deferred)

- `subscribe()` on a run that errors before `run_finished` (hang regression guard).
- Memory bounding for `RUNS`/`_runs` (once H3 is addressed).
- Cooperative cross-agent joints (once H6 is addressed).
- `manual` provider launch path and `openai_compatible.complete()` timeout handling.

---

## Summary

This pass fixed every **crash and hang risk** found (C1–C3, H1, H2, H4, H7, the stuck-WS
state) plus the confirmed correctness bugs in the renderer and competitive UI, and hardened
the tool-call validator against adversarial agent input. The remaining items are documented
deferrals: in-memory eviction (H3), real-LLM timeouts/auth (M6b/M7b), cooperative
cross-agent joints (H6), unenforced constraint fields (L1), and several UI stubs — none of
which block the MVP demo, and each has a recommended fix above.
