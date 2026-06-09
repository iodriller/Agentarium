"""Tests for the POST /api/setup/validate endpoint (Step 6 — real validation logic)."""

import copy

from fastapi.testclient import TestClient

from agentarium.app import app

client = TestClient(app)

# Minimal valid config using mock provider (no HTTP probe fired)
VALID_CONFIG: dict = {
    "scenario": {"preset": "bridge_builder", "objective": "Test", "reward": "distance_plus_stability"},
    "world": {"template": "island_cliff_small", "terrain": "grassland", "engine": "pymunk2d"},
    "agents": {
        "mode": "single",
        "participants": [{"id": "a1", "name": "Agent A", "provider": "mock", "model": "mock"}],
    },
    "tools": {"enabled": ["create_body", "run_simulation"]},
    "constraints": {},
    "outputs": {},
}


def _post(config: dict) -> dict:
    r = client.post("/api/setup/validate", json=config)
    assert r.status_code == 200
    return r.json()


def test_missing_scenario_preset() -> None:
    config = copy.deepcopy(VALID_CONFIG)
    config["scenario"]["preset"] = ""
    body = _post(config)
    assert body["state"] == "MISSING_REQUIRED"
    assert "scenario.preset" in body["missing"]


def test_missing_world_template() -> None:
    config = copy.deepcopy(VALID_CONFIG)
    config["world"]["template"] = ""
    body = _post(config)
    assert body["state"] == "MISSING_REQUIRED"
    assert "world.template" in body["missing"]


def test_unsupported_engine() -> None:
    config = copy.deepcopy(VALID_CONFIG)
    config["world"]["engine"] = "pybullet3d"
    body = _post(config)
    assert body["state"] == "UNSUPPORTED_ENGINE"


def test_mock_provider_ready() -> None:
    body = _post(copy.deepcopy(VALID_CONFIG))
    assert body["state"] == "READY"
    assert body["missing"] == []
    assert body["estimated_runtime_min"] == [2, 4]


def test_empty_tools_warning() -> None:
    config = copy.deepcopy(VALID_CONFIG)
    config["tools"]["enabled"] = []
    body = _post(config)
    assert body["state"] == "READY"
    assert len(body["warnings"]) > 0
    assert any("No tools enabled" in w for w in body["warnings"])
