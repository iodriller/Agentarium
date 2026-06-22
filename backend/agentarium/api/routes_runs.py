from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from agentarium.core.schemas.design import DesignSpec
from agentarium.core.schemas.score import ScoreCard
from agentarium.core.schemas.setup import WorldConfig
from agentarium.core.schemas.trace import EpisodeTrace
from agentarium.services.run_service import (
    create_run_from_design,
    get_score,
    get_trace,
    hardcoded_demo_design,
    leaderboard,
    list_runs,
)

router = APIRouter(prefix="/api/runs", tags=["runs"])


class RunSummary(BaseModel):
    run_id: str
    created_at: int | None = None
    project_name: str | None = None
    challenge: str | None = None
    mode: str | None = None
    reward: str | None = None
    score_total: float | None = None
    success: bool | None = None
    artifact_dir: str | None = None


class CreateRunRequest(BaseModel):
    design: DesignSpec | None = None
    world: WorldConfig | None = None
    duration_seconds: float = 5.0


class CreateRunResponse(BaseModel):
    run_id: str


def _default_world() -> WorldConfig:
    return WorldConfig(template="flat_ground")


@router.post("", response_model=CreateRunResponse)
async def create_run(request: CreateRunRequest | None = None) -> CreateRunResponse:
    req = request or CreateRunRequest()
    design = req.design or hardcoded_demo_design()
    world = req.world or _default_world()
    run_id = create_run_from_design(design, world, req.duration_seconds)
    return CreateRunResponse(run_id=run_id)


def _to_summary(row: dict) -> RunSummary:
    s = row.get("success")
    return RunSummary(**{**row, "success": None if s is None else bool(s)})


@router.get("/history", response_model=list[RunSummary])
async def run_history(limit: int = 50) -> list[RunSummary]:
    """Recent runs (newest first), persisted across restarts."""
    return [_to_summary(r) for r in list_runs(limit)]


@router.get("/leaderboard", response_model=list[RunSummary])
async def run_leaderboard(challenge: str | None = None, limit: int = 10) -> list[RunSummary]:
    """Top runs by score, optionally filtered to one challenge."""
    return [_to_summary(r) for r in leaderboard(challenge, limit)]


@router.get("/{run_id}/trace", response_model=EpisodeTrace)
async def get_run_trace(run_id: str) -> EpisodeTrace:
    trace = get_trace(run_id)
    if trace is None:
        raise HTTPException(status_code=404, detail=f"Run not found: {run_id}")
    return trace


@router.get("/{run_id}/score", response_model=ScoreCard)
async def get_run_score(run_id: str) -> ScoreCard:
    score = get_score(run_id)
    if score is None:
        raise HTTPException(status_code=404, detail=f"Score not found: {run_id}")
    return score
