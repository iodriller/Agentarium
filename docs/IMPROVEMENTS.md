# Agentarium — Improvements & Forward Roadmap

Living document for larger improvements and the findings of the post-MVP repo
review. Day-to-day deferred items live in [`remaining_gaps.md`](remaining_gaps.md);
this file is for the bigger bets (3D engine) and a record of the review pass.

Status legend: 🟢 **Done** · 🟡 **Planned** · 🔵 **Needs a product call**.

---

## 1. PyBullet 3D engine (the big one)

**Goal:** add a second physics engine behind the existing `EngineAdapter`
interface without touching the renderer contract — Pymunk2D stays the default,
PyBullet3D becomes a selectable option (the Setup screen already shows it as a
disabled "Coming Soon" chip).

**Why it's a clean swap:** the architecture was built for this. The renderer
consumes only `EpisodeTrace`, scoring derives only from the trace, and the engine
is reached through `EngineAdapter.simulate(design, world, duration) -> EpisodeTrace`.
So 3D is an additive adapter, *not* a rewrite — but the trace and renderer need a
third dimension.

**Plan (incremental, each step shippable):**

1. **Trace schema → 3D-capable.** `FrameBody` is `{x, y, angle}`; extend to an
   optional `z` and a quaternion/`euler` for 3D orientation, kept backward-compatible
   (2D traces omit them; the renderer treats missing `z` as 0). Bump `EpisodeTrace.version`.
   *Touch points:* `core/schemas/trace.py`, every `FrameBody(...)` construction.
2. **`engines/pybullet3d/` adapter.** New `Pybullet3DEngine(EngineAdapter)` with
   `name = "pybullet3d"`, a `builder.py` that maps `DesignSpec` bodies/joints to
   PyBullet rigid bodies and constraints, and a `simulate()` that records frames at
   the same `_TARGET_FPS` sub-sampling the 2D engine uses. Register it in
   `engines/__init__.py::get_engine`.
3. **Determinism.** Fix the PyBullet timestep and solver iterations; seed any
   randomness. Add it to the determinism tests.
4. **Validator + Setup.** Flip `pybullet3d` from `unsupported_engine` to allowed in
   `setup/validators.py`; enable the Setup chip. Keep Pymunk2D the default.
5. **Renderer.** The Phaser iso scene is 2.5D. Two options — (a) project 3D → iso
   (cheapest: use `x`, `y+z` projection, keep Phaser), or (b) a Three.js scene
   selected when `trace.engine == "pybullet3d"`. Option (a) ships first; (b) is a
   later visual upgrade. The renderer still consumes only the trace.
6. **Tooling.** Most build tools map directly; 3D adds a depth axis to `position`
   and new joint DOFs. Gate 3D-only tool args behind the engine.

**Risks:** PyBullet is a heavier native dep (CI install time, wheels per platform);
the iso renderer only fakes depth. Mitigate by keeping PyBullet an **optional**
dependency group (`uv sync --group engines-3d`) so the default install and the
one-command launch stay lean.

**Estimate:** multi-session. Steps 1–4 (backend + a flat-projected replay) are a
solid first PR; the Three.js renderer is a separate follow-up.

🔵 **Needs a product call** before starting: ship 3D with the cheap iso projection
first, or hold until a proper Three.js renderer is ready?

---

## 2. Review findings (post-MVP skim, 2026-06-11)

A read-through of the critical path (apply chokepoint, runner, orchestrator,
scoring, engine builder, API routes, WS, static serving, Studio flow). The flow is
sound end-to-end: **Setup → /setup/launch → run_id → /studio/:runId → WS events
drive every panel → trace fetched & replayed → exports**. No crash-class bugs found.

### Fixed in this pass 🟢

| # | Severity | Issue | Fix |
|---|----------|-------|-----|
| R1 | **Bug** (cosmetic) | `/favicon.svg` (and any static-root file) hit the SPA catch-all and returned `index.html`, so the favicon never loaded. | `spa_fallback` now serves a real file from the static root when one exists (path-traversal guarded), else `index.html`. Tested. |
| R2 | **Robustness** | `POST /api/setup/launch` launched *any* config without re-validating, so an invalid one (e.g. a `manual` provider) could bypass the UI's disabled button and fail only mid-run. | `/launch` now re-runs `validate_launch_config` and returns `422` with the validation detail unless state is `ready`. Tested. Completes the P2 manual-provider guard. |

### Documented, not changed (low risk / by design)

