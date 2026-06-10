from __future__ import annotations

from agentarium.core.schemas.tool import ToolDefinition


def _tool_line(tool: ToolDefinition) -> str:
    required = tool.input_schema.get("required", [])
    req = ", ".join(required) if required else "(none)"
    return f"- {tool.name}: {tool.description} required args: {req}"


def build_system_prompt(
    challenge_objective: str,
    world_summary: str,
    enabled_tools: list[ToolDefinition],
    constraints: str = "",
) -> str:
    """System prompt for a single builder agent in the physics sandbox."""
    tool_lines = "\n".join(_tool_line(t) for t in enabled_tools)
    parts = [
        "You are a builder agent in a 2D physics sandbox. Your job is to "
        "construct a design that achieves the objective below.",
        f"Objective: {challenge_objective}",
        f"World: {world_summary}",
    ]
    if constraints:
        parts.append(f"Constraints: {constraints}")
    parts.append(
        "You may ONLY use the following tools:\n" + tool_lines
    )
    parts.append(
        "Respond with a SINGLE JSON object and nothing else, of the form:\n"
        '{"tool_calls": [{"tool": "<name>", "args": {...}}, ...]}\n'
        "Each tool call must use one of the listed tool names and supply its "
        "required args. Do not wrap the JSON in code fences or prose."
    )
    return "\n\n".join(parts)


def build_user_prompt(challenge_objective: str, attempt_index: int = 0) -> str:
    """Per-attempt task text for the builder agent."""
    return (
        f"Attempt #{attempt_index}. Build a design to achieve: "
        f"{challenge_objective}. Emit your tool_calls now."
    )


def build_cooperative_user_prompt(
    challenge_objective: str,
    attempt_index: int,
    *,
    body_count: int,
    joint_count: int,
    existing_body_ids: list[str],
) -> str:
    """Task text for a follow-up agent extending a shared cooperative design.

    The agent is told the current design summary and asked to extend/stabilize
    the existing partial design rather than start from scratch.
    """
    ids_preview = ", ".join(existing_body_ids[:12])
    if len(existing_body_ids) > 12:
        ids_preview += ", …"
    return (
        f"Attempt #{attempt_index}. You are collaborating on a SHARED design "
        f"to achieve: {challenge_objective}.\n"
        f"The design so far has {body_count} bodies and {joint_count} joints.\n"
        f"Existing body ids: [{ids_preview}].\n"
        "Extend and stabilize this existing design (add supports, joints, or "
        "missing parts). Emit your tool_calls now."
    )
