from __future__ import annotations

import json

from agentarium.agents.base import (
    AgentProvider,
    ProviderStatus,
    StructuredOutputResult,
)

_SAMPLE_TOOL_CALLS = [
    {"tool": "create_body", "args": {"id": "b1", "shape": "box"}},
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
