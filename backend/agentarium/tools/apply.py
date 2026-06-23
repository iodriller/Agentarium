from __future__ import annotations

import math
import time

from pydantic import BaseModel

from agentarium.core.schemas.design import (
    BodyShape,
    BodySpec,
    DesignSpec,
    JointSpec,
    JointType,
)
from agentarium.core.schemas.tool import ToolStatus
from agentarium.core.schemas.toolcall import ToolCallRecord, ToolCallStatus
from agentarium.tools.registry import get_tool


def _body_area(body: BodySpec) -> float:
    """Approximate planar area of a body from its shape + size (for density→mass)."""
    size = body.size or [0.5, 0.5]
    if body.shape == BodyShape.circle:
        r = size[0] if size else 0.5
        return math.pi * r * r
    if body.shape == BodyShape.segment:
        length = size[0] if size else 1.0
        return max(length, 1e-2) * 0.1  # thin strip
    w = size[0] if len(size) > 0 else 0.5
    h = size[1] if len(size) > 1 else 0.5
    return max(w, 1e-2) * max(h, 1e-2)

# Material -> friction/elasticity presets used by material-setting tools.
_MATERIAL_FRICTION = {
    "rubber": 0.95,
    "metal": 0.6,
    "wood": 0.5,
    "glass": 0.2,
}


class ToolCallResult(BaseModel):
    record: ToolCallRecord
    mutated: bool


# Tools that add a body / a joint / a motor, for constraint enforcement.
_BODY_TOOLS = frozenset(
    {"create_body", "add_ball", "add_beam", "add_ramp", "add_bin"}
)
_JOINT_TOOLS = frozenset({"add_joint"})
_MOTOR_TOOLS = frozenset({"add_motor"})


def _validate_args(args: dict, schema: dict) -> str | None:
    """Lightweight JSON-Schema validation.

    Returns an error string on failure, or None if the args are valid. Checks
    ``required`` keys, property ``type``/``enum``, numeric ``minimum``/``maximum``
    and finiteness, and array ``minItems``/``maxItems`` with numeric item bounds.
    Agent args are untrusted and feed the physics engine, so out-of-range or
    non-finite numbers (which can crash pymunk) must be rejected here.
    """
    if not isinstance(args, dict):
        return "args must be an object"

    type_map: dict[str, type | tuple[type, ...]] = {
        "string": str,
        "number": (int, float),
        "integer": int,
        "boolean": bool,
        "array": list,
        "object": dict,
    }

    for key in schema.get("required", []):
        if key not in args:
            return f"missing required field '{key}'"

    properties = schema.get("properties", {})
    for key, value in args.items():
        prop = properties.get(key)
        if not prop:
            continue
        expected = prop.get("type")
        if expected is None:
            continue
        py_type = type_map.get(expected)
        if py_type is None:
            continue
        # bool is a subclass of int; reject bools where a number is expected.
        if expected in ("number", "integer") and isinstance(value, bool):
            return f"field '{key}' must be of type {expected}"
        if not isinstance(value, py_type):
            return f"field '{key}' must be of type {expected}"
        if expected in ("number", "integer"):
            if not math.isfinite(value):
                return f"field '{key}' must be a finite number"
            if "minimum" in prop and value < prop["minimum"]:
                return f"field '{key}' must be >= {prop['minimum']}"
            if "maximum" in prop and value > prop["maximum"]:
                return f"field '{key}' must be <= {prop['maximum']}"
        if expected == "string" and prop.get("enum") and value not in prop["enum"]:
            return f"field '{key}' must be one of {prop['enum']}"
        if expected == "array":
            if "minItems" in prop and len(value) < prop["minItems"]:
                return f"field '{key}' must have at least {prop['minItems']} items"
            if "maxItems" in prop and len(value) > prop["maxItems"]:
                return f"field '{key}' must have at most {prop['maxItems']} items"
            items = prop.get("items")
            if items and items.get("type") in ("number", "integer"):
                for item in value:
                    if isinstance(item, bool) or not isinstance(item, (int, float)):
                        return f"field '{key}' items must be numbers"
                    if not math.isfinite(item):
                        return f"field '{key}' items must be finite numbers"
    return None


def _body_ids(design: DesignSpec) -> set[str]:
    return {b.id for b in design.bodies}


def _joint_ids(design: DesignSpec) -> set[str]:
    return {j.id for j in design.joints}


