"""
Context select engine.
"""

from typing import List, Optional, Dict, Any
import numpy as np
from .models import ContextItem, ContextPriority, ContextType


class ContextSelectEngine:
    """Selects relevant context items."""

    def __init__(self, embeddings_service=None):
        self.embeddings = embeddings_service

    async def deterministic_select(self, project_id: str, agent_name: str, storage: Any) -> List[ContextItem]:
        items = []
        always_load_map = {
            "archivist": ["style_card"],
            "writer": ["style_card", "scene_brief"],
            "editor": ["style_card"],
        }

        item_types = always_load_map.get(agent_name, [])
        for item_type in item_types:
            item = await self._load_item(project_id, item_type, storage)
            if item:
                item.priority = ContextPriority.CRITICAL
                items.append(item)
        return items

    async def _load_item(self, project_id: str, item_type: str, storage: Any) -> Optional[ContextItem]:
        try:
            if item_type == "style_card":
                card = await storage.get_style_card(project_id)
                if card:
                    return ContextItem(
                        id="style_card",
                        type=ContextType.STYLE_CARD,
                        content=self._format_card(card),
                        priority=ContextPriority.CRITICAL,
                    )
        except Exception as exc:
            print(f"Error loading {item_type}: {exc}")
        return None

    def _format_card(self, card: Dict[str, Any]) -> str:
        if isinstance(card, dict):
            return "\n".join(f"{k}: {v}" for k, v in card.items() if v)
        return str(card)

    async def retrieval_select(
        self,
        project_id: str,
        query: str,
        item_types: List[str],
        storage: Any,
        top_k: int = 5,
    ) -> List[ContextItem]:
        all_candidates: List[ContextItem] = []
        for item_type in item_types:
            if item_type == "text_chunk":
                chunks = await self._search_text_chunks(project_id, query, storage, top_k)
                all_candidates.extend(chunks)
                continue
            candidates = await self._get_candidates(project_id, item_type, storage)
            all_candidates.extend(candidates)

        if not all_candidates:
            return []

        if not self.embeddings:
            self._assign_simple_scores(query, all_candidates)
            all_candidates.sort(key=lambda x: x.relevance_score, reverse=True)
            return all_candidates[:top_k]

        query_embedding = await self.embeddings.encode(query)
        for item in all_candidates:
            item_embedding = await self.embeddings.encode(item.content)
            item.relevance_score = self._cosine_similarity(query_embedding, item_embedding)

        all_candidates.sort(key=lambda x: x.relevance_score, reverse=True)
        return all_candidates[:top_k]

    async def _get_candidates(self, project_id: str, item_type: str, storage: Any) -> List[ContextItem]:
        candidates: List[ContextItem] = []
        try:
            if item_type == "character":
                names = await storage.list_character_cards(project_id)
                for name in names:
                    card = await storage.get_character_card(project_id, name)
                    if card:
                        candidates.append(
                            ContextItem(
                                id=f"char_{name}",
                                type=ContextType.CHARACTER_CARD,
                                content=self._format_card(card),
                                priority=ContextPriority.MEDIUM,
                            )
                        )
            elif item_type == "world":
                names = await storage.list_world_cards(project_id)
                for name in names:
                    card = await storage.get_world_card(project_id, name)
                    if card:
                        candidates.append(
                            ContextItem(
                                id=f"world_{name}",
                                type=ContextType.WORLD_CARD,
                                content=self._format_card(card),
                                priority=ContextPriority.MEDIUM,
                            )
                        )
            elif item_type == "fact":
                facts = await storage.get_all_facts(project_id)
                for i, fact in enumerate(facts):
                    candidates.append(
                        ContextItem(
                            id=f"fact_{i}",
                            type=ContextType.FACT,
                            content=str(fact),
                            priority=ContextPriority.LOW,
                        )
                    )
        except Exception as exc:
            print(f"Error getting candidates for {item_type}: {exc}")

        return candidates

    def _assign_simple_scores(self, query: str, candidates: List[ContextItem]) -> None:
        query_lower = query.lower()
        query_words = query_lower.split()
        for item in candidates:
            if item.relevance_score and item.relevance_score > 0:
                continue
            content_lower = item.content.lower()
            overlap = sum(1 for word in query_words if word and word in content_lower)
            item.relevance_score = overlap / max(len(query_words), 1)

    async def _search_text_chunks(
        self,
        project_id: str,
        query: str,
        storage: Any,
        top_k: int,
    ) -> List[ContextItem]:
        if not hasattr(storage, "search_text_chunks"):
            return []
        results = await storage.search_text_chunks(project_id, query, limit=top_k)
        items: List[ContextItem] = []
        for result in results:
            content = result.get("text") or ""
            source = result.get("source") or {}
            items.append(
                ContextItem(
                    id=result.get("id") or "text_chunk",
                    type=ContextType.TEXT_CHUNK,
                    content=content,
                    priority=ContextPriority.LOW,
                    relevance_score=float(result.get("score") or 0),
                    metadata={"source": source, "chapter": source.get("chapter")},
                )
            )
        return items

    def _cosine_similarity(self, vec1: np.ndarray, vec2: np.ndarray) -> float:
        dot_product = np.dot(vec1, vec2)
        norm1 = np.linalg.norm(vec1)
        norm2 = np.linalg.norm(vec2)
        if norm1 == 0 or norm2 == 0:
            return 0.0
        return float(dot_product / (norm1 * norm2))
