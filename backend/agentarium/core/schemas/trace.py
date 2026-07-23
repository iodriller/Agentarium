from __future__ import annotations

from pydantic import BaseModel


class StaticProp(BaseModel):
    id: str
    kind: str  # "ground" | "goal" | "prop" | body shape
    position: list[float]
    size: list[float] = []
    angle: float = 0.0  # orientation in radians (sloped ramps/beams)
    color: str | None = None
    # The body's actual geometry (box/circle/segment), independent of `kind`
    # (a beam/ramp/wall is semantically a "beam" etc. but geometrically a thin
    # segment) — the renderer needs this to size a segment as a thin plank
    # instead of a square built from its length alone.
    shape: str = "box"
    # Ground-plane depth coordinate. Only meaningful for iso/`citysim` traces,
    # where a prop's footprint sits at (position[0], z) and extrudes upward by
    # size[1]; side-view (pymunk2d) traces leave this 0 and it is ignored.
    z: float = 0.0


class BodyMeta(BaseModel):
    """Static description of a dynamic body so the renderer can draw it to scale.

    Frames only carry x/y/angle (they change every step); shape/size/color are
    constant, so they live here keyed by body id.
    """

    shape: str  # box | circle | segment | polygon
    size: list[float] = []
    color: str | None = None
    # Semantic label so the renderer draws a recognizable prop (house/tree/…).
    kind: str | None = None


class FrameBody(BaseModel):
    x: float
    y: float
    angle: float
    # Ground-plane depth coordinate (iso traces only); 0 for side-view traces.
    z: float = 0.0


class Frame(BaseModel):
    t: float
    bodies: dict[str, FrameBody]
    events: list[dict] = []


class EpisodeTrace(BaseModel):
    version: int = 2
    run_id: str
    attempt_id: str = "attempt_001"
    engine: str = "pymunk2d"
    camera: str = "side"  # "side" (Pymunk2D, x-right/y-up) | "iso" (citysim, x/z ground plane)
    terrain: str = "grassland"  # drives the renderer's ground/background palette
    dt: float
    # Below this world-y, a body over a ground gap is considered fallen into the
    # chasm. None means no gap in this world (ground_spans not set).
    kill_y: float | None = None
    world_static: list[StaticProp] = []
    # Per-dynamic-body shape/size/color, keyed by body id (see BodyMeta).
    body_meta: dict[str, BodyMeta] = {}
    frames: list[Frame] = []
