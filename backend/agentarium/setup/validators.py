from __future__ import annotations

import httpx

from agentarium.core.schemas.setup import (
    LaunchConfig,
    LaunchState,
    LLMProvider,
    PhysicsEngine,
    ValidationResult,
)


async def validate_launch_config(config: LaunchConfig) -> ValidationResult:
    missing: list[str] = []
    warnings: list[str] = []

    # --- 1. MISSING_REQUIRED ---
    if config.scenario.preset == "":
        missing.append("scenario.preset")

    if config.world.template == "":
        missing.append("world.template")

    participants = config.agents.participants
    if len(participants) == 0 and config.agents.mode != "single":
        missing.append("agents.participants")

    if len(participants) > 1:
        for participant in participants:
            if not participant.id:
                missing.append(f"agents.participants[{participant.id}].id")
            if not participant.name:
                missing.append(f"agents.participants[{participant.id}].name")

    if missing:
        return ValidationResult(state=LaunchState.missing_required, missing=missing)

    # --- 2. UNSUPPORTED_ENGINE ---
    if config.world.engine == PhysicsEngine.pybullet3d:
        return ValidationResult(state=LaunchState.unsupported_engine, missing=missing, warnings=warnings)

    # --- 3. TOOL_CHALLENGE_MISMATCH (warning only) ---
    if not config.tools.enabled:
        warnings.append("No tools enabled — agent will not be able to build anything.")

    # --- 4. LLM_OFFLINE check ---
    providers_to_probe = {LLMProvider.localdeploy, LLMProvider.openai_compatible}
    # Determine which endpoint(s) to probe based on participant providers
    endpoints_to_check: set[str] = set()
    for participant in participants:
        if participant.provider in providers_to_probe:
            # Use participant-specific endpoint if set, otherwise fall back to llm_connection
            endpoint = participant.endpoint_url or config.llm_connection.endpoint_url
            endpoints_to_check.add(endpoint)

    # Also check llm_connection directly if no participants but provider would need probing
    # (edge case: single mode with no participants list entry but llm_connection is remote)
    # Per spec, we check participants; if none require probing, no probe needed.

    for endpoint_url in endpoints_to_check:
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                response = await client.get(f"{endpoint_url}/models")
            if response.status_code != 200:
                missing.append(f"LLM endpoint unreachable: {endpoint_url}")
                return ValidationResult(
                    state=LaunchState.llm_offline, missing=missing, warnings=warnings
                )
        except Exception:
            missing.append(f"LLM endpoint unreachable: {endpoint_url}")
            return ValidationResult(
                state=LaunchState.llm_offline, missing=missing, warnings=warnings
            )

    # --- 5. CONSTRAINTS_TOO_LOOSE (warning only) ---
    if config.constraints.max_parts > 1000:
        warnings.append("max_parts > 1000 may cause slow simulations.")

    if config.constraints.max_attempts > 500:
        warnings.append("max_attempts > 500 may take a very long time.")

    # --- 6. READY ---
    return ValidationResult(
        state=LaunchState.ready,
        missing=missing,
        warnings=warnings,
        estimated_runtime_min=(2, 4),
    )
