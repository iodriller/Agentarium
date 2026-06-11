from fastapi import APIRouter, HTTPException

from agentarium.core.schemas.setup import LaunchConfig, LaunchState, ValidationResult
from agentarium.services.orchestrator import run_manager
from agentarium.setup.validators import validate_launch_config

router = APIRouter(prefix="/api/setup", tags=["setup"])


@router.post("/validate", response_model=ValidationResult)
async def validate_setup(config: LaunchConfig) -> ValidationResult:
    return await validate_launch_config(config)


@router.post("/launch")
async def launch(config: LaunchConfig) -> dict:
    # Re-validate server-side so an invalid config (e.g. a 'manual' provider, a
    # missing required field, or an offline endpoint) can't be launched by
    # bypassing the UI — it would otherwise surface only as a mid-run error.
    result = await validate_launch_config(config)
    if result.state != LaunchState.ready:
        raise HTTPException(
            status_code=422,
            detail={
                "state": result.state.value,
                "missing": result.missing,
                "warnings": result.warnings,
            },
        )
    run_id = await run_manager.create_run(config)
    return {"run_id": run_id}
