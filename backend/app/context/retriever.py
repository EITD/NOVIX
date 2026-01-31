"""
Dynamic context retriever.
"""

from typing import Any, Dict, List, Tuple

from app.utils.chapter_id import ChapterIDValidator


class DynamicContextRetriever:
    """Retrieve context by distance and budget, with cross-volume summaries."""

    MAX_CONTEXT_TOKENS = 100000
    TOKENS_PER_FACT_LIST = 250
    TOKENS_PER_CHAPTER_SUMMARY = 100
    TOKENS_PER_VOLUME_SUMMARY = 150
    TOKENS_PER_TITLE = 10

    LEVEL_FULL_FACTS = "full_facts"
    LEVEL_SUMMARY_WITH_EVENTS = "summary_events"
    LEVEL_SUMMARY_ONLY = "summary_only"
    LEVEL_TITLE_ONLY = "title_only"

    def __init__(self, storage):
        self.storage = storage

    async def retrieve_context(self, project_id: str, current_chapter: str) -> Dict[str, Any]:
        all_chapters = await self._get_all_previous_chapters(project_id, current_chapter)
        total_chapters = len(all_chapters)

        if total_chapters == 0:
            return {
                "full_facts": [],
                "summary_with_events": [],
                "summary_only": [],
                "title_only": [],
                "volume_summaries": [],
                "total_tokens": 0,
                "chapters_retrieved": 0,
            }

        ranges = self._calculate_dynamic_ranges(total_chapters)
        chapter_levels = self._assign_retrieval_levels(all_chapters, current_chapter, ranges)
        context = await self._retrieve_within_budget(project_id, chapter_levels, self.MAX_CONTEXT_TOKENS)

        volume_summaries = await self._retrieve_volume_summaries(project_id, current_chapter, context["total_tokens"])
        context["volume_summaries"] = volume_summaries["items"]
        context["total_tokens"] += volume_summaries["tokens"]
        return context

    def _calculate_dynamic_ranges(self, total_chapters: int) -> Dict[str, int]:
        if total_chapters <= 20:
            return {"full_facts": 2, "summary_events": 5, "summary_only": 10, "title_only": 20}
        if total_chapters <= 50:
            return {"full_facts": 2, "summary_events": 5, "summary_only": 15, "title_only": 50}
        if total_chapters <= 100:
            return {"full_facts": 3, "summary_events": 8, "summary_only": 25, "title_only": 100}
        if total_chapters <= 300:
            return {"full_facts": 3, "summary_events": 10, "summary_only": 40, "title_only": 300}
        return {"full_facts": 5, "summary_events": 15, "summary_only": 60, "title_only": total_chapters}

    def _assign_retrieval_levels(
        self,
        all_chapters: List[str],
        current_chapter: str,
        ranges: Dict[str, int],
    ) -> List[Tuple[str, str, int]]:
        result = []
        for chapter in all_chapters:
            distance = ChapterIDValidator.calculate_distance(current_chapter, chapter)
            if distance <= ranges["full_facts"]:
                level = self.LEVEL_FULL_FACTS
            elif distance <= ranges["summary_events"]:
                level = self.LEVEL_SUMMARY_WITH_EVENTS
            elif distance <= ranges["summary_only"]:
                level = self.LEVEL_SUMMARY_ONLY
            else:
                level = self.LEVEL_TITLE_ONLY
            result.append((chapter, level, distance))
        result.sort(key=lambda item: item[2])
        return result

    async def _retrieve_within_budget(
        self,
        project_id: str,
        chapter_levels: List[Tuple[str, str, int]],
        max_tokens: int,
    ) -> Dict[str, Any]:
        used_tokens = 0
        result = {
            "full_facts": [],
            "summary_with_events": [],
            "summary_only": [],
            "title_only": [],
            "volume_summaries": [],
            "total_tokens": 0,
            "chapters_retrieved": 0,
        }

        for chapter_id, level, _distance in chapter_levels:
            tokens_needed = self._estimate_tokens(level)
            if used_tokens + tokens_needed <= max_tokens:
                content = await self._retrieve_chapter_content(project_id, chapter_id, level)
                result[self._level_to_key(level)].append(content)
                used_tokens += tokens_needed
            else:
                downgraded = self._downgrade_level(level)
                tokens_needed = self._estimate_tokens(downgraded)
                if used_tokens + tokens_needed <= max_tokens:
                    content = await self._retrieve_chapter_content(project_id, chapter_id, downgraded)
                    result[self._level_to_key(downgraded)].append(content)
                    used_tokens += tokens_needed
                else:
                    content = await self._retrieve_chapter_content(project_id, chapter_id, self.LEVEL_TITLE_ONLY)
                    result["title_only"].append(content)
                    used_tokens += self.TOKENS_PER_TITLE
            result["chapters_retrieved"] += 1

        result["total_tokens"] = used_tokens
        return result

    async def _retrieve_volume_summaries(
        self,
        project_id: str,
        current_chapter: str,
        used_tokens: int,
    ) -> Dict[str, Any]:
        if not hasattr(self.storage, "list_volume_summaries"):
            return {"items": [], "tokens": 0}

        current_volume = ChapterIDValidator.extract_volume_id(current_chapter) or "V1"
        summaries = await self.storage.list_volume_summaries(project_id)
        items = []
        tokens = 0

        for summary in summaries:
            if summary.volume_id == current_volume:
                continue
            if used_tokens + tokens + self.TOKENS_PER_VOLUME_SUMMARY > self.MAX_CONTEXT_TOKENS:
                break
            items.append(
                {
                    "volume_id": summary.volume_id,
                    "brief_summary": summary.brief_summary,
                    "key_themes": summary.key_themes,
                    "major_events": summary.major_events,
                }
            )
            tokens += self.TOKENS_PER_VOLUME_SUMMARY

        return {"items": items, "tokens": tokens}

    def _downgrade_level(self, level: str) -> str:
        downgrade_map = {
            self.LEVEL_FULL_FACTS: self.LEVEL_SUMMARY_WITH_EVENTS,
            self.LEVEL_SUMMARY_WITH_EVENTS: self.LEVEL_SUMMARY_ONLY,
            self.LEVEL_SUMMARY_ONLY: self.LEVEL_TITLE_ONLY,
            self.LEVEL_TITLE_ONLY: self.LEVEL_TITLE_ONLY,
        }
        return downgrade_map.get(level, self.LEVEL_TITLE_ONLY)

    def _estimate_tokens(self, level: str) -> int:
        token_map = {
            self.LEVEL_FULL_FACTS: self.TOKENS_PER_FACT_LIST + self.TOKENS_PER_CHAPTER_SUMMARY,
            self.LEVEL_SUMMARY_WITH_EVENTS: self.TOKENS_PER_CHAPTER_SUMMARY,
            self.LEVEL_SUMMARY_ONLY: self.TOKENS_PER_CHAPTER_SUMMARY,
            self.LEVEL_TITLE_ONLY: self.TOKENS_PER_TITLE,
        }
        return token_map.get(level, self.TOKENS_PER_TITLE)

    def _level_to_key(self, level: str) -> str:
        key_map = {
            self.LEVEL_FULL_FACTS: "full_facts",
            self.LEVEL_SUMMARY_WITH_EVENTS: "summary_with_events",
            self.LEVEL_SUMMARY_ONLY: "summary_only",
            self.LEVEL_TITLE_ONLY: "title_only",
        }
        return key_map.get(level, "title_only")

    async def _retrieve_chapter_content(
        self,
        project_id: str,
        chapter_id: str,
        level: str,
    ) -> Dict[str, Any]:
        summary = await self.storage.get_chapter_summary(project_id, chapter_id)
        if not summary:
            return {"chapter": chapter_id, "title": chapter_id, "content": "", "level": level}

        content: Dict[str, Any] = {
            "chapter": chapter_id,
            "title": summary.title,
            "level": level,
        }
        if level == self.LEVEL_FULL_FACTS:
            content["summary"] = summary.brief_summary
            content["key_events"] = summary.key_events
            content["open_loops"] = summary.open_loops
        elif level == self.LEVEL_SUMMARY_WITH_EVENTS:
            content["summary"] = summary.brief_summary
            content["key_events"] = summary.key_events
        elif level == self.LEVEL_SUMMARY_ONLY:
            content["summary"] = summary.brief_summary
        return content

    async def _get_all_previous_chapters(self, project_id: str, current_chapter: str) -> List[str]:
        all_chapters = await self.storage.list_chapters(project_id)
        all_chapters.sort(key=lambda ch: ChapterIDValidator.calculate_weight(ch))
        current_weight = ChapterIDValidator.calculate_weight(current_chapter)
        return [chapter for chapter in all_chapters if ChapterIDValidator.calculate_weight(chapter) < current_weight]
