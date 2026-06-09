from fastapi import APIRouter

from agentarium.core.schemas.setup import LaunchConfig, LaunchState, ValidationResult

router = APIRouter(prefix="/api/setup", tags=["setup"])


@router.post("/validate", response_model=ValidationResult)
async def validate_setup(config: LaunchConfig) -> ValidationResult:
    # Stub: real validation arrives in Step 6
    return ValidationResult(state=LaunchState.ready)
