from __future__ import annotations

import json

from agentarium.agents.base import (
    AgentProvider,
    ProviderStatus,
    StructuredOutputResult,
)


def _body(bid: str, shape: str, pos: list[float], kind: str, **extra: object) -> dict:
    return {
        "tool": "create_body",
        "args": {"id": bid, "shape": shape, "position": pos, "kind": kind, **extra},
    }


# A small, deterministic "scene" with semantic kinds so a no-network (mock) run
# visibly demonstrates the procedural renderer: a little row of houses, a tower,
# a tree and a crate rather than identical boxes. Uses only create_body +
# run_simulation, which are broadly enabled across challenges.
_SAMPLE_TOOL_CALLS = [
    _body("house_1", "box", [-5.0, 1.5], "house", width=2.6, height=2.6, static=True),
    _body("house_2", "box", [-2.0, 1.5], "house", width=2.6, height=2.6, static=True),
    _body("tower_1", "box", [1.0, 3.0], "tower", width=2.0, height=6.0, static=True),
    _body("tree_1", "circle", [3.5, 1.0], "tree", radius=1.0, static=True),
    _body("crate_1", "box", [0.0, 7.0], "crate", width=1.0, height=1.0),
    {"tool": "run_simulation", "args": {}},
]

# A small but varied city scene (roads, a park, trees, buildings of different
# heights/kinds) so the no-LLM demo actually looks like a city, not one box.
# Used only when the objective is recognizably a city challenge (see complete()).
_CITY_TOOL_CALLS = [
    {"tool": "create_body", "args": {
        "id": "road1", "shape": "box", "kind": "road",
        "position": [0.0, 0.15], "width": 20.0, "height": 0.3, "static": True,
    }},
    {"tool": "create_body", "args": {
        "id": "park1", "shape": "box", "kind": "park",
        "position": [-9.0, 0.1], "width": 3.0, "height": 0.2, "static": True,
    }},
    {"tool": "create_body", "args": {
        "id": "house1", "shape": "box", "kind": "house",
        "position": [-6.0, 1.5], "width": 2.0, "height": 3.0, "static": True,
    }},
    {"tool": "create_body", "args": {
        "id": "tower1", "shape": "box", "kind": "tower",
        "position": [-2.5, 4.0], "width": 2.5, "height": 8.0, "static": True,
    }},
    {"tool": "create_body", "args": {
        "id": "shop1", "shape": "box", "kind": "shop",
        "position": [1.0, 2.0], "width": 2.0, "height": 4.0, "static": True,
    }},
    {"tool": "create_body", "args": {
        "id": "house2", "shape": "box", "kind": "house",
        "position": [4.0, 1.5], "width": 2.0, "height": 3.0, "static": True,
    }},
    {"tool": "create_body", "args": {
        "id": "tower2", "shape": "box", "kind": "tower",
        "position": [7.5, 3.0], "width": 2.0, "height": 6.0, "static": True,
    }},
    {"tool": "create_body", "args": {
        "id": "tree1", "shape": "box", "kind": "tree",
        "position": [-4.0, 0.9], "width": 1.0, "height": 1.8, "static": True,
    }},
    {"tool": "create_body", "args": {
        "id": "tree2", "shape": "box", "kind": "tree",
        "position": [9.5, 0.9], "width": 1.0, "height": 1.8, "static": True,
    }},
    {"tool": "run_simulation", "args": {}},
]


class MockProvider(AgentProvider):
    name = "mock"

    async def test_connection(
        self, endpoint_url: str | None, api_key: str | None
    ) -> ProviderStatus:
        return ProviderStatus(
            online=True,
            detail="Mock provider always available",
            models=["mock"],
        )

    async def test_structured_output(
        self, model: str, endpoint_url: str | None, api_key: str | None
    ) -> StructuredOutputResult:
        return StructuredOutputResult(
            ok=True,
            detail="Mock provider emits deterministic tool calls",
            sample=[dict(call) for call in _SAMPLE_TOOL_CALLS],
        )

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
        # The objective (embedded in ``system`` by build_system_prompt) names the
        # challenge; recognize a city objective so the no-LLM demo shows a real
        # scene instead of one box, without touching mock's behavior elsewhere.
        calls = _CITY_TOOL_CALLS if "city" in system.lower() else _SAMPLE_TOOL_CALLS
        return json.dumps({"tool_calls": calls})
