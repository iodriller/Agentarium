import asyncio
import pathlib

from agentarium.agents.base import AgentProvider, ProviderStatus, StructuredOutputResult
from agentarium.agents.runner import AttemptResult, run_single_attempt
from agentarium.core.schemas.design import DesignSpec
from agentarium.core.schemas.score import ScoreCard
from agentarium.core.schemas.setup import (
    AgentConfig,
    AgentsConfig,
    LaunchConfig,
    LLMProvider,
    ScenarioConfig,
    ToolsConfig,
    WorldConfig,
)


def _config() -> LaunchConfig:
    return LaunchConfig(
        scenario=ScenarioConfig(preset="distance", objective="Travel far"),
        world=WorldConfig(template="flat_ground"),
        agents=AgentsConfig(
            participants=[
                AgentConfig(id="a", name="Builder", provider=LLMProvider.mock),
            ]
        ),
        # Mock provider emits create_body + run_simulation; enable both.
        tools=ToolsConfig(enabled=["create_body", "run_simulation"]),
    )


def test_mock_attempt_completes():
    result = asyncio.run(run_single_attempt(_config()))

    assert isinstance(result, AttemptResult)
    assert isinstance(result.design, DesignSpec)
    assert isinstance(result.score, ScoreCard)
    assert len(result.tool_calls) > 0
    # The mock create_body should have produced at least one body.
    assert len(result.design.bodies) >= 1


def _bridge_config() -> LaunchConfig:
    return LaunchConfig(
        scenario=ScenarioConfig(preset="bridge_builder"),
        world=WorldConfig(template="island_cliff_small"),
        agents=AgentsConfig(
            participants=[
                AgentConfig(id="a", name="Builder", provider=LLMProvider.mock),
            ]
        ),
        tools=ToolsConfig(enabled=["create_body", "add_beam", "add_joint", "run_simulation"]),
    )


def test_challenge_scaffold_and_world_geometry_are_seeded_and_simulate():
    # The world template seeds its terrain (cliffs) and the challenge seeds its
    # task objects (crate + goal marker), all tagged created_by="world". The
    # dynamic crate guarantees a replayable trace even before the agent acts.
    result = asyncio.run(run_single_attempt(_bridge_config()))

    ids = {b.id for b in result.design.bodies}
    assert {"crate", "goal_marker"} <= ids  # challenge scaffold
    assert {"left_slope", "right_cliff"} <= ids  # world terrain
    crate = next(b for b in result.design.bodies if b.id == "crate")
    assert crate.created_by == "world"
    assert crate.static is False
    # The left slope terrain is a genuinely angled segment (lets the crate roll).
    left_slope = next(b for b in result.design.bodies if b.id == "left_slope")
    assert left_slope.static is True and left_slope.created_by == "world"
    assert left_slope.angle != 0.0
    # A dynamic scaffold body means the attempt produced a replayable trace.
    assert result.trace_run_id is not None
    # Seeded world parts must not count as agent effort — only the mock's own
    # create_body bodies count, not the seeded crate/marker/cliff bodies.
    mock_bodies = sum(1 for b in result.design.bodies if b.created_by != "world")
    assert result.score.metrics["parts_used"] == float(mock_bodies)


def _city_config() -> LaunchConfig:
    return LaunchConfig(
        scenario=ScenarioConfig(preset="tiny_city_preview"),
        world=WorldConfig(template="tiny_city_block"),
        agents=AgentsConfig(
            participants=[
                AgentConfig(id="a", name="Builder", provider=LLMProvider.mock),
            ]
        ),
        tools=ToolsConfig(enabled=["create_body", "run_simulation"]),
    )


