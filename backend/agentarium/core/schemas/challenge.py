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


class WorldTemplate(BaseModel):
    id: str
    name: str
    terrain: str
    map_size: list[int]
    gravity: float = -9.81
    active_physics_zones: int = 1
    description: str = ""
