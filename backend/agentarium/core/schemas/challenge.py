from __future__ import annotations

from pydantic import BaseModel


class ScenarioPreset(BaseModel):
    id: str
    name: str
    tagline: str
    tags: list[str]
    objective: str
    reward: str
    default_world: str
    required_tools: list[str]
    recommended_tools: list[str] = []
    # Scoring parameters for this challenge (goal_x, threshold_x, min_spacing, …).
    # Injected into the design metadata at scoring time so rewards are goal-aware.
    goal: dict = {}
    # Starting objects seeded into the design before the agent acts: the crate to
    # move, platforms, goal markers, balls to sort, … Each entry is a BodySpec
    # mapping. This gives every challenge a concrete, non-empty world the agent
    # can reason about and reference, and guarantees something to simulate.
    scaffold: list[dict] = []


class WorldTemplate(BaseModel):
    id: str
    name: str
    terrain: str
    map_size: list[int]
    gravity: float = -9.81
    active_physics_zones: int = 1
    description: str = ""
    # Fixed terrain geometry for this world (cliffs, ledges, hills, tables). Each
    # entry is a static BodySpec mapping. Seeded into the design like challenge
    # scaffold so worlds physically differ and render distinctly.
    static_bodies: list[dict] = []
    # Ground floor spans, in world metres, as [x0, x1] pairs. A body positioned
    # between spans has no floor beneath it and falls through — a real gap/chasm
    # instead of the universal invisible floor. Empty means "one span across the
    # whole map" (today's behavior; fully backward compatible).
    ground_spans: list[list[float]] = []
    # World-y below which a body in a gap is considered to have fallen into the
    # chasm (used by scoring, not physics). Only meaningful when ground_spans is set.
    kill_y: float | None = None
