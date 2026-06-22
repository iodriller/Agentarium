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
from agentarium.core.schemas.design import DesignSpec
from agentarium.core.schemas.score import ScoreCard
from agentarium.core.schemas.setup import AgentConfig, LaunchConfig, MemoryMode
from agentarium.core.schemas.toolcall import ToolCallRecord, ToolCallStatus
from agentarium.services.preset_service import get_scenario_preset
from agentarium.services.run_service import (
    create_run_from_design,
    get_trace,
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

# Upper bound on simulated time per attempt, regardless of the user-set
# ``simulation_duration_seconds``. Keeps runs (and the studio replay) bounded
# while honoring durations up to this cap; the engine also caps total steps.
_MAX_SIM_DURATION_SECONDS = 30


class AttemptResult(BaseModel):
    attempt_id: str
    design: DesignSpec
    trace_run_id: str | None
    score: ScoreCard
    tool_calls: list[ToolCallRecord]
    parent_attempt_id: str | None = None
    attempt_index: int = 0


def _build_memory(prev: AttemptResult | None) -> str:
    """Brief "previous attempts" summary (last attempt's score + hint)."""
    if prev is None:
        return ""
    return (
        f"- Attempt #{prev.attempt_index}: score "
        f"{prev.score.score_total:.1f}. {prev.score.improvement_hint}".strip()
    )


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
    world_summary = (
        f"{config.world.terrain.value} terrain, engine "
        f"{config.world.engine.value}, gravity {config.world.gravity}"
    )
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
        endpoint_url=config.llm_connection.endpoint_url,
        api_key=config.llm_connection.api_key,
        temperature=agent.temperature,
    )

    tool_calls = parse_tool_calls(raw)

    design = DesignSpec(name=config.project_name)
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

    # Simulate only if there is at least one dynamic body.
    trace_run_id: str | None = None
    if any(not b.static for b in design.bodies):
        duration = min(
            config.constraints.simulation_duration_seconds, _MAX_SIM_DURATION_SECONDS
        )
        trace_run_id = create_run_from_design(
            design, config.world, duration_seconds=duration
        )

    trace = get_trace(trace_run_id) if trace_run_id is not None else None
    score = score_attempt(trace, design, config.scenario.reward)
    if trace_run_id is not None:
        store_score(trace_run_id, score)

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
    world_summary = (
        f"{config.world.terrain.value} terrain, engine "
        f"{config.world.engine.value}, gravity {config.world.gravity}"
    )
    system_prompt = build_system_prompt(objective, world_summary, enabled_defs)

    design = DesignSpec(name=config.project_name)
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

    # Simulate the SHARED design once (only if it has a dynamic body).
    trace_run_id: str | None = None
    if any(not b.static for b in design.bodies):
        duration = min(
            config.constraints.simulation_duration_seconds, _MAX_SIM_DURATION_SECONDS
        )
        trace_run_id = create_run_from_design(
            design, config.world, duration_seconds=duration
        )

    trace = get_trace(trace_run_id) if trace_run_id is not None else None
    score = score_attempt(trace, design, config.scenario.reward)
    if trace_run_id is not None:
        store_score(trace_run_id, score)

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
