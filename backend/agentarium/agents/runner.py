from __future__ import annotations

import pathlib
import uuid

import yaml
from pydantic import BaseModel

from agentarium.agents import get_provider
from agentarium.agents.parsing import parse_tool_calls
from agentarium.agents.prompts import (
    build_cooperative_user_prompt,
    build_system_prompt,
    build_user_prompt,
)
from agentarium.core.schemas.challenge import ScenarioPreset
from agentarium.core.schemas.design import WORLD_AUTHOR, BodySpec, DesignSpec
from agentarium.core.schemas.score import ScoreCard
from agentarium.core.schemas.setup import AgentConfig, LaunchConfig, MemoryMode
from agentarium.core.schemas.toolcall import ToolCallRecord, ToolCallStatus
from agentarium.services.preset_service import get_scenario_preset, get_world_template
from agentarium.services.run_service import (
    create_run_from_design,
    get_trace,
    record_run_meta,
    store_score,
)
from agentarium.services.scoring_service import score_attempt
from agentarium.tools.apply import apply_tool_call
from agentarium.tools.registry import get_tool

_RUNS_DIR = pathlib.Path("runs")


def _inject_challenge_goal(config: LaunchConfig, design: DesignSpec) -> None:
    """Record the challenge's scoring params on the design so rewards are goal-aware.

    The reward functions only see ``compute_metrics`` output, which reads
    ``design.metadata["challenge"]``; this is where goal_x / threshold_x /
    min_spacing from the chosen preset get surfaced to scoring.
    """
    preset = get_scenario_preset(config.scenario.preset)
    if preset is not None and preset.goal:
        design.metadata["challenge"] = dict(preset.goal)


def _seed_bodies(design: DesignSpec, raw_bodies: list[dict], force_static: bool) -> None:
    """Append ``raw_bodies`` (BodySpec mappings) into ``design`` (in place).

    Skips duplicate ids and malformed entries. Tags untagged bodies as world
    parts. ``force_static`` pins terrain geometry static regardless of the entry.
    """
    existing = {b.id for b in design.bodies}
    for raw in raw_bodies:
        try:
            spec = BodySpec(**raw)
        except Exception:  # noqa: BLE001 - skip a bad entry, keep the rest usable
            continue
        if spec.id in existing:
            continue
        if force_static:
            spec.static = True
        if spec.created_by is None:
            spec.created_by = WORLD_AUTHOR
        design.bodies.append(spec)
        existing.add(spec.id)


def _seed_world(design: DesignSpec, config: LaunchConfig) -> None:
    """Seed the chosen world template's fixed terrain (cliffs, ledges, hills)."""
    template = get_world_template(config.world.template)
    if template is not None and template.static_bodies:
        _seed_bodies(design, template.static_bodies, force_static=True)


def _seed_scaffold(design: DesignSpec, preset: ScenarioPreset | None) -> None:
    """Seed the challenge's starting objects into ``design`` (in place).

    Gives every challenge a concrete, non-empty world the agent can reason about
    and reference, and guarantees at least one dynamic body so something always
    simulates. A malformed scaffold entry is skipped rather than failing the run.
    """
    if preset is None or not preset.scaffold:
        return
    _seed_bodies(design, preset.scaffold, force_static=False)


