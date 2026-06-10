from __future__ import annotations

import json
import pathlib
import uuid

import yaml
from pydantic import BaseModel

from agentarium.agents import get_provider
from agentarium.agents.prompts import build_system_prompt, build_user_prompt
from agentarium.core.schemas.design import DesignSpec
from agentarium.core.schemas.score import ScoreCard
from agentarium.core.schemas.setup import LaunchConfig
from agentarium.core.schemas.toolcall import ToolCallRecord
from agentarium.services.run_service import create_run_from_design, get_trace
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


def _placeholder_score(design: DesignSpec, trace_run_id: str | None) -> ScoreCard:
    """Compute a trivial ScoreCard.

    # placeholder — replaced in Step 18
    """
    parts_used = len(design.bodies)
    joints = len(design.joints)
    distance = 0.0

    if trace_run_id is not None:
        trace = get_trace(trace_run_id)
        if trace is not None and trace.frames:
            dynamic = [b for b in design.bodies if not b.static]
            if dynamic:
                bid = dynamic[0].id
                first = trace.frames[0].bodies.get(bid)
                last = trace.frames[-1].bodies.get(bid)
                if first is not None and last is not None:
                    distance = abs(last.x - first.x)

    return ScoreCard(
        score_total=distance * 10.0,
        success=parts_used > 0,
        metrics={
            "parts_used": parts_used,
            "joints": joints,
            "distance": distance,
        },
        failure_events=[],
        summary=(
            f"Built {parts_used} part(s) and {joints} joint(s); "
            f"first dynamic body travelled {distance:.2f} units."
        ),
    )


async def run_single_attempt(
    config: LaunchConfig, *, attempt_index: int = 0
) -> AttemptResult:
    """Run one single-agent build attempt end-to-end with the mock/real provider."""
    attempt_id = f"attempt_{uuid.uuid4().hex[:8]}"

    participants = config.agents.participants
    if not participants:
        raise ValueError("config.agents.participants is empty")
    agent = participants[0]

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

    score = _placeholder_score(design, trace_run_id)

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