def _mutate(design: DesignSpec, agent_id: str, tool: str, args: dict) -> bool:
    """Apply ``tool`` to ``design`` in place. Returns whether it mutated.

    Raises ValueError on any reject condition; the caller guarantees the design
    is unchanged on raise by operating on a copy.
    """
    if tool == "create_body":
        bid = args["id"]
        if bid in _body_ids(design):
            raise ValueError(f"body '{bid}' already exists")
        shape = BodyShape(args["shape"])
        if shape == BodyShape.circle:
            radius = float(args.get("radius", 0.5))
            size = [radius]
        elif "width" in args or "height" in args:
            # Non-square box (a tall building/wall, a wide platform, …).
            w = float(args.get("width", args.get("length", 1.0)))
            h = float(args.get("height", args.get("length", 1.0)))
            size = [w, h]
        else:
            length = float(args.get("length", 1.0))
            size = [length, length]
        design.bodies.append(
            BodySpec(
                id=bid,
                shape=shape,
                position=[float(v) for v in args.get("position", [0.0, 0.0])],
                size=size,
                static=bool(args.get("static", False)),
                mass=float(args.get("mass", 1.0)),
                material=args.get("material", "metal"),
                friction=float(args.get("friction", 0.6)),
                created_by=agent_id,
            )
        )
        return True

    if tool == "add_joint":
        jid = args["id"]
        if jid in _joint_ids(design):
            raise ValueError(f"joint '{jid}' already exists")
        ids = _body_ids(design)
        if args["body_a"] not in ids:
            raise ValueError(f"body_a '{args['body_a']}' not present")
        if args["body_b"] not in ids:
            raise ValueError(f"body_b '{args['body_b']}' not present")
        by_id = {b.id: b for b in design.bodies}
        if by_id[args["body_a"]].static and by_id[args["body_b"]].static:
            raise ValueError(
                "joint requires at least one movable (non-static) body; "
                "beams and ramps are static"
            )
        design.joints.append(
            JointSpec(
                id=jid,
                body_a=args["body_a"],
                body_b=args["body_b"],
                type=JointType(args["type"]),
                anchor_a=[float(v) for v in args.get("anchor_a", [0.0, 0.0])],
                anchor_b=[float(v) for v in args.get("anchor_b", [0.0, 0.0])],
                created_by=agent_id,
            )
        )
        return True

    if tool == "add_motor":
        jid = args["joint_id"]
        joint = next((j for j in design.joints if j.id == jid), None)
        if joint is None:
            raise ValueError(f"joint '{jid}' not found")
        joint.motor_rate = float(args["rate"])
        if "max_force" in args:
            joint.motor_max_force = float(args["max_force"])
        return True

    if tool == "add_beam":
        bid = args["id"]
        if bid in _body_ids(design):
            raise ValueError(f"body '{bid}' already exists")
        start = [float(v) for v in args["start"]]
        end = [float(v) for v in args["end"]]
        center = [(start[0] + end[0]) / 2.0, (start[1] + end[1]) / 2.0]
        length = math.dist(start, end)
        # Keep the slope: a beam from start to end is the segment angled to match,
        # not a flat horizontal bar at the midpoint.
        angle = math.atan2(end[1] - start[1], end[0] - start[0])
        design.bodies.append(
            BodySpec(
                id=bid,
                shape=BodyShape.segment,
                position=center,
                size=[length or 1.0],
                angle=angle,
                static=True,
                created_by=agent_id,
            )
        )
        return True

    if tool == "add_ramp":
        bid = args["id"]
        if bid in _body_ids(design):
            raise ValueError(f"body '{bid}' already exists")
        start = [float(v) for v in args["start"]]
        end = [float(v) for v in args["end"]]
        center = [(start[0] + end[0]) / 2.0, (start[1] + end[1]) / 2.0]
        length = math.dist(start, end)
        # A ramp is sloped: derive its incline from start→end (or an explicit
        # ``angle`` override in degrees) so things can actually roll/slide down it.
        if "angle" in args:
            angle = math.radians(float(args["angle"]))
        else:
            angle = math.atan2(end[1] - start[1], end[0] - start[0])
        design.bodies.append(
            BodySpec(
                id=bid,
                shape=BodyShape.segment,
                position=center,
                size=[length or 1.0],
                angle=angle,
                static=True,
                created_by=agent_id,
            )
        )
        return True

    if tool == "add_ball":
        bid = args["id"]
        if bid in _body_ids(design):
            raise ValueError(f"body '{bid}' already exists")
        design.bodies.append(
            BodySpec(
                id=bid,
                shape=BodyShape.circle,
                position=[float(v) for v in args["position"]],
                size=[float(args.get("radius", 0.5))],
                mass=float(args.get("mass", 1.0)),
                color=args.get("color"),
                created_by=agent_id,
            )
        )
        return True

    if tool == "add_bin":
        bid = args["id"]
        if bid in _body_ids(design):
            raise ValueError(f"body '{bid}' already exists")
        width = float(args.get("width", 2.0))
        height = float(args.get("height", 2.0))
        pos = [float(v) for v in args["position"]]
        design.bodies.append(
            BodySpec(
                id=bid,
                shape=BodyShape.box,
                position=pos,
                size=[width, height],
                static=True,
                created_by=agent_id,
            )
        )
        # Record bin geometry (+ accepted class) in metadata so scoring can check
        # both containment and correct object-class-to-bin matching.
        design.metadata.setdefault("bins", []).append(
            {
                "id": bid,
                "x": pos[0],
                "y": pos[1],
                "width": width,
                "height": height,
                "accepts": args.get("accepts"),
            }
        )
        return True

    if tool == "set_material":
        bid = args["body_id"]
        body = next((b for b in design.bodies if b.id == bid), None)
        if body is None:
            raise ValueError(f"body '{bid}' not found")
        material = args["material"]
        body.material = material
        if material in _MATERIAL_FRICTION:
            body.friction = _MATERIAL_FRICTION[material]
        return True

    if tool == "set_friction":
        bid = args["body_id"]
        body = next((b for b in design.bodies if b.id == bid), None)
        if body is None:
            raise ValueError(f"body '{bid}' not found")
        body.friction = float(args["friction"])
        return True

    if tool == "set_density":
        bid = args["body_id"]
        body = next((b for b in design.bodies if b.id == bid), None)
        if body is None:
            raise ValueError(f"body '{bid}' not found")
        if body.static:
            raise ValueError(f"body '{bid}' is static; density has no effect")
        density = float(args["density"])
        if density <= 0:
            raise ValueError("density must be positive")
        body.mass = max(density * _body_area(body), 1e-3)
        return True

    if tool == "set_gravity":
        gravity = float(args["gravity"])
        if not math.isfinite(gravity):
            raise ValueError("gravity must be finite")
        # Recorded on the design; the engine reads it as a per-run override.
        design.metadata["gravity_override"] = gravity
        return True

    if tool == "name_design":
        name = str(args["name"]).strip()
        if not name:
            raise ValueError("name must be a non-empty string")
        design.name = name
        return True

    # Inspection / informational tools legitimately don't mutate the design.
    return False