def test_city_challenge_mock_scene_has_varied_kinds():
    # The mock provider recognizes a city objective and emits a real scene
    # (road/park/trees/varied buildings), not a single generic box — this is
    # what the no-LLM demo shows by default.
    result = asyncio.run(run_single_attempt(_city_config()))
    agent_bodies = [b for b in result.design.bodies if b.created_by == "a"]
    kinds = {b.kind for b in agent_bodies if b.kind}
    assert {"road", "park", "house", "tower", "shop", "tree"} <= kinds
    # A city challenge is a static scene — the mock's own bodies are all static.
    assert all(b.static for b in agent_bodies)


def test_city_prompt_does_not_require_movable_body():
    # Tiny City's objective is a mostly-static scene; forcing a "must include a
    # movable body" rule would contradict the objective and confuse real LLMs.
    from agentarium.agents.prompts import build_system_prompt
    from agentarium.tools.registry import get_tool

    tools = [get_tool("create_body")]
    default_prompt = build_system_prompt("Build a city", "world", tools)
    city_prompt = build_system_prompt(
        "Build a city", "world", tools, movable_body_required=False
    )
    assert "MUST include at least one MOVABLE" in default_prompt
    assert "MUST include at least one MOVABLE" not in city_prompt
    assert "mostly-static scene" in city_prompt


def _crawl_config() -> LaunchConfig:
    return LaunchConfig(
        scenario=ScenarioConfig(preset="crawl_challenge"),
        world=WorldConfig(template="hill_path"),
        agents=AgentsConfig(
            participants=[
                AgentConfig(id="a", name="Builder", provider=LLMProvider.mock),
            ]
        ),
        tools=ToolsConfig(enabled=["create_body", "add_joint", "add_motor", "run_simulation"]),
    )


def _sorter_config() -> LaunchConfig:
    return LaunchConfig(
        scenario=ScenarioConfig(preset="sorter"),
        world=WorldConfig(template="sorting_table"),
        agents=AgentsConfig(
            participants=[
                AgentConfig(id="a", name="Builder", provider=LLMProvider.mock),
            ]
        ),
        tools=ToolsConfig(enabled=["create_body", "add_ramp", "add_bin", "run_simulation"]),
    )


def test_bridge_mock_builds_bridge_parts_not_generic_scene():
    result = asyncio.run(run_single_attempt(_bridge_config()))
    agent_bodies = [b for b in result.design.bodies if b.created_by == "a"]
    ids = {b.id for b in agent_bodies}
    assert {"bridge_left", "bridge_span", "bridge_right"} <= ids
    assert all(b.kind == "beam" for b in agent_bodies)
    assert all(call.status.value == "success" for call in result.tool_calls)


def test_crawl_mock_builds_driven_creature_parts():
    result = asyncio.run(run_single_attempt(_crawl_config()))
    ids = {b.id for b in result.design.bodies}
    joint_ids = {j.id for j in result.design.joints}
    assert {"torso", "front_leg", "rear_leg"} <= ids
    assert {"front_hip", "rear_hip"} <= joint_ids
    assert any(j.motor_rate is not None for j in result.design.joints)
    assert all(call.status.value == "success" for call in result.tool_calls)


def test_sorter_mock_places_matching_bins_and_ramps():
    result = asyncio.run(run_single_attempt(_sorter_config()))
    bins = result.design.metadata.get("bins", [])
    accepts = {b.get("accepts") for b in bins}
    body_kinds = {b.kind for b in result.design.bodies if b.created_by == "a"}
    assert accepts == {"red", "blue"}
    assert {"bin", "ramp"} <= body_kinds
    assert all(call.status.value == "success" for call in result.tool_calls)


