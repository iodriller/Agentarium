from enum import StrEnum

from pydantic import BaseModel


class ToolCategory(StrEnum):
    building = "building"
    sensors_control = "sensors_control"
    physics_materials = "physics_materials"
    simulation_inspection = "simulation_inspection"
    evolution_utilities = "evolution_utilities"


class RiskLevel(StrEnum):
    low = "low"
    medium = "medium"
    high = "high"


class ToolDefinition(BaseModel):
    name: str
    category: ToolCategory
    description: str
    risk: RiskLevel = RiskLevel.low
    enabled_by_default: bool = True
    compatible_challenges: list[str] = []  # empty = all
    input_schema: dict = {}  # JSON Schema object for the tool args
