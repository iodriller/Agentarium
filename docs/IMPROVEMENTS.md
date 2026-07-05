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

## 5. Honesty + reliability + challenge pack (2026-06-15)

Three workstreams toward an honest, reliable, differentiated MVP:

1. **Honesty/consistency.** Every tool declares a status (implemented / inspection
   / experimental); experimental tools are off by default and rejected (never a
   silent no-op). `set_density`/`set_gravity` implemented for real. Unenforced
   constraints (`energy_budget`, `material_budget`, `collision_safety`,
   `world_bounds`, `world.seed`) are badged "coming soon" in the UI.
2. **Real-LLM reliability.** Configurable generation timeout + retry/backoff (env),
   structured `LLMError` kinds (auth/rate_limit/server/timeout/malformed/empty),
   auth-vs-unreachable messaging, and a 16-test provider-contract suite over
   `httpx.MockTransport`. The Studio overlay shows the real failure reason.
3. **Challenge pack differentiation.** Per-challenge goals injected into scoring;
   distinct rewards — `bridge_transport` (goal zone + lean + stability),
   `crawl_locomotion` (forward motion + threshold), `sorting_accuracy` (true
   object-class→bin matching via ball color vs bin `accepts`, containment
   fallback), `city_score` (count + spread + nearest-neighbour spacing/livability).

**Still open in the challenge pack (larger follow-ups):** example "gold" designs
per challenge; Tiny City real zoning/roads/budget (currently a spacing/livability
proxy); world-template goal *geometry* (goal zones are scoring thresholds, not yet
rendered markers); a richer Sorter taxonomy beyond color classes.

## 7. End-to-end bug audit (2026-06-15)

Three parallel read-only audits (backend correctness, frontend, contracts) over the
recently-added features. Contracts were clean (no severe type-vs-emit drift). Fixed:

| Sev | Issue | Fix |
|-----|-------|-----|
| HIGH | `run_meta` grew unbounded and orphaned trace rows → history/leaderboard dead links once >1000 runs. | Prune `run_meta` in lockstep with `runs` on every write. |
| HIGH | `sorting_accuracy` counted static support beams as items (a perfect 3/3 sort showed 3/5, 60%). | Denominator now uses `sortable_items` = dynamic (non-static, non-bin) bodies. |
| MED | Demo/`POST /api/runs` runs (null challenge) polluted the global leaderboard. | Unfiltered leaderboard excludes `challenge IS NULL`. |
| MED | Cooperative `score` event omitted `diff` (single/competitive included it). | Emit `diff` (None) for shape parity. |
| MED | "Select All" tools enabled experimental tools (disabled, un-uncheckable, sent to launch). | Select All now skips experimental tools. |
| LOW | `_db_upsert_meta` f-string column interpolation (latent injection pattern). | Allowlist of permitted columns. |
| LOW | `reached_goal` wrong if a goal were placed behind the start. | Direction-aware goal check. |

**Left as documented (low/cosmetic):** historical replay leaves Design Summary /
Attempt History panels empty (best-effort, score + replay work); `HistoryScreen`
doesn't flash "Loading…" on a filter refetch; the `attempts_cap` field is emitted +
typed but unused; frontend `ToolDefinition` omits `compatible_challenges`/`input_schema`
(extra wire fields, harmless).

## 6. Iteration, visible caps, run history (2026-06-15)

