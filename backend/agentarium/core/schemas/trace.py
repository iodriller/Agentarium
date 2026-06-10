from __future__ import annotations

from pydantic import BaseModel


class StaticProp(BaseModel):
    id: str
    kind: str  # "ground" | "goal" | "prop" | body shape
    position: list[float]
    size: list[float] = []
    color: str | None = None


class FrameBody(BaseModel):
    x: float
    y: float
    angle: float


class Frame(BaseModel):
    t: float
    bodies: dict[str, FrameBody]
    events: list[dict] = []


class EpisodeTrace(BaseModel):
    version: int = 1
    run_id: str
    attempt_id: str = "attempt_001"
    engine: str = "pymunk2d"
    camera: str = "isometric"
    dt: float
    world_static: list[StaticProp] = []
    frames: list[Frame] = []
