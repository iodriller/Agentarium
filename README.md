# Agentarium

**Agentarium is a visual AI physics sandbox where agents build objects in simulated worlds, run experiments, and improve their designs from replayed results.**

Give an agent a challenge, a world, a physics engine, and a set of explicit tools. The agent builds creatures, bridges, machines, or tiny environments; the backend validates and simulates the result; the UI replays what happened; and the run is scored with explainable metrics.

```text
Prompt → setup → tools → design → simulation → replay → score → next attempt
```

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

That's it — the launcher installs [`uv`](https://docs.astral.sh/uv/) if needed
(which manages Python for you), installs dependencies, and starts Agentarium at
**http://localhost:8765**. A prebuilt web UI ships with the repo, so **Node is
not required**.

> First run downloads dependencies and takes a minute or two; after that it
> starts in seconds. To stop the server, press `Ctrl+C`.

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

## Planned MVP

Agentarium is currently in planning / bootstrap mode. The MVP is designed around two main screens:

1. **Simulation Setup** — choose scenario, world, agents, LLM provider, available tools, constraints, and outputs.
2. **Simulation Studio** — watch agents build, compete or cooperate, call tools, run physics experiments, and replay scored attempts.

## Core Ideas

- Isometric visual physics sandbox
- Explicit agent tools
- Configurable scenarios, worlds, agents, constraints, and scoring
- Local or OpenAI-compatible LLM backends
- Multi-agent competition and cooperation
- Replayable traces and explainable scorecards
- Engine-agnostic architecture: Pymunk2D first, PyBullet3D later
- Scalable world building through prefabs and active physics zones

## First Demo Target

> An AI agent tries to build a creature or machine that crosses a small simulated world. It fails visibly, inspects the replay, adjusts the design, and tries again.

## Planning Documents

- [`docs/COMPREHENSIVE_PLAN.md`](docs/COMPREHENSIVE_PLAN.md) — master product & engineering plan, with a pixel-accurate UI spec for both screens, data models, design system, and milestone map.
- [`docs/IMPLEMENTATION_STEPS.md`](docs/IMPLEMENTATION_STEPS.md) — the literal step-by-step build guide (Step 1 → 27) with acceptance checks and suggested PR slices.
- [`docs/AGENTARIUM_PLAN.md`](docs/AGENTARIUM_PLAN.md) — original roadmap, schemas, and repo layout.
