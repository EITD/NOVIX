from typing import Dict, List, Any
import json
from app.schemas.draft import CardProposal
from app.llm_gateway.gateway import get_gateway
from app.prompts import BATCH_EXTRACTOR_SYSTEM_PROMPT, batch_extractor_user_prompt
from app.utils.logger import get_logger

logger = get_logger(__name__)


class BatchExtractorAgent:
    """Agent for high-speed batch extraction."""

    def __init__(self, agent_id: str, config: Dict[str, Any]):
        self.agent_id = agent_id
        self.config = config

    async def execute(self, project_id: str, chapter: str, context: Dict[str, Any]) -> List[CardProposal]:
        pages_data = context.get('pages_data', [])
        if not pages_data:
            return []

        if len(pages_data) > 60:
            pages_data = pages_data[:60]

        compressed_data = []
        for p in pages_data:
            if not p.get('success'):
                continue
            compressed_data.append({
                'source': p.get('title'),
                'info': p.get('infobox', {}),
                'desc': p.get('sections', {}),
                'intro': p.get('summary', '')[:300]
            })

        if not compressed_data:
            return []

        json_payload = json.dumps(compressed_data, ensure_ascii=False)

        messages = [
            {"role": "system", "content": self.get_system_prompt()},
            {"role": "user", "content": batch_extractor_user_prompt(json_payload)},
        ]

        try:
            gateway = get_gateway()
            result = await gateway.chat(
                messages=messages,
                provider=self.config.get('provider'),
                temperature=0.3,
                max_tokens=4000
            )

            response = result.get('content', '') if isinstance(result, dict) else str(result)
            clean_resp = self._clean_json_response(response)
            data = json.loads(clean_resp)

            proposals = []
            for item in data:
                if not isinstance(item, dict):
                    continue
                if not item.get('name'):
                    continue
                if not item.get('type'):
                    item['type'] = 'Character'
                proposals.append(CardProposal(**item))

            return proposals
        except Exception as e:
            logger.error(f"Batch extraction failed: {e}", exc_info=True)
            return []

    def _clean_json_response(self, response: str) -> str:
        if not response:
            return "[]"
        response = response.strip()
        if response.startswith("```"):
            lines = response.split("\n")
            lines = [l for l in lines if not l.startswith("```")]
            response = "\n".join(lines)

        start = response.find("[")
        end = response.rfind("]") + 1
        if start >= 0 and end > start:
            return response[start:end]
        return "[]"

    def get_system_prompt(self) -> str:
        return BATCH_EXTRACTOR_SYSTEM_PROMPT