def _world_context(config: LaunchConfig, preset: ScenarioPreset | None, design: DesignSpec) -> str:
    """A grounded world description for the system prompt.

    Without this, models build at pixel-scale coordinates off the visible world
    and never place a movable body. This states the unit (meters), the bounds,
    the objects already present, and the concrete goal.
    """
    w = config.world
    half_x = int(w.map_size[0] // 2) if w.map_size else 16
    max_y = int(w.map_size[1]) if w.map_size and len(w.map_size) > 1 else 16
    max_y = max(10, max_y)
    lines = [
        f"{w.terrain.value} terrain, engine {w.engine.value}, gravity {w.gravity} m/s^2.",
        "Coordinates are in METERS, not pixels. The ground is a flat solid floor at "
        f"y=0 and up is +y. Keep parts within x in [-{half_x}, {half_x}] and y in "
        f"[0, {max_y}].",
    ]
    if design.bodies:
        objs = "; ".join(
            f"{b.id} ({'fixed' if b.static else 'movable'} {b.shape.value}) at "
            f"[{b.position[0]:.1f}, {b.position[1]:.1f}]"
            for b in design.bodies[:10]
        )
        lines.append(f"Objects already in the world (build on / connect to these): {objs}.")
    goal = preset.goal if preset else {}
    if isinstance(goal.get("goal_x"), (int, float)):
        lines.append(
            f"Goal: get the movable object to x = {goal['goal_x']} (the green marker)."
        )
    if isinstance(goal.get("threshold_x"), (int, float)):
        lines.append(
            f"Goal: drive the movable object past x = {goal['threshold_x']} (the green marker)."
        )
    if isinstance(goal.get("target_structures"), (int, float)):
        spacing = goal.get("min_spacing", 1.0)
        lines.append(
            f"Goal: place at least {int(goal['target_structures'])} separate structures, "
            f"spread across the map and spaced at least {spacing} apart."
        )
    return "\n".join(lines)

# Upper bound on simulated time per attempt, regardless of the user-set
# ``simulation_duration_seconds``. Keeps runs (and the studio replay) bounded
# while honoring durations up to this cap; the engine also caps total steps.
_MAX_SIM_DURATION_SECONDS = 30


def _simulate_design(design: DesignSpec, world, duration: float) -> str | None:
    """Simulate ``design``, returning its trace run id, or None if it can't run.

    Any engine/physics failure (a degenerate body or constraint that trips
    pymunk) is contained here so one bad attempt scores zero and the run keeps
    going, instead of an exception aborting the entire run.
    """
    try:
        return create_run_from_design(design, world, duration_seconds=duration)
    except Exception:  # noqa: BLE001 - a bad design must not abort the whole run
        return None


class AttemptResult(BaseModel):
    attempt_id: str
    design: DesignSpec
    trace_run_id: str | None
    score: ScoreCard
    tool_calls: list[ToolCallRecord]
    parent_attempt_id: str | None = None
    attempt_index: int = 0
    # Structured diff vs. the previous attempt (None for the first attempt).
    diff: dict | None = None


def _attempt_diff(prev: AttemptResult | None, design: DesignSpec, score: ScoreCard) -> dict | None:
    """Structured diff of this attempt vs. the previous one (parts, score, failures).

    Used both to feed the agent's prompt ("what you changed and how it scored")
    and to surface "what changed" in Studio. Returns None for the first attempt.
    """
    if prev is None:
        return None
    prev_ids = {b.id for b in prev.design.bodies}
    cur_ids = {b.id for b in design.bodies}
    prev_pos = {b.id: tuple(b.position) for b in prev.design.bodies}
    moved = [
        bid
        for b in design.bodies
        if (bid := b.id) in prev_pos and tuple(b.position) != prev_pos[bid]
    ]
    return {
        "prev_attempt_index": prev.attempt_index,
        "parts_delta": len(design.bodies) - len(prev.design.bodies),
        "joints_delta": len(design.joints) - len(prev.design.joints),
        "added_parts": sorted(cur_ids - prev_ids),
        "removed_parts": sorted(prev_ids - cur_ids),
        "moved_parts": sorted(moved),
        "prev_score": prev.score.score_total,
        "score_delta": score.score_total - prev.score.score_total,
        "failure_events": [str(e.get("type", e)) for e in score.failure_events],
    }


def _build_memory(prev: AttemptResult | None) -> str:
    """Previous-attempt summary for the prompt: score, hint, and what changed."""
    if prev is None:
        return ""
    line = (
        f"- Attempt #{prev.attempt_index}: score "
        f"{prev.score.score_total:.1f}. {prev.score.improvement_hint}".strip()
    )
    diff = prev.diff
    if diff:
        parts = []
        if diff["added_parts"]:
            parts.append(f"added {len(diff['added_parts'])} part(s)")
        if diff["removed_parts"]:
            parts.append(f"removed {len(diff['removed_parts'])} part(s)")
        if diff["moved_parts"]:
            parts.append(f"moved {len(diff['moved_parts'])} part(s)")
        delta = diff["score_delta"]
        trend = f"score {'+' if delta >= 0 else ''}{delta:.1f} vs the attempt before"
        change = "; ".join(parts) if parts else "no structural change"
        line += f"\n  (last change: {change}; {trend})"
    return line


def _repair_rejected(
    design: DesignSpec,
    agent_id: str,
    enabled_names: list[str],
    records: list[ToolCallRecord],
) -> None:
    """One conservative repair pass over rejected records (in place).

    Handles the most common ``apply_tool_call`` rejection: a duplicate id on a
    body-creating call (``... already exists``). Retries with a ``_r`` suffix and,
    on success, replaces the rejected record with a ``repaired`` one. Anything
    that can't be repaired cleanly is left rejected so the design stays valid.
    """
    for i, record in enumerate(records):
        if record.status != ToolCallStatus.rejected or not record.error:
            continue
        if "already exists" not in record.error:
            continue
        new_id = f"{record.args.get('id', '')}_r"
        if not new_id or new_id == "_r":
            continue
        repaired_args = {**record.args, "id": new_id}
        result = apply_tool_call(
            design,
            agent_id=agent_id,
            tool=record.tool,
            args=repaired_args,
            enabled_tools=enabled_names,
        )
        if result.mutated:
            result.record.status = ToolCallStatus.repaired
            records[i] = result.record


async def run_single_attempt(
    config: LaunchConfig,
    *,
    attempt_index: int = 0,
    previous: AttemptResult | None = None,
) -> AttemptResult:
    """Run one single-agent build attempt end-to-end with the mock/real provider.

    Defaults to ``participants[0]`` so the single-agent path is unchanged.
    """
    participants = config.agents.participants
    if not participants:
        raise ValueError("config.agents.participants is empty")
    return await run_agent_attempt(
        config, participants[0], attempt_index=attempt_index, previous=previous
    )


async def run_agent_attempt(
    config: LaunchConfig,
    agent: AgentConfig,
    *,
    attempt_index: int = 0,
    previous: AttemptResult | None = None,
) -> AttemptResult:
    """Run one build attempt end-to-end for a SPECIFIC participant.

    Builds that agent's own DesignSpec, applies its own tool calls (tagged with
    ``agent.id``), simulates, scores, and persists under ``runs/{trace_run_id}/``.
    """
    attempt_id = f"attempt_{uuid.uuid4().hex[:8]}"

    provider = get_provider(agent.provider.value)
    if provider is None:
        raise ValueError(f"unknown provider: {agent.provider.value}")

    enabled_names = config.tools.enabled
    enabled_defs = [d for n in enabled_names if (d := get_tool(n)) is not None]

    objective = config.scenario.objective or config.scenario.preset

    # Build the starting world first so the prompt can describe it and the agent
    # has a concrete, non-empty design to extend.
    preset = get_scenario_preset(config.scenario.preset)
    design = DesignSpec(name=config.project_name)
    _seed_world(design, config)
    _seed_scaffold(design, preset)

    world_summary = _world_context(config, preset, design)
    system_prompt = build_system_prompt(objective, world_summary, enabled_defs)
    memory = (
        _build_memory(previous)
        if agent.memory_mode in (MemoryMode.episodic, MemoryMode.best_attempt_summary)
        else ""
    )
    user_prompt = build_user_prompt(objective, attempt_index, memory)

    raw = await provider.complete(
        model=agent.model,
        system=system_prompt,
        user=user_prompt,
        endpoint_url=agent.endpoint_url or config.llm_connection.endpoint_url,
        api_key=agent.api_key or config.llm_connection.api_key,
        temperature=agent.temperature,
    )

    tool_calls = parse_tool_calls(raw)

    records: list[ToolCallRecord] = []
    for call in tool_calls:
        tool = call.get("tool", "")
        args = call.get("args", {}) or {}
        result = apply_tool_call(
            design,
            agent_id=agent.id,
            tool=tool,
            args=args,
            enabled_tools=enabled_names,
            max_parts=config.constraints.max_parts,
            max_joints=config.constraints.max_joints,
            max_motors=config.constraints.max_motors,
        )
        records.append(result.record)

    # Optional conservative repair pass over rejected calls (e.g. duplicate ids).
    if config.constraints.repair_loop_enabled and any(
        r.status == ToolCallStatus.rejected for r in records
    ):
        _repair_rejected(design, agent.id, enabled_names, records)

    _inject_challenge_goal(config, design)

    # Simulate whenever the design has any body. All-static designs (e.g. a city
    # of fixed structures) still produce a trace + score; only a truly empty
    # design is skipped.
    trace_run_id: str | None = None
    if design.bodies:
        duration = min(
            config.constraints.simulation_duration_seconds, _MAX_SIM_DURATION_SECONDS
        )
        trace_run_id = _simulate_design(design, config.world, duration)

    trace = get_trace(trace_run_id) if trace_run_id is not None else None
    score = score_attempt(trace, design, config.scenario.reward)
    if trace_run_id is not None:
        store_score(trace_run_id, score)
        record_run_meta(
            trace_run_id,
            project_name=config.project_name,
            challenge=config.scenario.preset,
            mode=config.agents.mode.value,
        )

    # Persist artifacts under runs/{trace_run_id or attempt_id}/.
    out_dir = _RUNS_DIR / (trace_run_id or attempt_id)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "design.yaml").write_text(
        yaml.safe_dump(design.model_dump(mode="json"), sort_keys=False),
        encoding="utf-8",
    )
    with (out_dir / "toolcalls.jsonl").open("w", encoding="utf-8") as fh:
        for record in records:
            fh.write(record.model_dump_json() + "\n")
    (out_dir / "score.json").write_text(
        score.model_dump_json(indent=2), encoding="utf-8"
    )

    return AttemptResult(
        attempt_id=attempt_id,
        design=design,
        trace_run_id=trace_run_id,
        score=score,
        tool_calls=records,
        parent_attempt_id=previous.attempt_id if previous is not None else None,
        attempt_index=attempt_index,
        diff=_attempt_diff(previous, design, score),
    )


