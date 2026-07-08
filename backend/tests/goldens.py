"""Golden (known-good) DesignSpecs for the self-eval screenshot harness.

Each golden design is a hand-verified solution to its challenge — verified by
simulating it through the real Pymunk2D engine, not just eyeballed — used to
produce recognizable, correct-looking screenshots for self-evaluation
(test_visual_playwright.py) and to regenerate the preset preview images.
"""
from __future__ import annotations

import math

from agentarium.agents.runner import _inject_challenge_goal, _seed_scaffold, _seed_world
from agentarium.core.schemas.design import BodyShape, BodySpec, DesignSpec
from agentarium.core.schemas.setup import LaunchConfig, ScenarioConfig, WorldConfig
from agentarium.services.preset_service import get_scenario_preset, get_world_template


def _beam(id_: str, start: list[float], end: list[float]) -> BodySpec:
    # Mirrors tools/apply.py's add_beam exactly: a segment sized/angled to
    # span start->end.
    center = [(start[0] + end[0]) / 2.0, (start[1] + end[1]) / 2.0]
    length = math.dist(start, end)
    angle = math.atan2(end[1] - start[1], end[0] - start[0])
    return BodySpec(
        id=id_, shape=BodyShape.segment, position=center, size=[length or 1.0],
        angle=angle, static=True, kind="beam", created_by="golden",
    )


def _ramp(id_: str, start: list[float], end: list[float]) -> BodySpec:
    # Mirrors tools/apply.py's add_ramp exactly.
    center = [(start[0] + end[0]) / 2.0, (start[1] + end[1]) / 2.0]
    length = math.dist(start, end)
    angle = math.atan2(end[1] - start[1], end[0] - start[0])
    return BodySpec(
        id=id_, shape=BodyShape.segment, position=center, size=[length or 1.0],
        angle=angle, static=True, kind="ramp", created_by="golden",
    )


def _bin(id_: str, position: list[float], width: float, height: float, accepts: str) -> list[BodySpec]:
    # Mirrors tools/apply.py's add_bin exactly: floor + two walls (real
    # containment) plus a full-size sensor prop for the open-top visual.
    wall_w = min(0.18, width * 0.15) or 0.1
    floor_h = min(0.2, height * 0.15) or 0.1
    x, y = position
    color = "red" if accepts == "red" else "blue" if accepts == "blue" else None
    return [
        BodySpec(
            id=f"{id_}_floor", shape=BodyShape.box,
            position=[x, y - height / 2.0 + floor_h / 2.0], size=[width, floor_h],
            static=True, color=color, created_by="golden",
        ),
        BodySpec(
            id=f"{id_}_wall_l", shape=BodyShape.box,
            position=[x - width / 2.0 + wall_w / 2.0, y], size=[wall_w, height],
            static=True, color=color, created_by="golden",
        ),
        BodySpec(
            id=f"{id_}_wall_r", shape=BodyShape.box,
            position=[x + width / 2.0 - wall_w / 2.0, y], size=[wall_w, height],
            static=True, color=color, created_by="golden",
        ),
        BodySpec(
            id=id_, shape=BodyShape.box, position=position, size=[width, height],
            static=True, sensor=True, kind="bin", color=color, created_by="golden",
        ),
    ]


def _seeded(preset_id: str, world_template_id: str, reward: str) -> tuple[DesignSpec, WorldConfig]:
    config = LaunchConfig(
        scenario=ScenarioConfig(preset=preset_id, reward=reward),
        world=WorldConfig(template=world_template_id),
    )
    template = get_world_template(world_template_id)
    world = WorldConfig(
        template=world_template_id,
        map_size=template.map_size if template else [32, 32],
    )
    design = DesignSpec(name=f"golden_{preset_id}")
    _seed_world(design, config)
    _seed_scaffold(design, get_scenario_preset(preset_id))
    _inject_challenge_goal(config, design)
    return design, world


def bridge_builder_golden() -> tuple[DesignSpec, WorldConfig]:
    """A verified single-span bridge that carries the crate across the ravine
    to the goal cliff. Geometry validated against the real engine: the crate
    crosses the gap and comes to rest well past goal_x=8. One clean deck beam
    reads as a bridge; support struts are decorative only (add_beam bodies are
    always static/rigid, so they add visual clutter without a physical
    reason — see docs/CHALLENGE_OVERHAUL_PLAN.md's finding on this) and are
    deliberately left out (see
    test_runner.py::test_bridge_with_real_gap_crate_reaches_goal_via_bridge for
    the mock provider's equivalent build; same coordinates)."""
    design, world = _seeded("bridge_builder", "island_cliff_small", "bridge_transport")
    design.bodies.append(_beam("bridge_deck", [-4.4, 2.05], [2.5, 1.55]))
    return design, world


def sorter_golden() -> tuple[DesignSpec, WorldConfig]:
    """Two chutes feeding two color-matched open bins. Verified: both balls
    land in their matching bin (100% sorting_accuracy, see
    test_runner.py's sorter tests for the mock's equivalent build)."""
    design, world = _seeded("sorter", "sorting_table", "sorting_accuracy")
    # Bins first, then chutes on top — matches the mock provider's own call
    # order and matters for rendering: static props draw in insertion order, so
    # a chute added before its bin would be painted over by the bin's visual.
    for bin_id, x, accepts in (("red_bin", -3.0, "red"), ("blue_bin", -1.0, "blue")):
        design.bodies.extend(_bin(bin_id, [x, 1.8], 1.8, 4.0, accepts))
        design.metadata.setdefault("bins", []).append(
            {"id": bin_id, "x": x, "y": 1.8, "width": 1.8, "height": 4.0, "accepts": accepts}
        )
    design.bodies.append(_ramp("red_chute", [-3.7, 3.2], [-3.0, 2.3]))
    design.bodies.append(_ramp("blue_chute", [-0.3, 3.2], [-1.0, 2.3]))
    return design, world
