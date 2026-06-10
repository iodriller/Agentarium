from agentarium.core.schemas.design import DesignSpec
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
