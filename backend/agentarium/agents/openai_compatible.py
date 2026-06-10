from __future__ import annotations

import json
import re

import httpx

from agentarium.agents.base import (
    AgentProvider,
    ProviderStatus,
    StructuredOutputResult,
)

_TIMEOUT = 3.0

_STRUCTURED_PROMPT = (
    "Respond ONLY with a JSON object of the form "
    '{"tool_calls": [{"tool": "create_body", "args": {}}]}. '
    "Include exactly two tool calls. Do not add explanation."
)


def _headers(api_key: str | None) -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    return headers


def _parse_tool_calls(text: str) -> list[dict]:
    """Best-effort extraction of a tool-call list from a model response."""
    if not text:
        return []
    candidates: list[str] = [text]
    # Strip code fences if present.
    fenced = re.findall(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    candidates.extend(fenced)
    # First {...} block.
    brace = re.search(r"\{.*\}", text, re.DOTALL)
    if brace:
        candidates.append(brace.group(0))

    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except (json.JSONDecodeError, ValueError):
            continue
        if isinstance(parsed, dict) and isinstance(parsed.get("tool_calls"), list):
            return [c for c in parsed["tool_calls"] if isinstance(c, dict)]
        if isinstance(parsed, list):
            return [c for c in parsed if isinstance(c, dict)]
    return []


class OpenAICompatibleProvider(AgentProvider):
    name = "openai_compatible"
    default_endpoint: str | None = None

    def _resolve_endpoint(self, endpoint_url: str | None) -> str | None:
        return endpoint_url or self.default_endpoint

    async def test_connection(
        self, endpoint_url: str | None, api_key: str | None
    ) -> ProviderStatus:
        endpoint = self._resolve_endpoint(endpoint_url)
        if not endpoint:
            return ProviderStatus(online=False, detail="No endpoint_url provided")
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                response = await client.get(
                    f"{endpoint}/models", headers=_headers(api_key)
                )
        except Exception as exc:  # noqa: BLE001 - report any failure as offline
            return ProviderStatus(online=False, detail=str(exc))

        if response.status_code != 200:
            return ProviderStatus(
                online=False,
                detail=f"HTTP {response.status_code} from {endpoint}/models",
            )

        models: list[str] = []
        try:
            data = response.json()
            entries = data.get("data") if isinstance(data, dict) else None
            if isinstance(entries, list):
                models = [
                    str(item["id"])
                    for item in entries
                    if isinstance(item, dict) and "id" in item
                ]
        except Exception:  # noqa: BLE001 - models list is best-effort
            models = []

        return ProviderStatus(online=True, detail="Reachable", models=models)

    async def test_structured_output(
        self, model: str, endpoint_url: str | None, api_key: str | None
    ) -> StructuredOutputResult:
        endpoint = self._resolve_endpoint(endpoint_url)
        if not endpoint:
            return StructuredOutputResult(ok=False, detail="No endpoint_url provided")

        payload = {
            "model": model,
            "messages": [
                {
                    "role": "system",
                    "content": "You output only JSON tool calls.",
                },
                {"role": "user", "content": _STRUCTURED_PROMPT},
            ],
            "temperature": 0.0,
        }
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                response = await client.post(
                    f"{endpoint}/chat/completions",
                    headers=_headers(api_key),
                    json=payload,
                )
        except Exception as exc:  # noqa: BLE001
            return StructuredOutputResult(ok=False, detail=str(exc))

        if response.status_code != 200:
            return StructuredOutputResult(
                ok=False,
                detail=f"HTTP {response.status_code} from {endpoint}/chat/completions",
            )

        try:
            data = response.json()
            content = data["choices"][0]["message"]["content"]
        except Exception as exc:  # noqa: BLE001
            return StructuredOutputResult(
                ok=False, detail=f"Unexpected response shape: {exc}"
            )

        sample = _parse_tool_calls(content or "")
        if not sample:
            return StructuredOutputResult(
                ok=False, detail="Response did not contain parseable tool calls"
            )
        return StructuredOutputResult(
            ok=True, detail="Parsed tool calls from response", sample=sample
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
        endpoint = self._resolve_endpoint(endpoint_url)
        if not endpoint:
            raise ValueError("No endpoint_url provided")

        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": temperature,
        }
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.post(
                f"{endpoint}/chat/completions",
                headers=_headers(api_key),
                json=payload,
            )
        response.raise_for_status()
        data = response.json()
        return str(data["choices"][0]["message"]["content"])