# Tools whose ``id`` arg names a NEW body/joint that becomes referenceable.
_OWN_ID_TOOLS = frozenset(
    {"create_body", "add_ball", "add_beam", "add_ramp", "add_bin", "add_joint"}
)
# Arg keys that REFERENCE an existing body/joint id.
_REF_ID_ARGS = ("body_a", "body_b", "body_id", "joint_id")


def _remap_ids(agent_id: str, tool: str, args: dict, created: dict[str, str]) -> dict:
    """Namespace an agent's OWN newly-created ids; leave cross-agent refs intact.

    The mock provider (and any naive agent) returns identical ids for every
    agent (e.g. ``create_body id="b1"``). In cooperative mode all agents write
    into ONE shared design, so without namespacing the second agent's parts
    would collide and be rejected. We prefix each agent's *own* created ids with
    ``{agent_id}_`` and record them in ``created`` (original → namespaced).

    References are only remapped when they point at an id THIS agent just
    created. A reference to anything else is left untouched so a genuine
    cross-agent joint (referencing a prior agent's already-live, namespaced id)
    resolves instead of being rewritten into a non-existent id.
    """
    new_args = dict(args)
    if tool in _OWN_ID_TOOLS:
        orig = new_args.get("id")
        if isinstance(orig, str):
            namespaced = f"{agent_id}_{orig}"
            new_args["id"] = namespaced
            created[orig] = namespaced
    for key in _REF_ID_ARGS:
        value = new_args.get(key)
        if isinstance(value, str) and value in created:
            new_args[key] = created[value]
    return new_args


