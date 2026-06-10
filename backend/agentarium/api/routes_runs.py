from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from agentarium.core.schemas.design import DesignSpec
from agentarium.core.schemas.setup import WorldConfig
from agentarium.core.schemas.trace import EpisodeTrace
from agentarium.services.run_service import (
    create_run_from_design,
    get_trace,
    hardcoded_demo_design,
)

router = APIRouter(prefix="/api/runs", tags=["runs"])


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


@router.get("/{run_id}/trace", response_model=EpisodeTrace)
async def get_run_trace(run_id: str) -> EpisodeTrace:
    trace = get_trace(run_id)
    if trace is None:
        raise HTTPException(status_code=404, detail=f"Run not found: {run_id}")
    return trace
