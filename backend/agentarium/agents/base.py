from __future__ import annotations

from abc import ABC, abstractmethod

from pydantic import BaseModel


class ProviderStatus(BaseModel):
    online: bool
    detail: str = ""
    models: list[str] = []


class StructuredOutputResult(BaseModel):
    ok: bool
    detail: str = ""
    sample: list[dict] = []  # parsed tool calls, if any


class AgentProvider(ABC):
    name: str  # matches LLMProvider value

    @abstractmethod
    async def test_connection(
        self, endpoint_url: str | None, api_key: str | None
    ) -> ProviderStatus: ...

    @abstractmethod
    async def test_structured_output(
        self, model: str, endpoint_url: str | None, api_key: str | None
    ) -> StructuredOutputResult: ...

    @abstractmethod
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
        """Return the raw text completion. Used later by the build loop."""
        ...
