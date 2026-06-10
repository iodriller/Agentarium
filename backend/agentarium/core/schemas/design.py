from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel


class BodyShape(StrEnum):
    segment = "segment"
    box = "box"
    circle = "circle"
    polygon = "polygon"


class BodySpec(BaseModel):
    id: str
    shape: BodyShape = BodyShape.box
    position: list[float] = [0.0, 0.0]  # [x, y]
    size: list[float] = [0.5, 0.5]  # box: [w, h]; circle: [r]; segment: [len]
    mass: float = 1.0
    static: bool = False  # static bodies don't move (terrain, anchors)
    material: str = "metal"
    friction: float = 0.6
    elasticity: float = 0.1
    color: str | None = None
    created_by: str | None = None  # agent id


class JointType(StrEnum):
    pivot = "pivot"
    pin = "pin"
    slide = "slide"
    spring = "spring"


class JointSpec(BaseModel):
    id: str
    body_a: str
    body_b: str
    type: JointType = JointType.pivot
    anchor_a: list[float] = [0.0, 0.0]
    anchor_b: list[float] = [0.0, 0.0]
    motor_rate: float | None = None  # if set, attach a simple motor
    motor_max_force: float = 100000.0
    created_by: str | None = None


class DesignSpec(BaseModel):
    name: str = "untitled"
    bodies: list[BodySpec] = []
    joints: list[JointSpec] = []
    metadata: dict = {}
