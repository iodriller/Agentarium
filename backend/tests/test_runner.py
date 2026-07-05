import asyncio

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
        tools=ToolsConfig(enabled=["create_body", "run_simulation"]),
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
