from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel


class ToolCallStatus(StrEnum):
    success = "success"
    repaired = "repaired"
    rejected = "rejected"


class ToolCallRecord(BaseModel):
    ts: float  # epoch seconds
    agent_id: str
    tool: str
    args: dict = {}
    status: ToolCallStatus
    error: str | None = None
