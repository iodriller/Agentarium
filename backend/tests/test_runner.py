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