def apply_tool_call(
    design: DesignSpec,
    agent_id: str,
    tool: str,
    args: dict,
    enabled_tools: list[str],
    max_parts: int | None = None,
    max_joints: int | None = None,
    max_motors: int | None = None,
) -> ToolCallResult:
    """The single mutation path for agent tool calls.

    Validates the call and, when valid and mutating, applies it to ``design``
    in place. Invalid calls are logged ``rejected`` and never touch the design.

    ``max_parts`` / ``max_joints`` / ``max_motors`` enforce the ``LaunchConfig``
    budgets: a body-, joint-, or motor-adding call that would exceed the limit is
    rejected before it mutates the design. ``None`` (the default) means
    unlimited, so existing callers and tests are unaffected.
    """
    args = args or {}

    def _reject(error: str) -> ToolCallResult:
        return ToolCallResult(
            record=ToolCallRecord(
                ts=time.time(),
                agent_id=agent_id,
                tool=tool,
                args=args,
                status=ToolCallStatus.rejected,
                error=error,
            ),
            mutated=False,
        )

    if tool not in enabled_tools:
        return _reject("tool not enabled")

    definition = get_tool(tool)
    if definition is None:
        return _reject("unknown tool")

    # Experimental tools are not yet implemented: reject with a clear message
    # rather than silently "succeeding" as a no-op.
    if definition.status == ToolStatus.experimental:
        return _reject("experimental tool — not yet implemented")

    validation_error = _validate_args(args, definition.input_schema)
    if validation_error is not None:
        return _reject(f"invalid args: {validation_error}")

    # Enforce part/joint budgets before mutating.
    if max_parts is not None and tool in _BODY_TOOLS and len(design.bodies) >= max_parts:
        return _reject(f"max_parts ({max_parts}) reached")
    if (
        max_joints is not None
        and tool in _JOINT_TOOLS
        and len(design.joints) >= max_joints
    ):
        return _reject(f"max_joints ({max_joints}) reached")
    if max_motors is not None and tool in _MOTOR_TOOLS:
        motor_count = sum(1 for j in design.joints if j.motor_rate is not None)
        if motor_count >= max_motors:
            return _reject(f"max_motors ({max_motors}) reached")

    # Mutate on a copy so a mid-mutation failure leaves the design untouched.
    working = design.model_copy(deep=True)
    try:
        mutated = _mutate(working, agent_id, tool, args)
    except Exception as exc:  # noqa: BLE001 - any failure becomes a reject
        return _reject(str(exc))

    if mutated:
        design.bodies = working.bodies
        design.joints = working.joints
        design.name = working.name
        design.metadata = working.metadata

    return ToolCallResult(
        record=ToolCallRecord(
            ts=time.time(),
            agent_id=agent_id,
            tool=tool,
            args=args,
            status=ToolCallStatus.success,
            error=None,
        ),
        mutated=mutated,
    )
