from agentarium.core.schemas.design import BodyShape, BodySpec, DesignSpec
from agentarium.core.schemas.toolcall import ToolCallStatus
from agentarium.tools.apply import apply_tool_call

_ENABLED = [
    "create_body",
    "add_joint",
    "add_motor",
    "set_material",
    "set_friction",
]


def test_create_body_mutates():
    design = DesignSpec()
    result = apply_tool_call(
        design,
        agent_id="a",
        tool="create_body",
        args={"id": "b1", "shape": "box"},
        enabled_tools=_ENABLED,
    )
    assert result.mutated is True
    assert result.record.status == ToolCallStatus.success
    assert len(design.bodies) == 1
    assert design.bodies[0].id == "b1"
    assert design.bodies[0].created_by == "a"


def test_create_body_width_height_static():
    # A tall static building: width/height make a non-square box, static pins it.
    design = DesignSpec()
    result = apply_tool_call(
        design,
        agent_id="a",
        tool="create_body",
        args={
            "id": "tower",
            "shape": "box",
            "position": [4.0, 3.0],
            "width": 2.0,
            "height": 6.0,
            "static": True,
        },
        enabled_tools=["create_body"],
    )
    assert result.mutated is True
    body = design.bodies[0]
    assert body.size == [2.0, 6.0]
    assert body.static is True


def test_joint_between_two_static_bodies_rejected():
    # A joint between two static bodies is invalid (pymunk needs one dynamic) and
    # would otherwise crash the whole simulation — reject it with feedback.
    design = DesignSpec(
        bodies=[
            BodySpec(id="beam1", shape=BodyShape.segment, static=True),
            BodySpec(id="beam2", shape=BodyShape.segment, static=True),
        ]
    )
    result = apply_tool_call(
        design,
        agent_id="a",
        tool="add_joint",
        args={"id": "j1", "body_a": "beam1", "body_b": "beam2", "type": "pivot"},
        enabled_tools=["add_joint"],
    )
    assert result.mutated is False
    assert result.record.status == ToolCallStatus.rejected
    assert "movable" in (result.record.error or "")
    assert len(design.joints) == 0


def test_add_ramp_keeps_slope_angle():
    # A ramp from a high start to a low end must be an angled segment, not a flat
    # horizontal bar at the midpoint — otherwise nothing can ever roll/slide.
    import math

    design = DesignSpec()
    result = apply_tool_call(
        design,
        agent_id="a",
        tool="add_ramp",
        args={"id": "r1", "start": [0.0, 4.0], "end": [8.0, 0.0]},
        enabled_tools=["add_ramp"],
    )
    assert result.mutated is True
    ramp = design.bodies[0]
    assert ramp.static is True
    # Downhill to the right → negative angle, matching atan2(-4, 8).
    assert ramp.angle == math.atan2(-4.0, 8.0)
    assert ramp.angle < 0.0


def test_disabled_tool_rejected():
    design = DesignSpec()
    result = apply_tool_call(
        design,
        agent_id="a",
        tool="create_body",
        args={"id": "b1", "shape": "box"},
        enabled_tools=["add_joint"],  # create_body not enabled
    )
    assert result.mutated is False
    assert result.record.status == ToolCallStatus.rejected
    assert result.record.error == "tool not enabled"
    assert len(design.bodies) == 0


def test_invalid_args_rejected():
    design = DesignSpec()
    result = apply_tool_call(
        design,
        agent_id="a",
        tool="create_body",
        args={"shape": "box"},  # missing required 'id'
        enabled_tools=_ENABLED,
    )
    assert result.mutated is False
    assert result.record.status == ToolCallStatus.rejected
    assert result.record.error is not None
    assert "invalid args" in result.record.error
    assert len(design.bodies) == 0


def test_add_joint_requires_bodies():
    design = DesignSpec()
    result = apply_tool_call(
        design,
        agent_id="a",
        tool="add_joint",
        args={"id": "j1", "body_a": "x", "body_b": "y", "type": "pivot"},
        enabled_tools=_ENABLED,
    )
    assert result.mutated is False
    assert result.record.status == ToolCallStatus.rejected
    assert len(design.joints) == 0
