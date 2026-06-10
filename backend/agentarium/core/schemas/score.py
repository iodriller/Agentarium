from __future__ import annotations

from pydantic import BaseModel


class ScoreCard(BaseModel):
    score_total: float = 0.0
    success: bool = False
    metrics: dict = {}
    failure_events: list[dict] = []
    summary: str = ""
