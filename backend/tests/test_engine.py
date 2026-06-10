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
