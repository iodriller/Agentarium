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

To rebuild the web UI (only needed if you change the frontend; requires Node
20.19+ or 22.12+):

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
   side-view world, run physics, and replay each scored attempt — with a live
   tool-call log, design summary, scorecards, and telemetry.

A run is real and visible end to end: **Launch → agent builds via validated tool
calls → physics runs → the world replays it → scores and telemetry stream live.**

## Challenges

| Challenge | Reward | World | Goal |
| --- | --- | --- | --- |
| Bridge Builder | `bridge_transport` | Island Cliff | Carry the crate to the goal zone, stay standing, stay lean. |
| Crawl Challenge | `crawl_locomotion` | Hill Path | Move a creature forward and cross the threshold line. |
| Sorter | `sorting_accuracy` | Sorting Table | Drop each ball into the bin that **accepts its class** (color). |
| Tiny City | `city_score` | Tiny City Block | Lay out a well-spaced, livable little city. |

Each challenge scores differently: Bridge rewards goal progress + reaching the
goal, stability, and a lean part count; Crawl rewards pure forward locomotion and
crossing the line; Sorter does true object-class-to-bin matching (falling back to
plain containment when no class is declared); Tiny City rewards structure count,
spread, and nearest-neighbour spacing (livability).

## How it works

- **24 explicit tools** in five categories (build, sensors/control,
  physics/materials, simulation/inspection, evolution). Every design mutation
  goes through one validated chokepoint — agents can't crash the engine.
- **Engine-neutral traces.** The renderer consumes only an `EpisodeTrace`, so the
  physics engine is swappable (Pymunk2D now, PyBullet3D later).
- **Durable build timelines.** Each agent attempt persists labelled construction
  snapshots beside the physics trace, so historical Studio replay can show both
  what the agent built step by step and what happened in simulation.
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

### OpenAI API key

For OpenAI-compatible hosted models, put your key in a repo-root `.env` file:

```bash
OPENAI_API_KEY=sk-...
```

The backend loads that file automatically. The Setup screen shows a masked
preview such as `sk-********1234`, uses the env key when the API-key field is
blank, and does not save the real key into `runs/workspace_config.json`.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full component map,
data-flow diagram, and invariants — and
[`docs/examples/`](docs/examples/) for a real generated
[run report](docs/examples/sample_report.md) and
[scorecard](docs/examples/sample_scorecard.json).

## Development

```bash
uv run ruff check .            # lint
uv run pytest                  # backend tests
cd frontend && npm run build   # type-check + build the UI; Node 20.19+ or 22.12+
npm --prefix frontend run lint # frontend lint

# Browser UI diagnosis — drives the Studio and Setup screens in headless Chromium
uv run python -m playwright install chromium   # one-time browser download
AGENTARIUM_VISUAL_TESTS=1 uv run pytest backend/tests/test_visual_playwright.py

# Optional live OpenAI smoke checks (normal tests stay offline)
AGENTARIUM_LIVE_OPENAI_TESTS=1 uv run pytest backend/tests/test_openai_live_smoke.py
```

CI runs lint + tests + the frontend build on every push and PR. Backend changes
must keep all three gates green and ship with tests (use the `mock` provider so
tests need no network). Playwright lets you smoke-test the side-view renderer,
tool-call log, and scorecard against a live local server — UI tests skip cleanly
if its browser isn't installed. Conventions and architecture invariants live in
[`CLAUDE.md`](CLAUDE.md).

## Documentation

Current docs:

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — implemented architecture,
  contracts, tools, scoring, modes, and invariants.
- [`docs/remaining_gaps.md`](docs/remaining_gaps.md) — current backlog of known
  gaps and deferred work.
- [`docs/IMPROVEMENTS.md`](docs/IMPROVEMENTS.md) — review notes, shipped
  improvements, and larger roadmap items.
- [`docs/examples/`](docs/examples/) — sample exported report and scorecard.

Historical planning docs:

- [`docs/archive/`](docs/archive/) captures the original product plan, build
  sequence, and early gap analysis. Treat these as background unless you are
  auditing how the MVP got here.