| # | Severity | Issue | Notes |
|---|----------|-------|-------|
| R3 | Low | **`icons.svg` is an unused leftover** (social-media sprite from a starter template); not referenced anywhere in `frontend/src`. | Dead ~KB asset. Safe to delete from `frontend/public/` and rebuild. Left for a focused cleanup. |
| R4 | Low | **Stale-closure on `agents`** in `StudioScreen`'s WS effect — handlers read `agents[0]?.id` from the array captured when the effect ran (deps `[runId]`), which is the initial `[]`. | Harmless today: every relevant event (`tool_call`/`design_update`/`score`/`trace_ready`) carries its own `agent_id`, so the fallback is never reached. Fragile if an event ever omits `agent_id` — prefer a ref or include `agents` in deps. |
| R5 | Low | **`_default_world()` uses `template="flat_ground"`**, which isn't a real template id (valid: `flat_arena`, `hill_path`, `island_cliff_small`, …). | Harmless — the template string is a label; the engine uses `world.gravity`/`map_size` which default correctly. Only on the demo `POST /api/runs` path. Tidy the label. |
| R6 | Low | **WS breaks on `error` before delivering the following `run_finished`** (`routes_ws.py` breaks on the `error` event). | Known (gap `L6`); the frontend `onclose` handler already leaves the "Building…" state, so the UI doesn't hang. |
| R7 | Low | **`_design_summary` reports beams/ramps/sensors as 0** though beams/ramps exist as `segment` bodies; `total_parts` is still correct. | Known (gap `L3`). UI category breakdown undercounts; totals are right. |
| R8 | Low | **`sorting_accuracy` denominator** (`parts_used − bins_count`) counts static non-bin bodies (e.g. ramps) as "items to sort". | Reward is a documented proxy; fine for the Sorter demo. Refine when real per-object classification lands. |

---

## 3. Other improvements worth doing (beyond `remaining_gaps.md`)

- **Skip double-scoring** (gap `L2`): `create_run_from_design` always computes a
  `default` score, then the runner re-scores with the named reward. Pass the reward
  through (or skip the baseline on the runner path).
- **`relay` / `sandbox` modes**: currently alias the single-agent path; implement or
  hide in the UI until built.
- **Real-LLM integration test**: a test against a mock HTTP server exercising
  `OpenAICompatibleProvider.complete()` timeouts/error wrapping (no live key needed).
- **Bundle size**: the JS bundle is ~1.6 MB (442 KB gzipped). Code-split Phaser to
  cut first-load if the Studio screen is lazy-loaded.

---

## 4. Deep audit (2026-06-15) — four-part review

A four-agent parallel review (backend correctness, frontend UX/polish, onboarding,
API contracts). Priority order applied: **bugs → polish → improvements**. No
crash-class bugs were found; the issues were silent failures, placeholder-as-real,
onboarding robustness, and a few backend correctness nits.

### Fixed 🟢 (all HIGH bugs across the stack)

| Area | Fix |
|------|-----|
| Setup | Launch failures now surface a banner with the backend's 422 detail (`client.ts` `ApiError` carries status + body). |
| Setup | Validation reachability tracked; TopBar pill shows Connected/Connecting/Server-offline instead of a hardcoded "System Online". No more eternal "Validating…". |
| Setup | Tools auto-seed race fixed: checked tools derive from `config.tools.enabled` (single source), mount seed unions, preset selection merges `required_tools`. |
| Studio | Viewport overlay for loading / error / disconnected (was a blank black canvas). |
| Studio | WS drop → distinct `disconnected` status ("Connection lost"), not a fake "Finished". |
| Studio | ChallengeBriefing shows real reward + constraints (new `run_started` payload); unified project-name fallback; tab title `frontend`→`Agentarium`. |
| Onboarding | `serve` defaults to no-reload; friendly port-in-use message; browser opens only after `/api/health` is ready; `run.sh`/`run.ps1` re-check `uv` after install. |
| Backend | `max_motors` enforced; stability `0.0` on <2 frames; engine always records the final frame; SQLite `scores`/`designs` pruned with `runs`; `save_preset` name sanitized (path-traversal); cooperative prompt instructs exact-id references. |

### Deferred 🟡 / re-assessed

| Item | Why |
|------|-----|
| **Event-loop offload** (`asyncio.to_thread` for simulate/IO) | Breaks the Starlette TestClient WS harness; it's a responsiveness optimization, not a correctness bug. Revisit with an integration-test approach. |
| **Cooperative cross-agent joints** (audit called it "broken") | Re-assessed: the remap already preserves cross-agent ids, and the prompt now instructs exact-id use. Works with a cooperating LLM; the mock doesn't form them (mock limitation, not a bug). |
| **Polish (priority 2)** | 🟢 Done in the polish pass: wired the Fullscreen button (viewport `requestFullscreen`); removed the dead no-op links ("How it works"/"About connections"/"View Details") and made TopBar "Docs" a real link; removed the redundant challenge dropdown (kept the cards); removed the unused Tailwind import + plugin + dep (CSS bundle 7.9 kB → 0.56 kB); replaced `window.prompt`/`alert` Save Preset with an inline styled modal; added an `--on-accent` token; added a model picker (`<datalist>`) from the connection check's model list; added keyboard playback (Space play/pause, ←/→ frame step); fixed the stale-agents closure with a ref. **Still open:** small-width responsiveness and the "World Preview" placeholder thumbnail. |
| **Improvements (priority 3)** | `attempt_started`/`attempt_finished` emitted but unhandled (lineage dead on the wire); LLM probe hits `/models` but agents call `/chat/completions`; `name_design`/`mutate_design`/`repair_invalid_design` are no-ops reporting success; per-agent LLM settings forced shared; `WorldConfig` vs `WorldTemplate` `active_physics_zones` default (3 vs 1); double scoring (`L2`); `Frame.events` on the wire but unused. |
