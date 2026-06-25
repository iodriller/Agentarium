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
        return json.dumps({"tool_calls": _SAMPLE_TOOL_CALLS})
