"""
Extractor Agent
Converts Wiki text into structured Card Proposals
"""

from typing import Dict, Any, List
from app.agents.base import BaseAgent
from app.schemas.draft import CardProposal
import json


class ExtractorAgent(BaseAgent):
    """Extractor agent for converting Wiki content to Card Proposals."""

    def get_agent_name(self) -> str:
        return "extractor"

    async def execute(self, project_id: str, chapter: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """Execute extractor task - wrapper for extract_cards."""
        title = context.get("title", "Unknown")
        content = context.get("content", "")
        max_cards = context.get("max_cards", 20)

        proposals = await self.extract_cards(title, content, max_cards)
        return {"proposals": proposals}

    def get_system_prompt(self) -> str:
        return """You are an Extractor agent for novel writing.

Your responsibility:
Extract key characters, locations, and concepts from Wiki pages and convert them into structured setting cards.

Core principles:
- Focus on information useful for creative writing (identity, appearance, personality, role).
- Ignore detailed plot summaries, episode lists, or trivia.
- Keep descriptions concise (2-5 sentences) but actionable.

Output Format:
- Generate JSON array of Card Proposals.
- Each proposal must have: name, type (Character/World), description, rationale.
"""

    async def extract_cards(self, title: str, content: str, max_cards: int = 20) -> List[CardProposal]:
        """Extract card proposals from Wiki content."""
        user_prompt = f"""Extract setting cards from the following Wiki page.

Page Title: {title}

Content:
{content[:15000]}...

Requirements:
- Extract the MOST IMPORTANT entities (characters, locations, organizations, concepts).
- Maximum {max_cards} cards.
- You MUST create BOTH Character AND World cards when possible.

TYPE CLASSIFICATION:
- Character: Any person, creature, or sentient being with a name.
- World: Any non-person entity (locations, organizations, concepts, artifacts, species).

For EACH card, provide:
- name: exact name
- type: Character | World
- description: concise, structured description that helps writing
- rationale: why it matters for the story
- confidence: 0.0-1.0

Output strict JSON array format:
[
  {{
    "name": "Character Name",
    "type": "Character",
    "description": "Identity, appearance, personality, role (2-5 sentences)",
    "rationale": "Why important for writing",
    "confidence": 0.9
  }}
]

Output JSON ONLY. No markdown, no commentary.
"""

        messages = self.build_messages(
            system_prompt=self.get_system_prompt(),
            user_prompt=user_prompt,
        )

        response = await self.call_llm(messages)

        proposals = []
        try:
            clean_resp = response
            if "```json" in response:
                clean_resp = response.split("```json")[1].split("```")[0]
            elif "```" in response:
                clean_resp = response.split("```")[1].split("```")[0]

            data = json.loads(clean_resp)
            for item in data:
                if not isinstance(item, dict):
                    continue
                if not item.get("name") or not item.get("type"):
                    continue
                confidence = item.get("confidence", 0.8)
                if confidence < 0.6:
                    continue
                proposals.append(CardProposal(**item))
        except Exception as exc:
            print(f"[ExtractorAgent] Failed to parse proposals: {exc}")
            print(f"Raw response: {response[:200]}...")

        return proposals
