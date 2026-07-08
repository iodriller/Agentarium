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
