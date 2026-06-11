from __future__ import annotations

import json
import re

__all__ = ["parse_tool_calls"]


def parse_tool_calls(raw: str) -> list[dict]:
    """Defensively extract a ``tool_calls`` list from a model completion string.

    Agents return JSON of the form ``{"tool_calls": [{"tool": ..., "args": ...}]}``
    but real models wrap it in prose or code fences. This tries, in order:

    1. a direct parse of the whole string,
    2. each ```` ```json ... ``` ```` fenced block,
    3. the first ``{...}`` object found in the text.

    Returns the list of dict tool calls, or ``[]`` if none could be parsed.
    Shared by the local runner and the OpenAI-compatible provider so both parse
    identically.
    """
    if not raw:
        return []
    text = raw.strip()

    candidates: list[str] = [text]
    # Fenced code blocks (```json ... ``` or ``` ... ```).
    candidates.extend(re.findall(r"```(?:json)?\s*(.*?)```", text, re.DOTALL))
    # First {...} object in the text.
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        candidates.append(text[start : end + 1])

    for candidate in candidates:
        try:
            data = json.loads(candidate)
        except (json.JSONDecodeError, ValueError):
            continue
        if isinstance(data, dict):
            calls = data.get("tool_calls")
            if isinstance(calls, list):
                return [c for c in calls if isinstance(c, dict)]
        if isinstance(data, list):
            return [c for c in data if isinstance(c, dict)]
    return []
