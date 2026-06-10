from __future__ import annotations

import pymunk

from agentarium.core.schemas.design import BodyShape, BodySpec, DesignSpec, JointSpec, JointType
from agentarium.core.schemas.setup import WorldConfig

# Identifier used for the auto-generated static ground segment.
GROUND_ID = "__ground__"


def _make_shape(body: pymunk.Body, spec: BodySpec) -> pymunk.Shape:
    """Create the pymunk shape matching a BodySpec, attached to ``body``."""
    size = spec.size or [0.5, 0.5]
    if spec.shape == BodyShape.circle:
        radius = size[0] if size else 0.5
        shape: pymunk.Shape = pymunk.Circle(body, radius)
    elif spec.shape == BodyShape.segment:
        length = size[0] if size else 1.0
        half = length / 2.0
        shape = pymunk.Segment(body, (-half, 0.0), (half, 0.0), radius=0.05)
    elif spec.shape == BodyShape.polygon:
        # Treat ``size`` as a flat list of x,y vertex pairs when provided,
        # otherwise fall back to a box from the first two values.
        if len(size) >= 6 and len(size) % 2 == 0:
            verts = [(size[i], size[i + 1]) for i in range(0, len(size), 2)]
            shape = pymunk.Poly(body, verts)
        else:
            w = size[0] if len(size) > 0 else 0.5
            h = size[1] if len(size) > 1 else 0.5
            shape = pymunk.Poly.create_box(body, (w, h))
    else:  # box (default)
        w = size[0] if len(size) > 0 else 0.5
        h = size[1] if len(size) > 1 else 0.5
        shape = pymunk.Poly.create_box(body, (w, h))
    shape.friction = spec.friction
    shape.elasticity = spec.elasticity
    return shape


def _moment(spec: BodySpec) -> float:
    size = spec.size or [0.5, 0.5]
    if spec.shape == BodyShape.circle:
        radius = size[0] if size else 0.5
        return pymunk.moment_for_circle(spec.mass, 0.0, radius)
    if spec.shape == BodyShape.segment:
        length = size[0] if size else 1.0
        half = length / 2.0
        return pymunk.moment_for_segment(spec.mass, (-half, 0.0), (half, 0.0), 0.05)
    w = size[0] if len(size) > 0 else 0.5
    h = size[1] if len(size) > 1 else 0.5
    return pymunk.moment_for_box(spec.mass, (w, h))


def _make_body(spec: BodySpec) -> pymunk.Body:
    if spec.static:
        body = pymunk.Body(body_type=pymunk.Body.STATIC)
    else:
        body = pymunk.Body(spec.mass, _moment(spec))
    body.position = (spec.position[0], spec.position[1])
    return body


def _add_joint(
    space: pymunk.Space,
    bodies: dict[str, pymunk.Body],
    joint: JointSpec,
) -> None:
    a = bodies.get(joint.body_a)
    b = bodies.get(joint.body_b)
    if a is None or b is None:
        return
    anchor_a = (joint.anchor_a[0], joint.anchor_a[1])
    anchor_b = (joint.anchor_b[0], joint.anchor_b[1])

    if joint.type == JointType.pin:
        constraint: pymunk.Constraint = pymunk.PinJoint(a, b, anchor_a, anchor_b)
    elif joint.type == JointType.slide:
        constraint = pymunk.SlideJoint(a, b, anchor_a, anchor_b, min=0.0, max=2.0)
    elif joint.type == JointType.spring:
        constraint = pymunk.DampedSpring(
            a, b, anchor_a, anchor_b, rest_length=1.0, stiffness=100.0, damping=5.0
        )
    else:  # pivot (default)
        # Pivot at body_a's world anchor point.
        pivot_point = a.local_to_world(anchor_a)
        constraint = pymunk.PivotJoint(a, b, pivot_point)
    space.add(constraint)

    if joint.motor_rate is not None:
        motor = pymunk.SimpleMotor(a, b, joint.motor_rate)
        motor.max_force = joint.motor_max_force
        space.add(motor)


def build_space(
    design: DesignSpec, world: WorldConfig
) -> tuple[pymunk.Space, dict[str, pymunk.Body]]:
    """Construct a pymunk Space from a DesignSpec + WorldConfig.

    Returns the space and a mapping of body id -> pymunk.Body.
    """
    space = pymunk.Space()
    space.gravity = (0.0, world.gravity)

    bodies: dict[str, pymunk.Body] = {}

    # Static ground segment near y=0 spanning the map width.
    map_width = world.map_size[0] if world.map_size else 32
    ground = space.static_body
    ground_segment = pymunk.Segment(
        ground, (-float(map_width), 0.0), (float(map_width), 0.0), radius=0.1
    )
    ground_segment.friction = 0.9
    ground_segment.elasticity = 0.1
    space.add(ground_segment)

    for spec in design.bodies:
        body = _make_body(spec)
        shape = _make_shape(body, spec)
        if spec.static:
            space.add(body, shape)
        else:
            space.add(body, shape)
        bodies[spec.id] = body

    for joint in design.joints:
        _add_joint(space, bodies, joint)

    return space, bodies
