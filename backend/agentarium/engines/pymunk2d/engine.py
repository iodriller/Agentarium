from __future__ import annotations

from agentarium.core.schemas.design import BodyShape, DesignSpec
from agentarium.core.schemas.setup import WorldConfig
from agentarium.core.schemas.trace import (
    BodyMeta,
    EpisodeTrace,
    Frame,
    FrameBody,
    StaticProp,
)
from agentarium.engines.base import EngineAdapter
from agentarium.engines.pymunk2d.builder import GROUND_ID, build_space

# Hard cap on physics steps to keep simulations (and tests) fast.
_MAX_STEPS = 6000
# Target output frame rate; we sub-sample physics steps down to ~this rate.
_TARGET_FPS = 30.0


class Pymunk2DEngine(EngineAdapter):
    name = "pymunk2d"

    def simulate(
        self,
        design: DesignSpec,
        world: WorldConfig,
        duration_seconds: float,
        dt: float = 1 / 60,
    ) -> EpisodeTrace:
        space, bodies = build_space(design, world)

        # Only dynamic (non-static) bodies are recorded per frame.
        dynamic_ids = [spec.id for spec in design.bodies if not spec.static]

        total_steps = int(duration_seconds / dt)
        total_steps = max(0, min(total_steps, _MAX_STEPS))

        # Record roughly every Nth step to hit ~_TARGET_FPS regardless of dt.
        sim_fps = 1.0 / dt if dt > 0 else _TARGET_FPS
        record_every = max(1, round(sim_fps / _TARGET_FPS))

        trace = EpisodeTrace(
            run_id="",  # filled in by caller / run service
            engine=self.name,
            terrain=getattr(world.terrain, "value", str(world.terrain)),
            dt=dt,
            kill_y=design.metadata.get("kill_y"),
            world_static=self._build_static(design, world),
            body_meta={
                spec.id: BodyMeta(
                    shape=spec.shape.value
                    if isinstance(spec.shape, BodyShape)
                    else str(spec.shape),
                    size=list(spec.size),
                    color=spec.color,
                    kind=spec.kind,
                )
                for spec in design.bodies
                if not spec.static
            },
        )

        def record(step: int) -> None:
            frame_bodies: dict[str, FrameBody] = {}
            for bid in dynamic_ids:
                body = bodies[bid]
                frame_bodies[bid] = FrameBody(
                    x=float(body.position.x),
                    y=float(body.position.y),
                    angle=float(body.angle),
                )
            trace.frames.append(Frame(t=step * dt, bodies=frame_bodies))

        # Initial frame at t=0.
        record(0)
        last_recorded = 0
        for step in range(1, total_steps + 1):
            space.step(dt)
            if step % record_every == 0:
                record(step)
                last_recorded = step
        # Always record the final state so distance/duration/falls aren't read
        # from a frame up to (record_every - 1) steps stale.
        if total_steps > 0 and last_recorded != total_steps:
            record(total_steps)

        return trace

    @staticmethod
    def _build_static(design: DesignSpec, world: WorldConfig) -> list[StaticProp]:
        props: list[StaticProp] = []
        map_width = world.map_size[0] if world.map_size else 32
        raw_spans = design.metadata.get("ground_spans") or [
            [-float(map_width), float(map_width)]
        ]
        for i, span in enumerate(raw_spans):
            if not isinstance(span, (list, tuple)) or len(span) < 2:
                continue
            x0, x1 = float(span[0]), float(span[1])
            if x1 <= x0:
                continue
            props.append(
                StaticProp(
                    id=f"{GROUND_ID}_{i}" if len(raw_spans) > 1 else GROUND_ID,
                    kind="ground",
                    position=[(x0 + x1) / 2.0, 0.0],
                    size=[x1 - x0, 0.2],
                )
            )
        for spec in design.bodies:
            if spec.static:
                shape_name = (
                    spec.shape.value
                    if isinstance(spec.shape, BodyShape)
                    else str(spec.shape)
                )
                props.append(
                    StaticProp(
                        id=spec.id,
                        # Prefer the semantic label so static structures render as
                        # themselves (wall/bin/house) rather than a raw shape.
                        kind=spec.kind or shape_name,
                        position=list(spec.position),
                        size=list(spec.size),
                        angle=spec.angle,
                        color=spec.color,
                        shape=shape_name,
                    )
                )
        return props
