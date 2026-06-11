"""max_parts / max_joints budgets are enforced at the apply chokepoint."""
from __future__ import annotations

from agentarium.core.schemas.design import DesignSpec
from agentarium.tools.apply import apply_tool_call

_BUILD_TOOLS = ["create_body", "add_ball", "add_joint"]


def _add_body(design: DesignSpec, bid: str, max_parts: int | None = None):
    return apply_tool_call(
        design,
        agent_id="a",
        tool="create_body",
        args={"id": bid, "shape": "box", "position": [0.0, 5.0]},
        enabled_tools=_BUILD_TOOLS,
        max_parts=max_parts,
    )


def test_max_parts_rejects_over_budget():
    design = DesignSpec(name="t")
    # Budget of 2: first two succeed, third rejected.
    assert _add_body(design, "b1", max_parts=2).mutated
    assert _add_body(design, "b2", max_parts=2).mutated
    result = _add_body(design, "b3", max_parts=2)
    assert not result.mutated
    assert result.record.status.value.lower() == "rejected"
    assert "max_parts" in (result.record.error or "")
    assert len(design.bodies) == 2


def test_max_parts_none_is_unlimited():
    design = DesignSpec(name="t")
    for i in range(5):
        assert _add_body(design, f"b{i}", max_parts=None).mutated
    assert len(design.bodies) == 5


def test_max_joints_rejects_over_budget():
    design = DesignSpec(name="t")
    _add_body(design, "b1")
    _add_body(design, "b2")
    _add_body(design, "b3")

    def add_joint(jid: str, a: str, b: str):
        return apply_tool_call(
            design,
            agent_id="a",
            tool="add_joint",
            args={"id": jid, "body_a": a, "body_b": b, "type": "pivot"},
            enabled_tools=_BUILD_TOOLS,
            max_joints=1,
        )

    assert add_joint("j1", "b1", "b2").mutated
    result = add_joint("j2", "b2", "b3")
    assert not result.mutated
    assert "max_joints" in (result.record.error or "")
    assert len(design.joints) == 1
