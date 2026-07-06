from agentarium.core.schemas.design import BodyShape, BodySpec, DesignSpec
from agentarium.core.schemas.setup import WorldConfig
from agentarium.engines import get_engine
from agentarium.engines.pymunk2d.engine import Pymunk2DEngine
from agentarium.services.run_service import hardcoded_demo_design


def _world() -> WorldConfig:
    return WorldConfig(template="flat_ground")


def test_get_engine():
    assert isinstance(get_engine("pymunk2d"), Pymunk2DEngine)
    assert get_engine("nonexistent") is None


def test_pymunk_simulate_steps():
    engine = Pymunk2DEngine()
    design = hardcoded_demo_design()
    trace = engine.simulate(design, _world(), duration_seconds=1.0)

    assert len(trace.frames) > 0
    assert trace.dt > 0
    # Every frame body must expose x/y/angle.
    for frame in trace.frames:
        for body in frame.bodies.values():
            assert hasattr(body, "x")
            assert hasattr(body, "y")
            assert hasattr(body, "angle")


def test_ball_rolls_down_angled_ramp():
    # A ball dropped onto an angled static segment must travel horizontally — i.e.
    # the segment's angle is honored by the physics, so ramps actually slope.
    import math

    design = DesignSpec(
        name="ramp",
        bodies=[
            BodySpec(
                id="ramp",
                shape=BodyShape.segment,
                position=[0.0, 3.0],
                size=[10.0],
                angle=-0.4,  # downhill to the right
                static=True,
            ),
            BodySpec(
                id="ball",
                shape=BodyShape.circle,
                position=[-3.0, 5.0],
                size=[0.4],
                mass=1.0,
            ),
        ],
    )
    trace = Pymunk2DEngine().simulate(design, _world(), duration_seconds=3.0)
    start_x = trace.frames[0].bodies["ball"].x
    end_x = trace.frames[-1].bodies["ball"].x
    assert end_x - start_x > 1.0  # rolled meaningfully to the right
    # The ramp's slope is preserved in the static props for rendering.
    ramp_prop = next(p for p in trace.world_static if p.id == "ramp")
    assert ramp_prop.angle == -0.4
    assert not math.isclose(ramp_prop.angle, 0.0)


def test_falling_body_moves():
    design = DesignSpec(
        name="faller",
        bodies=[
            BodySpec(
                id="box",
                shape=BodyShape.box,
                position=[0.0, 10.0],
                size=[1.0, 1.0],
                mass=1.0,
            )
        ],
    )
    engine = Pymunk2DEngine()
    trace = engine.simulate(design, _world(), duration_seconds=1.0)

    first_y = trace.frames[0].bodies["box"].y
    last_y = trace.frames[-1].bodies["box"].y
    assert last_y < first_y


def test_world_static_includes_ground():
    engine = Pymunk2DEngine()
    trace = engine.simulate(hardcoded_demo_design(), _world(), duration_seconds=0.5)
    kinds = {p.kind for p in trace.world_static}
    assert "ground" in kinds


def test_kind_flows_to_static_prop_and_body_meta():
    # A cosmetic `kind` (e.g. "house") must reach both the static-prop trace
    # (for static bodies) and body_meta (for dynamic bodies) so the renderer
    # can draw a recognizable shape instead of a plain rectangle.
    design = DesignSpec(
        name="scene",
        bodies=[
            BodySpec(
                id="house1", shape=BodyShape.box, position=[0.0, 1.5],
                size=[2.0, 3.0], static=True, kind="house",
            ),
            BodySpec(
                id="crate1", shape=BodyShape.box, position=[5.0, 5.0],
                size=[1.0, 1.0], static=False, kind="tree",
            ),
        ],
    )
    trace = Pymunk2DEngine().simulate(design, _world(), duration_seconds=0.2)
    house_prop = next(p for p in trace.world_static if p.id == "house1")
    assert house_prop.kind == "house"
    assert trace.body_meta["crate1"].kind == "tree"


def test_body_spawned_at_ground_default_does_not_tunnel_through():
    # Regression for E5: a dynamic body created via apply_tool_call with no
    # explicit position (schema default [0, 0]) must rest near the ground after
    # simulating, not fall through it forever (previously observed y -> -4412).
    from agentarium.tools.apply import apply_tool_call

    design = DesignSpec(name="t")
    apply_tool_call(
        design, agent_id="a", tool="create_body",
        args={"id": "b1", "shape": "box"}, enabled_tools=["create_body"],
    )
    trace = Pymunk2DEngine().simulate(design, _world(), duration_seconds=5.0)
    final_y = trace.frames[-1].bodies["b1"].y
    assert final_y > -1.0  # resting on/near the ground, not tunneled through


def test_kind_falls_back_to_shape_when_absent():
    # Bodies without a `kind` keep the old shape-name fallback (backward compat
    # with challenges that don't use the cosmetic kind hint, e.g. bridge/crawl).
    design = DesignSpec(
        name="scene",
        bodies=[
            BodySpec(id="beam1", shape=BodyShape.segment, position=[0.0, 1.0], size=[2.0], static=True),
        ],
    )
    trace = Pymunk2DEngine().simulate(design, _world(), duration_seconds=0.2)
    beam_prop = next(p for p in trace.world_static if p.id == "beam1")
    assert beam_prop.kind == "segment"
