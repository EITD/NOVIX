"""
Extractor Agent
Converts Wiki text into structured Card Proposals
"""

from typing import Dict, Any, List
from app.agents.base import BaseAgent
from app.prompts import EXTRACTOR_SYSTEM_PROMPT, extractor_cards_prompt
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
        return EXTRACTOR_SYSTEM_PROMPT

    async def extract_cards(self, title: str, content: str, max_cards: int = 20) -> List[CardProposal]:
        """Extract card proposals from Wiki content."""
        prompt = extractor_cards_prompt(title=title, content=content, max_cards=max_cards)

        messages = self.build_messages(
            system_prompt=prompt.system,
            user_prompt=prompt.user,
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
