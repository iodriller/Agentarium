# Agentarium

[![CI](https://github.com/iodriller/Agentarium/actions/workflows/ci.yml/badge.svg)](https://github.com/iodriller/Agentarium/actions/workflows/ci.yml)

**A visual AI physics sandbox where LLM agents build objects in simulated
worlds, run experiments, and improve their designs from replayed results.**

Give an agent a challenge, a world, a physics engine, and a set of explicit
tools. The agent builds creatures, bridges, machines, or tiny environments; the
backend validates and simulates the result; the Studio replays what happened;
and the run is scored with explainable metrics.

```text
Setup → tools → design → simulation → replay → score → next attempt
```

> An agent tries to build something that crosses a small simulated world. It
> fails visibly, inspects the replay, adjusts the design, and tries again.

## Run it (one command)

You don't need to install Python, set up a virtualenv, or install Node. One
command does everything and opens the app in your browser.

**macOS / Linux**

```bash
./run.sh
```

**Windows (PowerShell)**

```powershell
./run.ps1
```

The launcher installs [`uv`](https://docs.astral.sh/uv/) if needed (which
manages Python for you), installs dependencies, and starts Agentarium at
**http://localhost:8765**. A prebuilt web UI ships with the repo, so **Node is
not required**.

> First run downloads dependencies and takes a minute or two; after that it
> starts in seconds. Press `Ctrl+C` to stop.

<details>
<summary>Prefer to run things yourself? (the manual route)</summary>

```bash
uv sync --all-groups                 # install Python + deps
uv run agentarium serve --open       # start the server, open the browser
```

To rebuild the web UI (only needed if you change the frontend; requires Node 18+):

```bash
cd frontend && npm install && npm run build
```

`make run`, `make serve`, `make ui`, `make test`, and `make lint` wrap the same
commands.
</details>

## What you get

Two screens, one loop:

1. **Simulation Setup** — pick a scenario, world, agents, LLM provider, the tools
   agents may use, constraints, and outputs. Live validation tells you exactly
   what's missing before you can launch.
2. **Simulation Studio** — launch, then watch agents call tools and build in an
   isometric world, run physics, and replay each scored attempt — with a live
   tool-call log, design summary, scorecards, and telemetry.

A run is real and visible end to end: **Launch → agent builds via validated tool
calls → physics runs → the world replays it → scores and telemetry stream live.**

## Challenges

| Challenge | Reward | World | Goal |
| --- | --- | --- | --- |
| Bridge Builder | `distance_plus_stability` | Island Cliff | Move a crate across a gap to the goal. |
| Crawl Challenge | `distance_plus_stability` | Hill Path | Build a creature that crawls to the goal. |
| Sorter | `sorting_accuracy` | Sorting Table | Drop objects into the matching bins. |
| Tiny City | `city_score` | Tiny City Block | Lay out a small city within the budget. |

## How it works

- **24 explicit tools** in five categories (build, sensors/control,
  physics/materials, simulation/inspection, evolution). Every design mutation
  goes through one validated chokepoint — agents can't crash the engine.
- **Engine-neutral traces.** The renderer consumes only an `EpisodeTrace`, so the
  physics engine is swappable (Pymunk2D now, PyBullet3D later).
- **Explainable scoring.** Named, pluggable reward functions turn trace metrics
  into a scorecard with a summary and a concrete improvement hint.
- **Multi-agent.** `single`, `competitive`, and `cooperative` modes, with every
  part attributed to the agent that built it.
- **LLM providers.** `mock` (offline, deterministic), `localdeploy`, and any
  OpenAI-compatible endpoint. Connection probes are short; generation calls have
  configurable timeouts and retry/backoff, and surface structured errors
  (auth / rate-limit / server / timeout / malformed). Tune via env vars:
  `AGENTARIUM_LLM_TIMEOUT_S` (default 120), `AGENTARIUM_LLM_RETRIES` (default 2),
  `AGENTARIUM_LLM_BACKOFF_S` (default 0.5).

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full component map,
data-flow diagram, and invariants — and
[`docs/examples/`](docs/examples/) for a real generated
[run report](docs/examples/sample_report.md) and
[scorecard](docs/examples/sample_scorecard.json).

## Development

```bash
uv run ruff check .     # lint
uv run pytest           # backend tests
cd frontend && npm run build   # type-check + build the UI
```

CI runs lint + tests + the frontend build on every push and PR. Backend changes
must keep all three gates green and ship with tests (use the `mock` provider so
tests need no network). Conventions and architecture invariants live in
[`CLAUDE.md`](CLAUDE.md).

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — components, data flow, tools,
  scoring, multi-agent modes, invariants.
- [`docs/COMPREHENSIVE_PLAN.md`](docs/COMPREHENSIVE_PLAN.md) — master product &
  engineering plan with a pixel-accurate UI spec for both screens.
- [`docs/IMPLEMENTATION_STEPS.md`](docs/IMPLEMENTATION_STEPS.md) — the Step 1–27
  build guide with acceptance checks.
- [`docs/GAP_ANALYSIS.md`](docs/GAP_ANALYSIS.md) — known gaps and deferred items.
- [`docs/AGENTARIUM_PLAN.md`](docs/AGENTARIUM_PLAN.md) — original roadmap, schemas,
  and repo layout.
