"""
Context Selector
Selects context items for agent tasks.
"""

from typing import List, Dict, Any, Optional
from app.storage import CardStorage, CanonStorage, DraftStorage
from app.utils.chapter_id import ChapterIDValidator
from app.utils.logger import get_logger

logger = get_logger(__name__)


class ContextSelector:
    """Selects relevant context items based on task requirements."""

    def __init__(
        self,
        card_storage: CardStorage,
        canon_storage: CanonStorage,
        draft_storage: DraftStorage,
    ):
        self.card_storage = card_storage
        self.canon_storage = canon_storage
        self.draft_storage = draft_storage

    async def select_for_chapter(
        self,
        project_id: str,
        chapter: str,
        character_names: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Select all relevant context for a chapter."""
        context: Dict[str, Any] = {}

        context["style_card"] = await self.card_storage.get_style_card(project_id)

        if character_names:
            character_cards = []
            for name in character_names:
                card = await self.card_storage.get_character_card(project_id, name)
                if card:
                    character_cards.append(card)
            context["character_cards"] = character_cards
        else:
            char_names = await self.card_storage.list_character_cards(project_id)
            character_cards = []
            for name in char_names:
                card = await self.card_storage.get_character_card(project_id, name)
                if card:
                    character_cards.append(card)
            context["character_cards"] = character_cards

        world_card_names = await self.card_storage.list_world_cards(project_id)
        world_cards = []
        for name in world_card_names:
            card = await self.card_storage.get_world_card(project_id, name)
            if card:
                world_cards.append(card)
        context["world_cards"] = world_cards

        context["facts"] = await self.canon_storage.get_all_facts(project_id)
        context["timeline"] = await self.canon_storage.get_all_timeline_events(project_id)
        context["character_states"] = await self.canon_storage.get_all_character_states(project_id)

        context["previous_summaries"] = await self._load_previous_summaries(project_id, chapter)

        return context

    async def _load_previous_summaries(
        self,
        project_id: str,
        current_chapter: str,
        count: int = 3,
    ) -> List[Dict[str, Any]]:
        """Load summaries for previous chapters."""
        try:
            current_weight = ChapterIDValidator.calculate_weight(current_chapter)
        except Exception as exc:
            logger.warning(f"Failed to parse chapter {current_chapter}: {exc}")
            return []

        summaries = await self.draft_storage.list_chapter_summaries(project_id)
        summaries.sort(key=lambda s: ChapterIDValidator.calculate_weight(s.chapter))
        candidates = [s for s in summaries if ChapterIDValidator.calculate_weight(s.chapter) < current_weight]
        candidates = candidates[-count:]

        result = []
        for summary in candidates:
            result.append(
                {
                    "chapter": summary.chapter,
                    "title": summary.title,
                    "summary": summary.brief_summary,
                    "key_events": summary.key_events,
                }
            )
        return result

    def filter_by_relevance(self, items: List[Any], query: str, max_items: int = 10) -> List[Any]:
        """Filter items by simple recency when no scorer is available."""
        _ = query
        return items[-max_items:] if len(items) > max_items else items