- **Attempt diff (#4).** Each attempt computes a structured diff vs. the previous
  one (parts/joints deltas, added/removed/moved part ids, score delta, failures),
  feeds it into the next prompt's memory ("last change: added 2 parts; score +3.1"),
  and shows a "What Changed" panel in Studio. Cooperative attempts don't thread
  lineage, so their diff stays empty.
- **Visible caps (#5).** `run_started` now reports requested vs. effective attempt
  caps and the 30s sim cap; ChallengeBriefing shows "Attempts: 3 max (you set 50)"
  and "Sim cap: 30s" only when the cap bites.
- **Run history + leaderboard (#6).** A `run_meta` SQLite table (challenge, mode,
  reward, score, success, artifact dir, timestamp) + `GET /api/runs/history` and
  `GET /api/runs/leaderboard?challenge=…`. Survives restart. **Still open:** a
  frontend run-history / leaderboard view (the API is the foundation); optional
  `aiosqlite` async conversion; pruning `run_meta` (tiny rows, currently unbounded).

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
| **Improvements (priority 3)** | 🟢 Done: `attempt_started`/`attempt_finished` now handled (in-flight attempt surfaces live); `name_design` implemented (schema gained a `name` field; sets `design.name` instead of a false-success no-op); LLM probe distinguishes auth failure (401/403 → "rejected the API key") from unreachable; `WorldConfig.active_physics_zones` default aligned to `WorldTemplate` (1). **Still open:** LLM probe still hits `/models` not `/chat/completions` (a passing probe can still fail at generation); `mutate_design`/`repair_invalid_design` remain no-ops; per-agent LLM settings forced shared; double scoring (`L2`); `Frame.events` on the wire but unused; the PyBullet 3D engine (§1). |
| **Responsiveness** | 🟢 Done: Setup collapses 3→2→1 columns; Studio stacks its rails below ~1100px. Still open: the "World Preview" placeholder thumbnail. |

## 8. Tiny City visual overhaul (2026-07-05)

User complaint: "when I saw agents build a city it should look more like a city." Root
cause was the renderer, not the challenge content — `TraceRenderer.ts` only knew how to
draw `ground`/`circle`/`segment`/box, so every building (however well laid out) rendered
as an identical gray rectangle.

### Fixed 🟢

| Area | Fix |
|------|-----|
| Schema | Added an optional cosmetic `kind` field (`house`/`tower`/`shop`/`tree`/`road`/`park`/`water`/`goal`) to `BodySpec`, `BodyMeta`, and `StaticProp` — purely visual, no physics effect. |
| Tools | `create_body` gained an optional `kind` enum arg (no new tool — `_tool_line`'s existing enum-surfacing auto-documents it to agents). |
| Engine | `_build_static`/`body_meta` emit `kind = spec.kind or shape` so untagged bodies (every pre-existing challenge) render exactly as before. |
| Renderer | `TraceRenderer.drawByKind` procedurally draws each kind (house w/ triangular roof, tower/shop w/ window grid, tree w/ trunk+canopy, road w/ dashed centerline, park/water fill, goal flag) — no assets, one code path shared by static props and dynamic bodies. Added a faint parallax skyline backdrop for `terrain: city`. |
| Renderer bug found in visual verification | `worldBounds()` inflated the **Y** bound by a wide prop's **width** (`Math.max(w,h)` isotropic radius) — a 28m-wide road zoomed the whole scene out to a tiny strip. Replaced with a proper rotated-AABB half-extent calc. Pre-existing bug, newly exposed because Tiny City is the first world with a wide flat prop. |
| Prompt | Fixed a real contradiction: the system prompt unconditionally required "at least one MOVABLE body or score zero," which fights a static-scene challenge. `build_system_prompt` gained `movable_body_required`, false for `city_score`. |
| World/challenge content | `tiny_city_block.yaml` now seeds a road + 2 roadside trees (visual backdrop, `created_by="world"`, excluded from scoring). `tiny_city_preview.yaml`'s objective asks for buildings + a road + a park/plaza + trees, not just 6 boxes in a row. |
| Scoring | `city_score` adds an infra-variety bonus (road/park/tree counts + building height variety), computed only from the agent's own bodies (world backdrop excluded) so agents are pushed toward a real mix, not just spread-out boxes. |
| Mock provider | `MockProvider.complete()` recognizes a city objective (via the embedded "Objective: …" text) and emits a 9-part scene (road, park, 2 houses, 2 towers, 1 shop, 2 trees) instead of one box — the no-LLM demo now actually looks like a city. |

Verified visually: generated a mock Tiny City run and screenshotted the Studio replay
(Playwright) before/after the `worldBounds` fix — confirmed recognizable houses (roofs),
towers (windows), and a road render correctly and fill the viewport properly.

### Noted, not changed

| Item | Why |
|------|-----|
| `city_score` is still a metrics proxy (L1 in `remaining_gaps.md`), just a better one — it doesn't verify visual correctness (e.g. overlapping props). |

### Follow-up polish pass (2026-07-05, same day)

Closed out the naming gap noted above and found a second, more consequential bug while
regenerating the Setup screen's preset preview images.

| Area | Fix |
|------|-----|
| Naming | `IsometricWorldView` → `WorldView`; `PlaybackToolbar`'s "CAMERA: Isometric" → "Side View" (matches what `TraceRenderer` actually draws). Deleted `frontend/src/phaser/iso.ts` — a real isometric-projection module that was never imported anywhere (dead code left over from an abandoned earlier direction). |
| `kind` coverage | `bridge_builder.yaml` / `crawl_challenge.yaml` goal markers tagged `kind: goal` so they render as a flag instead of a plain green rectangle. |
| **Preset preview images** | All 5 Setup-screen preset cards (`bridge_builder`, `crawl_challenge`, `sorter`, `tiny_city_preview`, `custom`) showed polished 3D isometric mockup art (fountain, streetlights, low-poly robots) with **zero visual relationship** to the actual 2D side-view renderer. This is almost certainly the real source of "it should look more like a city" — the promo image promised a 3D isometric city, the delivered result was a simple 2D scene. Replaced all 5 with real screenshots of the actual Studio renderer (Playwright, mock provider, one generated run per challenge), confirmed with the user first since overwriting curated art is a one-way product call. New images are also ~2-6 KB each vs. the old ones' much larger file size. Added `data-hide-for-capture` to `WorldView`'s camera-control button cluster so future preview regeneration can hide UI chrome from the shot. |
| **Mock provider ground-tunneling bug** | Found while the "custom scenario" screenshot came out as an empty grid: the mock's placeholder body (`create_body`, no `position` → schema default `[0, 0]`) spawns fully embedded in the paper-thin (`radius=0.1`) ground segment and **tunnels through it forever** (`y -> -4412` by t=30s) instead of resting on top. This silently affected every non-city mock demo (bridge/crawl/sorter each had an invisible `b1` falling forever off-screen). Fixed by giving the mock's placeholder an explicit `position: [0, 3]` so it drops onto the ground normally. The underlying engine robustness gap (any body spawned embedded in the ground can tunnel through) is logged as `E5` in `remaining_gaps.md` — not fully fixed, since a general solution needs either a thicker ground collider or spawn-position validation. |

Verified visually again: screenshotted the full Setup screen with the new thumbnails in
place at real size (76×64, `object-fit: cover`) — all five read clearly at that scale.
