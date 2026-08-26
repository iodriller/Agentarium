# Agentarium

[![CI](https://github.com/oney-erge/Agentarium/actions/workflows/ci.yml/badge.svg)](https://github.com/oney-erge/Agentarium/actions/workflows/ci.yml)

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

**Windows**

```powershell
.\run.bat
```

Use `.\run.ps1` when you want to stay in PowerShell.

**macOS**

```bash
./run.command
```

**Linux**

```bash
./run.sh
```

You can double-click `run.bat` on Windows or `run.command` on macOS.
Every launcher accepts the same actions: `doctor`, `repair`, `docker`, `logs`,
and `stop`. Docker binds the UI to loopback and persists run data in a named
volume.

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

Seven connected workspaces:

1. **Simulation Setup** — choose a task, world, agent protocol, models, tools,
   real resource constraints, and artifact outputs.
2. **Simulation Studio** — inspect the model turns and tool calls, scrub the
   construction and physics timelines, replay attempts, and export evidence.
3. **History** — reopen durable SQLite-backed runs, filter them, and select
   traces for comparison.
4. **Experiments** — run paired model × seed × repeat matrices with mean/SD,
   confidence intervals, and paired win/tie/loss score deltas.
5. **Compare** — synchronize two to four replays while comparing scores, config,
   tokens, latency, and native-tool versus prompt-JSON protocol.
6. **Physical Lab** — run the same typed observation/action boundary against a
   deterministic mock rover or a configured ROS 2 gateway, with explicit
   arming, geofences, limits, a watchdog, and a latched emergency stop.
7. **Visual Catalog** — review deterministic City/Bridge/Crawl/Sorter reference
   scenes across diorama, playful, blueprint, and neon themes. Studio replays
   can switch between a clean Beauty view and joint/velocity/ID-rich
   Engineering overlays.

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
- **Iterative model loop.** Real providers can request a bounded preview,
  inspect score/state/failures, and revise within an attempt. Native function
  calls are used when supported, with validated JSON fallback.
- **Reproducible evaluation.** Provider/model/seed, benchmark fingerprint,
  protocol, token usage, retry count, request id, latency, prompts, and model
  results are recorded per turn.
- **Multi-agent.** `single`, `competitive`, `cooperative`, `relay`, and
  `sandbox` protocols, with lineage and every part attributed to its author.
- **LLM providers.** `mock` (offline, deterministic), `localdeploy`, and any
  OpenAI-compatible endpoint. Connection probes are short; generation calls have
  configurable timeouts and retry/backoff, and surface structured errors
  (auth / rate-limit / server / timeout / malformed). Tune via env vars:
  `AGENTARIUM_LLM_TIMEOUT_S` (default 120), `AGENTARIUM_LLM_RETRIES` (default 2),
  `AGENTARIUM_LLM_BACKOFF_S` (default 0.5).

### Headless runs and sweeps

The UI and automation use the same schemas and run pipeline:

```bash
uv run agentarium run --config path/to/launch.yaml --seed 42
uv run agentarium sweep --matrix path/to/experiment.yaml
```

Both commands print machine-readable JSON. Sweep cells remain ordinary durable
runs, so their replays open in Studio.

### Physical / ROS 2 gateway

Physical Lab always includes an offline mock rover. A real robot-side gateway
can be registered without adding ROS dependencies to the Agentarium server:

```bash
AGENTARIUM_ROS2_GATEWAY_URL=http://robot-gateway:8080
AGENTARIUM_ROS2_GATEWAY_TOKEN=robot-side-secret
AGENTARIUM_OPERATOR_KEY=human-arming-secret
uv run agentarium serve
```

Real-device arming also requires the operator key in the UI. Agentarium only
sends bounded `drive_to` and `stop` actions; the robot-side gateway must enforce
its own local watchdog, actuator limits, collision avoidance, and physical
emergency stop. **Agentarium is not a certified safety controller.** See
[`docs/EMBODIMENT.md`](docs/EMBODIMENT.md).

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
[`docs/EXPERIMENTS.md`](docs/EXPERIMENTS.md) for reproducible model evaluation,
[`docs/EMBODIMENT.md`](docs/EMBODIMENT.md) for the physical boundary, and
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
- [`docs/EXPERIMENTS.md`](docs/EXPERIMENTS.md) — model matrices, paired seeds,
  statistics, CLI automation, and artifacts.
- [`docs/EMBODIMENT.md`](docs/EMBODIMENT.md) — mock/ROS 2 adapters, physical
  episodes, safety state machine, and gateway contract.
- [`docs/remaining_gaps.md`](docs/remaining_gaps.md) — current backlog of known
  gaps and deferred work.
- [`docs/IMPROVEMENTS.md`](docs/IMPROVEMENTS.md) — review notes, shipped
  improvements, and larger roadmap items.
- [`docs/examples/`](docs/examples/) — sample exported report and scorecard.

Historical planning docs:

- [`docs/archive/`](docs/archive/) captures the original product plan, build
  sequence, and early gap analysis. Treat these as background unless you are
  auditing how the MVP got here.
