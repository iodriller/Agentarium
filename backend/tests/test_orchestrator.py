import asyncio

from fastapi.testclient import TestClient

from agentarium.app import app
from agentarium.core.schemas.setup import (
    AgentConfig,
    AgentsConfig,
    ConstraintsConfig,
    LaunchConfig,
    LLMProvider,
    ScenarioConfig,
    ToolsConfig,
    WorldConfig,
)
from agentarium.services import orchestrator
from agentarium.services.orchestrator import RunManager

# Keep streaming instant in tests.
orchestrator.STREAM_DELAY = 0.0


def _config() -> LaunchConfig:
    return LaunchConfig(
        scenario=ScenarioConfig(preset="distance", objective="Travel far"),
        world=WorldConfig(template="flat_ground"),
        agents=AgentsConfig(
            participants=[
                AgentConfig(id="a", name="Builder", provider=LLMProvider.mock),
            ]
        ),
        tools=ToolsConfig(enabled=["create_body", "run_simulation"]),
        constraints=ConstraintsConfig(max_attempts=2),
    )


async def _run_to_completion(manager: RunManager, config: LaunchConfig) -> str:
    run_id = await manager.create_run(config)
    # Poll until a run_finished event appears, with a timeout.
    for _ in range(500):
        events = manager.get_events(run_id)
        if events and events[-1].get("type") == "run_finished":
            return run_id
        await asyncio.sleep(0.01)
    raise AssertionError("run did not finish within timeout")


def test_launch_creates_run():
    async def scenario() -> None:
        manager = RunManager()
        run_id = await _run_to_completion(manager, _config())
        types = [e["type"] for e in manager.get_events(run_id)]
        assert "run_started" in types
        assert "attempt_started" in types
        assert types.count("tool_call") >= 1
        assert "score" in types
        assert "run_finished" in types

    asyncio.run(scenario())


def test_events_buffered():
    async def scenario() -> None:
        manager = RunManager()
        run_id = await _run_to_completion(manager, _config())
        events = manager.get_events(run_id)
        assert events[0]["type"] == "run_started"
        assert events[-1]["type"] == "run_finished"

    asyncio.run(scenario())


def test_subscribe_yields_full_history():
    async def scenario() -> None:
        manager = RunManager()
        run_id = await _run_to_completion(manager, _config())
        # Late subscriber should still receive the full buffered history.
        received = [event async for event in manager.subscribe(run_id)]
        assert received[0]["type"] == "run_started"
        assert received[-1]["type"] == "run_finished"

    asyncio.run(scenario())


def test_subscribe_unknown_run():
    async def scenario() -> None:
        manager = RunManager()
        received = [event async for event in manager.subscribe("does-not-exist")]
        assert received == [{"type": "error", "detail": "unknown run"}]

    asyncio.run(scenario())


def test_ws_streams_events():
    orchestrator.STREAM_DELAY = 0.0
    client = TestClient(app)
    resp = client.post("/api/setup/launch", json=_config().model_dump(mode="json"))
    assert resp.status_code == 200
    run_id = resp.json()["run_id"]

    with client.websocket_connect(f"/ws/runs/{run_id}") as ws:
        types: list[str] = []
        for _ in range(200):
            event = ws.receive_json()
            types.append(event["type"])
            if event["type"] == "run_finished":
                break
        assert "run_started" in types
        assert "run_finished" in types