def test_attempt_result_carries_per_step_design_snapshots():
    # Each tool call should produce one un-simulated EpisodeTrace-shaped
    # snapshot, in step order, so the Studio can replay the CONSTRUCTION
    # sequence (Build Timeline) — not just the final physics trace.
    result = asyncio.run(run_single_attempt(_city_config()))
    assert len(result.build_steps) == len(result.tool_calls)
    assert len(result.snapshots) == len(result.tool_calls)
    assert result.build_steps[0].label.startswith("create_body - added")
    assert result.build_steps[-1].trace_run_id == result.trace_run_id
    # The last snapshot's dynamic/static prop set reflects the fully-built city
    # (create_body-only city scene is all static, so it shows up in world_static).
    last_snapshot = result.snapshots[-1]
    assert last_snapshot["frames"] == [{"t": 0.0, "bodies": {}, "events": []}]
    static_ids = {p["id"] for p in last_snapshot["world_static"]}
    assert {"road1", "house1", "tower1"} <= static_ids
    # An early snapshot (after the first tool call) has fewer static props than
    # the last one — the timeline actually progresses step by step.
    assert len(result.snapshots[0]["world_static"]) < len(last_snapshot["world_static"])

    assert result.trace_run_id is not None
    path = pathlib.Path("runs") / result.trace_run_id / "build_snapshots.json"
    assert path.exists()


class _DuplicateProvider(AgentProvider):
    name = "duplicate"

    async def test_connection(
        self, endpoint_url: str | None, api_key: str | None
    ) -> ProviderStatus:
        return ProviderStatus(online=True)

    async def test_structured_output(
        self, model: str, endpoint_url: str | None, api_key: str | None
    ) -> StructuredOutputResult:
        return StructuredOutputResult(ok=True)

    async def complete(
        self,
        *,
        model: str,
        system: str,
        user: str,
        endpoint_url: str | None,
        api_key: str | None,
        temperature: float = 0.7,
    ) -> str:
        return (
            '{"tool_calls": ['
            '{"tool": "create_body", "args": {"id": "dup", "shape": "box", "position": [0, 3]}},'
            '{"tool": "create_body", "args": {"id": "dup", "shape": "box", "position": [2, 3]}}'
            "]}"
        )


def test_repair_pass_preserves_rejected_call_and_adds_timeline_step(monkeypatch):
    import agentarium.agents.runner as runner

    monkeypatch.setattr(runner, "get_provider", lambda _name: _DuplicateProvider())
    result = asyncio.run(run_single_attempt(_config()))

    statuses = [call.status.value for call in result.tool_calls]
    assert statuses == ["success", "rejected", "repaired"]
    assert result.tool_calls[1].tool == "create_body"
    assert result.tool_calls[1].error and "already exists" in result.tool_calls[1].error
    assert result.tool_calls[2].tool == "repair_pass"
    assert result.build_steps[-1].tool == "repair_pass"
    assert result.build_steps[-1].label == "Auto-repair"
    assert "dup_r" in result.build_steps[-1].new_body_ids
    assert "dup_r" in {b.id for b in result.design.bodies}


def test_challenge_kinds_do_not_leak_across_scenarios():
    # Guardrail against a regression where every scenario starts looking like
    # the same generic (or worst, all-city) scene: each challenge's mock-built
    # kinds must be disjoint from the OTHER challenges' distinctive kinds.
    def agent_kinds(result: AttemptResult) -> set[str]:
        return {b.kind for b in result.design.bodies if b.created_by == "a" and b.kind}

    bridge_kinds = agent_kinds(asyncio.run(run_single_attempt(_bridge_config())))
    crawl_kinds = agent_kinds(asyncio.run(run_single_attempt(_crawl_config())))
    sorter_kinds = agent_kinds(asyncio.run(run_single_attempt(_sorter_config())))
    city_kinds = agent_kinds(asyncio.run(run_single_attempt(_city_config())))

    assert bridge_kinds == {"beam"}
    assert crawl_kinds == {"leg"}
    assert sorter_kinds == {"bin", "ramp"}
    assert city_kinds == {"road", "park", "house", "tower", "shop", "tree"}

    # No overlap at all between any two scenarios' kind sets.
    all_sets = [bridge_kinds, crawl_kinds, sorter_kinds, city_kinds]
    for i, a in enumerate(all_sets):
        for b in all_sets[i + 1 :]:
            assert not (a & b), f"kind overlap between scenarios: {a & b}"
