from __future__ import annotations

from agentarium.agents.openai_compatible import OpenAICompatibleProvider


class LocalDeployProvider(OpenAICompatibleProvider):
    name = "localdeploy"
    default_endpoint = "http://localhost:1234/v1"
