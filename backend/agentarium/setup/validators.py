from __future__ import annotations

import httpx

from agentarium.core.schemas.setup import (
    CollaborationMode,
    LaunchConfig,
    LaunchState,
    LLMProvider,
    PhysicsEngine,
    ValidationResult,
)
from agentarium.services.preset_service import get_scenario_preset


async def validate_launch_config(config: LaunchConfig) -> ValidationResult:
    missing: list[str] = []
    warnings: list[str] = []

    # --- 1. MISSING_REQUIRED ---
    if config.scenario.preset == "":
        missing.append("scenario.preset")

    if config.world.template == "":
        missing.append("world.template")

    participants = config.agents.participants
    if len(participants) == 0 and config.agents.mode != CollaborationMode.single:
        missing.append("agents.participants")

    # Validate every participant by list position (id may be blank, which is
    # exactly what we want to catch — so index the message, not the id).
    for i, participant in enumerate(participants):
        if not participant.id:
            missing.append(f"agents.participants[{i}].id")
        if not participant.name:
            missing.append(f"agents.participants[{i}].name")
        if participant.provider == LLMProvider.manual:
            missing.append(
                f"agents.participants[{i}]: 'manual' provider is not yet supported "
                "— use 'mock', 'localdeploy', or 'openai_compatible'."
            )

    if missing:
        return ValidationResult(state=LaunchState.missing_required, missing=missing)

    # --- 2. UNSUPPORTED_ENGINE ---
    if config.world.engine == PhysicsEngine.pybullet3d:
        return ValidationResult(state=LaunchState.unsupported_engine, missing=missing, warnings=warnings)

    # --- 3. TOOL_CHALLENGE_MISMATCH ---
    if not config.tools.enabled:
        warnings.append("No tools enabled — agent will not be able to build anything.")

    preset = get_scenario_preset(config.scenario.preset)
    if preset is not None:
        enabled_tools = set(config.tools.enabled)
        for required_tool in preset.required_tools:
            if required_tool not in enabled_tools:
                missing.append(
                    f"Challenge '{config.scenario.preset}' requires tool: {required_tool}"
                )
        if missing:
            return ValidationResult(
                state=LaunchState.tool_challenge_mismatch,
                missing=missing,
                warnings=warnings,
            )

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
        # Normalise URL: strip trailing slash before appending /models.
        base = endpoint_url.rstrip("/")
        # Collect API keys for this endpoint from any participant that uses it.
        api_key: str | None = None
        for participant in participants:
            ep = participant.endpoint_url or config.llm_connection.endpoint_url
            if ep == endpoint_url and participant.api_key:
                api_key = participant.api_key
                break
        if api_key is None:
            api_key = config.llm_connection.api_key
        headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{base}/models", headers=headers)
            if response.status_code != 200:
                # Distinguish an auth problem (reachable but rejected) from an
                # unreachable endpoint so the user knows whether to fix the key.
                if response.status_code in (401, 403):
                    missing.append(
                        f"LLM endpoint rejected the API key (HTTP "
                        f"{response.status_code}): {endpoint_url}"
                    )
                else:
                    missing.append(
                        f"LLM endpoint error (HTTP {response.status_code}): {endpoint_url}"
                    )
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