async def run_cooperative_attempt(
    config: LaunchConfig, *, attempt_index: int = 0
) -> AttemptResult:
    """Run one COOPERATIVE attempt: all participants build ONE shared design.

    Turn order: participants in declared order. Agent A builds the base
    structure; each subsequent agent is shown a short summary of the design so
    far and asked to extend/stabilize it. Every agent's parts are tagged
    ``created_by=agent.id`` via :func:`apply_tool_call`. The shared design is
    simulated ONCE and scored ONCE into a single shared ScoreCard.

    Per-agent ids are namespaced (``{agent.id}_{id}``) so naive/identical tool
    calls from multiple agents don't collide in the shared design; references
    within an agent's own calls remap consistently.
    """
    participants = config.agents.participants
    if not participants:
        raise ValueError("config.agents.participants is empty")

    attempt_id = f"attempt_{uuid.uuid4().hex[:8]}"

    enabled_names = config.tools.enabled
    enabled_defs = [d for n in enabled_names if (d := get_tool(n)) is not None]

    objective = config.scenario.objective or config.scenario.preset

    preset = get_scenario_preset(config.scenario.preset)
    design = DesignSpec(name=config.project_name)
    _seed_world(design, config)
    _seed_scaffold(design, preset)

    world_summary = _world_context(config, preset, design)
    system_prompt = build_system_prompt(objective, world_summary, enabled_defs)

    records: list[ToolCallRecord] = []

    for turn_index, agent in enumerate(participants):
        provider = get_provider(agent.provider.value)
        if provider is None:
            raise ValueError(f"unknown provider: {agent.provider.value}")

        if turn_index == 0:
            user_prompt = build_user_prompt(objective, attempt_index)
        else:
            existing_ids = [b.id for b in design.bodies]
            user_prompt = build_cooperative_user_prompt(
                objective,
                attempt_index,
                body_count=len(design.bodies),
                joint_count=len(design.joints),
                existing_body_ids=existing_ids,
            )

        raw = await provider.complete(
            model=agent.model,
            system=system_prompt,
            user=user_prompt,
            endpoint_url=config.llm_connection.endpoint_url,
            api_key=config.llm_connection.api_key,
            temperature=agent.temperature,
        )

        # Per-turn map of this agent's original id → namespaced id, so its own
        # references remap while cross-agent references stay intact.
        created: dict[str, str] = {}
        for call in parse_tool_calls(raw):
            tool = call.get("tool", "")
            args = _remap_ids(agent.id, tool, call.get("args", {}) or {}, created)
            result = apply_tool_call(
                design,
                agent_id=agent.id,
                tool=tool,
                args=args,
                enabled_tools=enabled_names,
                max_parts=config.constraints.max_parts,
                max_joints=config.constraints.max_joints,
                max_motors=config.constraints.max_motors,
            )
            records.append(result.record)

    _inject_challenge_goal(config, design)

    # Simulate the SHARED design once when it has any body (all-static included).
    trace_run_id: str | None = None
    if design.bodies:
        duration = min(
            config.constraints.simulation_duration_seconds, _MAX_SIM_DURATION_SECONDS
        )
        trace_run_id = _simulate_design(design, config.world, duration)

    trace = get_trace(trace_run_id) if trace_run_id is not None else None
    score = score_attempt(trace, design, config.scenario.reward)
    if trace_run_id is not None:
        store_score(trace_run_id, score)
        record_run_meta(
            trace_run_id,
            project_name=config.project_name,
            challenge=config.scenario.preset,
            mode=config.agents.mode.value,
        )

    out_dir = _RUNS_DIR / (trace_run_id or attempt_id)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "design.yaml").write_text(
        yaml.safe_dump(design.model_dump(mode="json"), sort_keys=False),
        encoding="utf-8",
    )
    with (out_dir / "toolcalls.jsonl").open("w", encoding="utf-8") as fh:
        for record in records:
            fh.write(record.model_dump_json() + "\n")
    (out_dir / "score.json").write_text(
        score.model_dump_json(indent=2), encoding="utf-8"
    )

    return AttemptResult(
        attempt_id=attempt_id,
        design=design,
        trace_run_id=trace_run_id,
        score=score,
        tool_calls=records,
        attempt_index=attempt_index,
    )
