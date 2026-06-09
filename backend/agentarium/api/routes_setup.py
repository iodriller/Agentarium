from fastapi import APIRouter

from agentarium.core.schemas.setup import LaunchConfig, ValidationResult
from agentarium.setup.validators import validate_launch_config

router = APIRouter(prefix="/api/setup", tags=["setup"])


@router.post("/validate", response_model=ValidationResult)
async def validate_setup(config: LaunchConfig) -> ValidationResult:
    return await validate_launch_config(config)
