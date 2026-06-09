# Agentarium

**Agentarium is a visual AI physics sandbox where agents build objects in simulated worlds, run experiments, and improve their designs from replayed results.**

Give an agent a challenge, a world, a physics engine, and a set of explicit tools. The agent builds creatures, bridges, machines, or tiny environments; the backend validates and simulates the result; the UI replays what happened; and the run is scored with explainable metrics.

```text
Prompt → setup → tools → design → simulation → replay → score → next attempt
```

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

## Planning Document

See the full implementation plan:

- [`docs/AGENTARIUM_PLAN.md`](docs/AGENTARIUM_PLAN.md)
