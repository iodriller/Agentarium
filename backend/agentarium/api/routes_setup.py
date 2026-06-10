from fastapi import APIRouter

from agentarium.core.schemas.setup import LaunchConfig, ValidationResult
from agentarium.services.orchestrator import run_manager
from agentarium.setup.validators import validate_launch_config

router = APIRouter(prefix="/api/setup", tags=["setup"])


@router.post("/validate", response_model=ValidationResult)
async def validate_setup(config: LaunchConfig) -> ValidationResult:
    return await validate_launch_config(config)


@router.post("/launch")
async def launch(config: LaunchConfig) -> dict:
    run_id = await run_manager.create_run(config)
    return {"run_id": run_id}
