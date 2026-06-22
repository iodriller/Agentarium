from __future__ import annotations

import asyncio
import os

import httpx

from agentarium.agents.base import (
    AgentProvider,
    ProviderStatus,
    StructuredOutputResult,
)
from agentarium.agents.parsing import parse_tool_calls

# Connection probes are health checks — keep them short. Generation calls can take
# much longer and are configurable via env so real/local deployments can tune them.
_PROBE_TIMEOUT = 5.0


def _gen_timeout() -> float:
    try:
        return float(os.environ.get("AGENTARIUM_LLM_TIMEOUT_S", "120"))
    except ValueError:
        return 120.0


def _max_retries() -> int:
    try:
        return max(0, int(os.environ.get("AGENTARIUM_LLM_RETRIES", "2")))
    except ValueError:
        return 2


def _backoff_base() -> float:
    try:
        return max(0.0, float(os.environ.get("AGENTARIUM_LLM_BACKOFF_S", "0.5")))
    except ValueError:
        return 0.5


_STRUCTURED_PROMPT = (
    "Respond ONLY with a JSON object of the form "
    '{"tool_calls": [{"tool": "create_body", "args": {}}]}. '
    "Include exactly two tool calls. Do not add explanation."
)


class LLMError(RuntimeError):
    """A generation failure with a machine-readable ``kind`` for clear messaging.

    kinds: ``auth`` (401/403), ``rate_limit`` (429), ``server`` (5xx),
    ``timeout``, ``connection``, ``bad_request`` (other 4xx), ``malformed``
    (unparseable/unexpected response), ``empty`` (no content), ``config``.
    """

    def __init__(self, kind: str, message: str) -> None:
        super().__init__(message)
        self.kind = kind


def _headers(api_key: str | None) -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    return headers


def _classify_status(status: int) -> tuple[str, bool]:
    """Map an HTTP status to (error_kind, is_retryable)."""
    if status in (401, 403):
        return "auth", False
    if status == 429:
        return "rate_limit", True
    if status >= 500:
        return "server", True
    return "bad_request", False


class OpenAICompatibleProvider(AgentProvider):
    name = "openai_compatible"
    default_endpoint: str | None = None

    def __init__(self, transport: httpx.AsyncBaseTransport | None = None) -> None:
        # An injectable transport lets the provider-contract tests drive the
        # client with httpx.MockTransport (no real network / server needed).
        self._transport = transport

    def _client(self, timeout: float) -> httpx.AsyncClient:
        return httpx.AsyncClient(timeout=timeout, transport=self._transport)

    def _resolve_endpoint(self, endpoint_url: str | None) -> str | None:
        return endpoint_url or self.default_endpoint

    async def test_connection(
        self, endpoint_url: str | None, api_key: str | None
    ) -> ProviderStatus:
        endpoint = self._resolve_endpoint(endpoint_url)
        if not endpoint:
            return ProviderStatus(online=False, detail="No endpoint_url provided")
        try:
            async with self._client(_PROBE_TIMEOUT) as client:
                response = await client.get(
                    f"{endpoint.rstrip('/')}/models", headers=_headers(api_key)
                )
        except Exception as exc:  # noqa: BLE001 - report any failure as offline
            return ProviderStatus(online=False, detail=str(exc))

        if response.status_code != 200:
            kind, _ = _classify_status(response.status_code)
            detail = (
                "API key rejected"
                if kind == "auth"
                else f"HTTP {response.status_code} from {endpoint}/models"
            )
            return ProviderStatus(online=False, detail=detail)

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
                {"role": "system", "content": "You output only JSON tool calls."},
                {"role": "user", "content": _STRUCTURED_PROMPT},
            ],
            "temperature": 0.0,
        }
        try:
            async with self._client(_PROBE_TIMEOUT) as client:
                response = await client.post(
                    f"{endpoint.rstrip('/')}/chat/completions",
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

        sample = parse_tool_calls(content or "")
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
            raise LLMError("config", "No endpoint_url provided")

        url = f"{endpoint.rstrip('/')}/chat/completions"
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": temperature,
        }

        timeout = _gen_timeout()
        retries = _max_retries()
        backoff = _backoff_base()
        last_error: LLMError | None = None

        for attempt in range(retries + 1):
            try:
                async with self._client(timeout) as client:
                    response = await client.post(
                        url, headers=_headers(api_key), json=payload
                    )
            except httpx.TimeoutException:
                last_error = LLMError(
                    "timeout", f"LLM generation timed out after {timeout}s"
                )
                exc_retryable = True
            except httpx.HTTPError as exc:  # connect/transport errors
                last_error = LLMError("connection", f"LLM request failed: {exc}")
                exc_retryable = True
            else:
                if response.status_code == 200:
                    return self._extract_content(response)
                kind, retryable = _classify_status(response.status_code)
                detail = {
                    "auth": "LLM endpoint rejected the API key (HTTP "
                    f"{response.status_code})",
                    "rate_limit": "LLM endpoint rate-limited the request (HTTP 429)",
                    "server": f"LLM endpoint server error (HTTP {response.status_code})",
                    "bad_request": f"LLM endpoint error (HTTP {response.status_code})",
                }[kind]
                last_error = LLMError(kind, detail)
                if not retryable:
                    raise last_error
                exc_retryable = True

            # Retry transient failures with exponential backoff.
            if attempt < retries and exc_retryable:
                await asyncio.sleep(backoff * (2**attempt))
                continue
            break

        assert last_error is not None
        raise last_error

    @staticmethod
    def _extract_content(response: httpx.Response) -> str:
        try:
            data = response.json()
        except Exception as exc:  # noqa: BLE001
            raise LLMError("malformed", f"LLM returned non-JSON response: {exc}") from exc
        try:
            content = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise LLMError(
                "malformed", f"Unexpected LLM response shape: {exc}"
            ) from exc
        if content is None or str(content).strip() == "":
            raise LLMError("empty", "LLM returned an empty completion")
        return str(content)
