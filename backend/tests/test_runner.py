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
