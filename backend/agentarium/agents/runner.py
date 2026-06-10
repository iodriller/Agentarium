from __future__ import annotations

import json
import pathlib
import uuid

import yaml
from pydantic import BaseModel

from agentarium.agents import get_provider
from agentarium.agents.prompts import (
    build_cooperative_user_prompt,
    build_system_prompt,
    build_user_prompt,
)
from agentarium.core.schemas.design import DesignSpec
from agentarium.core.schemas.score import ScoreCard
from agentarium.core.schemas.setup import AgentConfig, LaunchConfig
from agentarium.core.schemas.toolcall import ToolCallRecord
from agentarium.services.run_service import (
    create_run_from_design,
    get_trace,
    store_score,
)
from agentarium.services.scoring_service import score_attempt
from agentarium.tools.apply import apply_tool_call
from agentarium.tools.registry import get_tool

_RUNS_DIR = pathlib.Path("runs")


class AttemptResult(BaseModel):
    attempt_id: str
    design: DesignSpec
    trace_run_id: str | None
    score: ScoreCard
    tool_calls: list[ToolCallRecord]


def _parse_tool_calls(raw: str) -> list[dict]:
    """Defensively extract the ``tool_calls`` list from a completion string."""
    text = raw.strip()
    if text.startswith("```"):
        # Strip code fences (```json ... ``` or ``` ... ```).
        lines = text.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()

    # Try a direct parse, then fall back to the first {...} object.
    candidates = [text]
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        candidates.append(text[start : end + 1])

    for candidate in candidates:
        try:
            data = json.loads(candidate)
        except (json.JSONDecodeError, ValueError):
            continue
        if isinstance(data, dict):
            calls = data.get("tool_calls", [])
            if isinstance(calls, list):
                return [c for c in calls if isinstance(c, dict)]
        if isinstance(data, list):
            return [c for c in data if isinstance(c, dict)]
    return []


async def run_single_attempt(
    config: LaunchConfig, *, attempt_index: int = 0
) -> AttemptResult:
    """Run one single-agent build attempt end-to-end with the mock/real provider.

    Defaults to ``participants[0]`` so the single-agent path is unchanged.
    """
    participants = config.agents.participants
    if not participants:
        raise ValueError("config.agents.participants is empty")
    return await run_agent_attempt(
        config, participants[0], attempt_index=attempt_index
    )


async def run_agent_attempt(
    config: LaunchConfig, agent: AgentConfig, *, attempt_index: int = 0
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
    user_prompt = build_user_prompt(objective, attempt_index)

    raw = await provider.complete(
        model=agent.model,
        system=system_prompt,
        user=user_prompt,
        endpoint_url=config.llm_connection.endpoint_url,
        api_key=config.llm_connection.api_key,
        temperature=agent.temperature,
    )

    tool_calls = _parse_tool_calls(raw)

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
        )
        records.append(result.record)

    # Simulate only if there is at least one dynamic body.
    trace_run_id: str | None = None
    if any(not b.static for b in design.bodies):
        duration = min(config.constraints.simulation_duration_seconds, 5)
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
    )


# Tool-call arg keys that reference a BODY/JOINT id which belongs to the SAME
# agent's contribution and therefore must be remapped when we namespace ids.
_BODY_ID_ARGS = ("id",)
_BODY_REF_ARGS = ("body_a", "body_b", "body_id")
_JOINT_ID_ARGS = ("id",)  # add_joint's own id
_JOINT_REF_ARGS = ("joint_id",)


def _namespace_args(agent_id: str, tool: str, args: dict) -> dict:
    """Prefix this agent's own body/joint ids with ``{agent_id}_``.

    The mock provider (and any naive agent) returns identical ids for every
    agent (e.g. ``create_body id="b1"``). In cooperative mode both agents write
    into ONE shared design, so without namespacing the second agent's parts
    would be rejected as duplicates and that agent would own nothing. We rewrite
    each agent's own ids and any reference to its own ids so its contribution is
    distinct and self-consistent. References resolve within the agent's own
    calls because every agent namespaces with the same prefix.
    """
    new_args = dict(args)
    for key in (*_BODY_ID_ARGS, *_BODY_REF_ARGS, *_JOINT_REF_ARGS):
        value = new_args.get(key)
        if isinstance(value, str) and not value.startswith(f"{agent_id}_"):
            new_args[key] = f"{agent_id}_{value}"
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

        for call in _parse_tool_calls(raw):
            tool = call.get("tool", "")
            args = _namespace_args(agent.id, tool, call.get("args", {}) or {})
            result = apply_tool_call(
                design,
                agent_id=agent.id,
                tool=tool,
                args=args,
                enabled_tools=enabled_names,
            )
            records.append(result.record)

    # Simulate the SHARED design once (only if it has a dynamic body).
    trace_run_id: str | None = None
    if any(not b.static for b in design.bodies):
        duration = min(config.constraints.simulation_duration_seconds, 5)
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
    )
