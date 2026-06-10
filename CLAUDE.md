# CLAUDE.md

Guidance for Claude (and subagents) working in the Agentarium repository.

## What this is

Agentarium is a visual AI physics sandbox: LLM agents pick explicit tools to build
designs in an isometric world, the backend simulates with Pymunk2D, and the Studio
replays scored attempts. See `docs/COMPREHENSIVE_PLAN.md` (master plan + UI spec) and
`docs/IMPLEMENTATION_STEPS.md` (numbered Step 1–27 build guide). Track progress against
the milestone map there.

## Commands (run from repo root `/home/user/Agentarium`)

- Install: `uv sync --all-groups`
- Lint: `uv run ruff check .`  — must be clean before commit
- Tests: `uv run pytest`       — must pass before commit
- Backend server: `uv run agentarium serve` (127.0.0.1:8765)
- Frontend build: `cd frontend && npm run build` — must compile (TS) before commit
- Frontend dev: `cd frontend && npm run dev` (5173, proxies /api + /ws to 8765)

Always run lint + tests (and `npm run build` if frontend changed) before committing.

## Architecture invariants (do not violate)

1. **Agents only emit validated tool calls.** Every design mutation goes through the
   single chokepoint `backend/agentarium/tools/apply.py::apply_tool_call`. Agents never
   touch the engine, renderer, or filesystem directly. High-risk tools default off.
2. **The renderer consumes only `EpisodeTrace`.** Never read engine internals in the
   frontend. This keeps the engine swappable (Pymunk2D now, PyBullet3D later).
3. **`LaunchConfig` is the single source of truth** produced by the Setup screen; the
   backend Pydantic models and the frontend `api/types.ts` must stay in sync.
4. **Engine-neutral traces + named pluggable rewards.** Scoring derives metrics from the
   trace, not the engine.
5. **Multi-agent attribution:** per-tool-call `agent_id`, per-part `created_by`, and
   per-agent events carry `agent_id`. Agent colors: A = `--agent-a` (violet),
   B = `--agent-b` (sky).

## Layout

- `backend/agentarium/` — `core/schemas` (Pydantic v2), `api` (routers), `tools`
  (registry + apply chokepoint), `engines` (base + pymunk2d), `agents` (providers +
  runner + prompts), `services` (run/scoring/preset/orchestrator), `worlds`,
  `challenges`.
- `frontend/src/` — `screens` (Setup, Studio), `components/setup`, `components/studio`,
  `phaser` (iso renderer), `api` (client + types).
- `runs/` — generated artifacts (gitignored). `backend/agentarium/static/` — built
  frontend (gitignored).

## Conventions

- **Backend:** Python 3.11+, Pydantic v2 (`model_dump`, `model_config`), async routes,
  ruff (line length 100, E/F/I/UP/B). No new runtime deps without need; prefer stdlib
  (e.g. manual lightweight JSON-schema validation over adding `jsonschema`).
- **Frontend:** React + TypeScript, inline styles using the CSS-variable design tokens
  in `index.css` (`--bg`, `--surface-1/2`, `--border`, `--text-1/2`, `--accent`,
  `--ok/warn/danger`, `--agent-a/b`). No Tailwind utility classes in components, no new
  CSS files, no charting library (inline SVG only), no new npm packages without need.
- **Tests:** add tests with every step; use the `mock` provider for agent/run tests so
  they need no network. Keep simulations short (≤ ~2s sim time) so the suite stays fast.
- **Determinism:** seeded worlds, fixed `dt`; a trace must be replayable on its own.

## Git workflow

- Work on the designated feature branch; never push to `main` directly.
- Commit per step with a descriptive message; end the body with the session URL line.
- Do **not** create or merge PRs unless explicitly asked.
- Do not commit `runs/` or `backend/agentarium/static/` (gitignored).

## Operational notes

- Do **not** use `pkill`/`pkill -f uvicorn` in this environment — it has killed the
  shell session. To verify backend behavior, prefer in-process checks
  (`uv run python -c ...`) or `TestClient` over launching a background server.
- When delegating a step to a subagent, give it: the exact files to read, the acceptance
  checks, and the constraints above. Keep backend-only and frontend-only work on
  non-overlapping files when running agents in parallel.
