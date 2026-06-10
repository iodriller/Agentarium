from __future__ import annotations

from agentarium.agents.base import (
    AgentProvider,
    ProviderStatus,
    StructuredOutputResult,
)
from agentarium.agents.localdeploy import LocalDeployProvider
from agentarium.agents.manual_provider import ManualProvider
from agentarium.agents.mock_provider import MockProvider
from agentarium.agents.openai_compatible import OpenAICompatibleProvider

_PROVIDERS: dict[str, AgentProvider] = {
    "mock": MockProvider(),
    "localdeploy": LocalDeployProvider(),
    "openai_compatible": OpenAICompatibleProvider(),
    "manual": ManualProvider(),
}

_PROVIDER_META: list[dict] = [
    {
        "id": "mock",
        "name": "Mock / Random",
        "requires_endpoint": False,
        "requires_api_key": False,
        "description": "Deterministic baseline, no network. Great for testing.",
    },
    {
        "id": "localdeploy",
        "name": "LocalDeploy",
        "requires_endpoint": True,
        "requires_api_key": False,
        "description": "OpenAI-compatible local server (LM Studio, llama.cpp, etc.)",
    },
    {
        "id": "openai_compatible",
        "name": "OpenAI-Compatible",
        "requires_endpoint": True,
        "requires_api_key": True,
        "description": "Any hosted OpenAI-compatible API.",
    },
    {
        "id": "manual",
        "name": "Manual Builder",
        "requires_endpoint": False,
        "requires_api_key": False,
        "description": "You build the design by hand using the same tools.",
    },
]


def get_provider(provider: str) -> AgentProvider | None:
    return _PROVIDERS.get(provider)


def list_providers() -> list[dict]:
    return [dict(meta) for meta in _PROVIDER_META]


__all__ = [
    "AgentProvider",
    "ProviderStatus",
    "StructuredOutputResult",
    "get_provider",
    "list_providers",
]
