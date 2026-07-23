from __future__ import annotations

from agentarium.engines.base import EngineAdapter
from agentarium.engines.citysim.engine import CityEngine
from agentarium.engines.pymunk2d.engine import Pymunk2DEngine


def get_engine(name: str) -> EngineAdapter | None:
    """Return an engine adapter for ``name``, or None if unsupported."""
    if name == "pymunk2d":
        return Pymunk2DEngine()
    if name == "citysim":
        return CityEngine()
    return None
