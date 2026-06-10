from __future__ import annotations

from abc import ABC, abstractmethod

from agentarium.core.schemas.design import DesignSpec
from agentarium.core.schemas.setup import WorldConfig
from agentarium.core.schemas.trace import EpisodeTrace


class EngineAdapter(ABC):
    """Engine-neutral interface for running a DesignSpec to produce an EpisodeTrace."""

    name: str

    @abstractmethod
    def simulate(
        self,
        design: DesignSpec,
        world: WorldConfig,
        duration_seconds: float,
        dt: float = 1 / 60,
    ) -> EpisodeTrace:
        """Build and run the simulation, returning an engine-neutral trace."""
        ...
