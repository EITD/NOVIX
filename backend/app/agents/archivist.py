"""
Archivist Agent
Manages canon data and generates scene briefs and summaries.
"""

import json
import re
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import yaml

from app.agents.base import BaseAgent
from app.schemas.canon import Fact, TimelineEvent, CharacterState
from app.schemas.draft import SceneBrief, ChapterSummary, CardProposal
from app.schemas.volume import VolumeSummary
from app.prompts import (
    ARCHIVIST_SYSTEM_PROMPT,
    FANFICTION_CARD_REPAIR_HINT_ENRICH_DESCRIPTION,
    FANFICTION_CARD_REPAIR_HINT_STRICT_JSON,
    archivist_canon_updates_prompt,
    archivist_chapter_summary_prompt,
    archivist_focus_characters_binding_prompt,
    archivist_fanfiction_card_prompt,
    archivist_fanfiction_card_repair_prompt,
    archivist_style_profile_prompt,
    archivist_volume_summary_prompt,
)
from app.services.llm_config_service import llm_config_service
from app.utils.chapter_id import ChapterIDValidator, normalize_chapter_id
from app.utils.logger import get_logger

logger = get_logger(__name__)


class ArchivistAgent(BaseAgent):
    """Agent responsible for canon management and summaries."""

    MAX_CHARACTERS = 5
    MAX_WORLD_CONSTRAINTS = 5
    MAX_FACTS = 5

    STOPWORDS = {
        "的", "了", "在", "与", "和", "但", "而", "并", "及", "或", "是", "有", "为", "为", "这", "那",
        "一个", "一些", "一种", "可以", "不会", "没有", "不是", "自己", "他们", "她们", "我们", "你们",
        "因为", "所以", "因此", "可能", "需要", "必须", "如果", "然后", "同时", "随着", "对于", "关于",
        "chapter", "goal", "title",
    }

    _SIMPLE_RELATION_FACT_RE = re.compile(
        r"^(.{1,12})是(.{1,16})的(母亲|父亲|儿子|女儿|哥哥|姐姐|弟弟|妹妹|妻子|丈夫|恋人|朋友|同学|老师|学生|主人|仆人)[。.!?？]*$"
    )
    _FACT_DENSITY_HINTS = (
        "规则", "禁忌", "代价", "必须", "不允许", "禁止", "承诺", "约定", "隐瞒", "秘密", "交易", "交换", "契约",
        "决定", "发现", "暴露", "背叛", "威胁", "受伤", "病", "死亡", "失踪", "获得", "丢失", "准备", "购买",
        "居住", "搬", "上学", "教育", "监护", "占有", "依赖", "恐惧", "愧疚", "同情", "惆怅",
    )

    def _normalize_fact_statement(self, statement: str) -> str:
        text = str(statement or "").strip()
        text = re.sub(r"\s+", "", text)
        text = text.strip("。．.！!?？")
        return text

    def _is_simple_relation_fact(self, statement: str) -> bool:
        text = self._normalize_fact_statement(statement)
        return bool(self._SIMPLE_RELATION_FACT_RE.match(text))

    def _score_fact_statement(self, statement: str) -> float:
        text = str(statement or "").strip()
        if not text:
            return 0.0

        score = 0.0
        score += min(len(text) / 18.0, 2.0)
        if any(p in text for p in ("，", "；", "：", "（", "）", "(", ")")):
            score += 0.7
        if re.search(r"\d", text):
            score += 0.3
        if any(h in text for h in self._FACT_DENSITY_HINTS):
            score += 0.8
        if self._is_simple_relation_fact(text):
            score -= 0.6
        return score

    def _select_high_value_facts(
        self,
        candidates: List[Tuple[str, float]],
        existing_statements: Optional[List[str]] = None,
        limit: int = 5,
    ) -> List[Tuple[str, float]]:
        existing_norm = {self._normalize_fact_statement(s) for s in (existing_statements or []) if str(s or "").strip()}

        uniq: List[Tuple[str, float]] = []
        seen = set(existing_norm)
        for raw_statement, confidence in candidates or []:
            statement = str(raw_statement or "").strip()
            if not statement:
                continue
            normalized = self._normalize_fact_statement(statement)
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            uniq.append((statement, float(confidence)))

        scored = [
            {
                "statement": statement,
                "confidence": max(0.0, min(1.0, float(confidence))),
                "score": self._score_fact_statement(statement),
                "simple_relation": self._is_simple_relation_fact(statement),
            }
            for statement, confidence in uniq
            if len(str(statement or "").strip()) >= 6
        ]
        scored.sort(key=lambda x: (-x["score"], -len(x["statement"]), x["statement"]))

        primary = [item for item in scored if not item["simple_relation"]]
        secondary = [item for item in scored if item["simple_relation"]]

        selected: List[Dict[str, Any]] = []
        for item in primary:
            selected.append(item)
            if len(selected) >= int(limit):
                break

        if len(selected) < int(limit):
            max_rel = 1 if any(not s["simple_relation"] for s in selected) else int(limit)
            rel_used = 0
            for item in secondary:
                if rel_used >= max_rel:
                    break
                selected.append(item)
                rel_used += 1
                if len(selected) >= int(limit):
                    break

        return [(item["statement"], item["confidence"]) for item in selected[: int(limit)]]

    def get_agent_name(self) -> str:
        return "archivist"

    def get_system_prompt(self) -> str:
        return ARCHIVIST_SYSTEM_PROMPT

    async def execute(self, project_id: str, chapter: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """Generate a scene brief for a chapter using algorithmic context."""
        style_card = await self.card_storage.get_style_card(project_id)

        chapter_id = normalize_chapter_id(chapter) or chapter
        chapter_title = context.get("chapter_title", "")
        chapter_goal = context.get("chapter_goal", "")

        recent_chapters = await self._get_previous_chapters(project_id, chapter_id, limit=5)
        recent_fact_chapters = recent_chapters[-2:]
        summary_chapters = recent_chapters[:-2]

        summary_blocks = await self._build_summary_blocks(project_id, summary_chapters)
        timeline_events = await self.canon_storage.get_timeline_events_near_chapter(
            project_id=project_id,
            chapter=chapter_id,
            window=3,
            max_events=10,
        )

        instruction_text = " ".join([chapter_title, chapter_goal])
        keywords = self._extract_keywords(" ".join([instruction_text] + summary_blocks))

        chapter_texts = await self._load_chapter_texts(project_id, recent_fact_chapters)
        mentioned_characters = await self._extract_mentions_from_texts(
            project_id=project_id,
            texts=chapter_texts,
            card_type="character",
        )
        mentioned_worlds = await self._extract_mentions_from_texts(
            project_id=project_id,
            texts=chapter_texts,
            card_type="world",
        )

        instruction_characters = await self._extract_mentions_from_texts(
            project_id=project_id,
            texts=[instruction_text],
            card_type="character",
        )
        instruction_worlds = await self._extract_mentions_from_texts(
            project_id=project_id,
            texts=[instruction_text],
            card_type="world",
        )

        character_names = context.get("characters", []) or []
        selected_character_names = self._merge_unique(
            mentioned_characters,
            instruction_characters,
            character_names,
        )
        characters = await self._build_character_context(project_id, selected_character_names)

        world_names = self._merge_unique(mentioned_worlds, instruction_worlds)
        world_constraints = await self._build_world_constraints_from_names(project_id, world_names)

        facts = await self._collect_facts_for_chapters(project_id, recent_fact_chapters)
        extra_facts = await self._select_facts_by_instruction(
            project_id=project_id,
            keywords=keywords,
            exclude_ids={fact.get("id") for fact in facts if fact.get("id")},
            max_extra=5,
        )
        facts.extend(extra_facts)

        style_reminder = self._build_style_reminder(style_card)
        timeline_context = self._build_timeline_context_from_summaries(
            chapter_goal=chapter_goal,
            summaries=summary_blocks,
            fallback_events=timeline_events,
        )

        scene_brief = SceneBrief(
            chapter=chapter_id,
            title=chapter_title or f"Chapter {chapter_id}",
            goal=chapter_goal,
            characters=characters,
            timeline_context=timeline_context,
            world_constraints=world_constraints,
            facts=[fact.get("statement") for fact in facts if fact.get("statement")],
            style_reminder=style_reminder,
            forbidden=[],
        )

        await self.draft_storage.save_scene_brief(project_id, chapter_id, scene_brief)

        return {
            "success": True,
            "scene_brief": scene_brief,
            "conflicts": [],
        }

    async def _build_character_context(self, project_id: str, names: List[str]) -> List[Dict[str, str]]:
        characters = []
        for name in names:
            card = await self.card_storage.get_character_card(project_id, name)
            if not card:
                continue
            traits = card.description
            characters.append(
                {
                    "name": card.name,
                    "relevant_traits": traits,
                }
            )
        return characters

    def _build_timeline_context_from_summaries(
        self,
        chapter_goal: str,
        summaries: List[str],
        fallback_events: List[Any],
    ) -> Dict[str, str]:
        before = summaries[-1] if summaries else ""
        if not before and fallback_events:
            event = fallback_events[-1]
            before = f"{event.time}: {event.event} @ {event.location}"
        return {
            "before": before,
            "current": chapter_goal,
            "after": "",
        }

    def _extract_participants(self, events: List[Any]) -> List[str]:
        names = []
        for event in events:
            participants = getattr(event, "participants", []) or []
            for name in participants:
                if name and name not in names:
                    names.append(name)
        return names

    async def _build_world_constraints(self, project_id: str, limit: int) -> List[str]:
        constraints = []
        names = await self.card_storage.list_world_cards(project_id)
        for name in names[:limit]:
            card = await self.card_storage.get_world_card(project_id, name)
            if not card:
                continue
            if card.description:
                constraints.append(f"{card.name}: {card.description}")
        return constraints

    def _extract_keywords(self, text: str) -> List[str]:
        if not text:
            return []
        candidates = re.findall(r"[A-Za-z0-9]{2,}|[\u4e00-\u9fff]{2,}", text)
        keywords = []
        for token in candidates:
            if token in self.STOPWORDS:
                continue
            if token not in keywords:
                keywords.append(token)
        return keywords

    def _score_text_match(self, text: str, keywords: List[str]) -> int:
        if not text or not keywords:
            return 0
        score = 0
        for kw in keywords:
            if kw and kw in text:
                score += 1
        return score

    async def _get_previous_chapters(
        self,
        project_id: str,
        current_chapter: str,
        limit: int,
    ) -> List[str]:
        limit = max(int(limit or 0), 0)
        if limit <= 0:
            return []

        chapters = await self.draft_storage.list_chapters(project_id)
        if not chapters:
            return []

        canonical_current = str(current_chapter or "").strip()
        if canonical_current in chapters:
            index = chapters.index(canonical_current)
            return chapters[max(0, index - limit) : index]

        # 当前章节尚未创建：退化为权重比较，但保持 chapters 的既有顺序（包含自定义排序）。
        try:
            current_weight = ChapterIDValidator.calculate_weight(canonical_current)
        except Exception:
            return chapters[max(0, len(chapters) - limit) :]
        if current_weight <= 0:
            return chapters[max(0, len(chapters) - limit) :]
        previous = [ch for ch in chapters if ChapterIDValidator.calculate_weight(ch) < current_weight]
        return previous[max(0, len(previous) - limit) :]

    async def _build_summary_blocks(self, project_id: str, chapters: List[str]) -> List[str]:
        blocks: List[str] = []
        for ch in chapters:
            summary = await self.draft_storage.get_chapter_summary(project_id, ch)
            if not summary:
                continue
            title = summary.title or ch
            brief = summary.brief_summary or ""
            blocks.append(f"{ch}: {title}\n{brief}".strip())
        return blocks

    async def _load_chapter_texts(self, project_id: str, chapters: List[str]) -> List[str]:
        texts = []
        for ch in chapters:
            final = await self.draft_storage.get_final_draft(project_id, ch)
            if final:
                texts.append(final)
                continue
            versions = await self.draft_storage.list_draft_versions(project_id, ch)
            if not versions:
                texts.append("")
                continue
            latest = versions[-1]
            draft = await self.draft_storage.get_draft(project_id, ch, latest)
            texts.append(draft.content if draft else "")
        return texts

    async def _extract_mentions_from_texts(
        self,
        project_id: str,
        texts: List[str],
        card_type: str,
    ) -> List[str]:
        names = []
        if card_type == "character":
            names = await self.card_storage.list_character_cards(project_id)
        elif card_type == "world":
            names = await self.card_storage.list_world_cards(project_id)
        if not names:
            return []

        mentioned = []
        for name in names:
            for text in texts:
                if name and text and name in text:
                    mentioned.append(name)
                    break
        return mentioned

    def _merge_unique(self, *groups: List[str]) -> List[str]:
        merged: List[str] = []
        for group in groups:
            for name in group or []:
                if name and name not in merged:
                    merged.append(name)
        return merged

    async def _build_world_constraints_from_names(
        self,
        project_id: str,
        names: List[str],
    ) -> List[str]:
        constraints = []
        for name in names:
            card = await self.card_storage.get_world_card(project_id, name)
            if not card:
                continue
            description = card.description or ""
            constraints.append(f"{card.name}: {description}".strip())
        return constraints

    async def _collect_facts_for_chapters(
        self,
        project_id: str,
        chapters: List[str],
    ) -> List[Dict[str, Any]]:
        if not chapters:
            return []
        chapter_set = {normalize_chapter_id(ch) for ch in chapters if ch}
        facts = await self.canon_storage.get_all_facts_raw(project_id)
        selected = []
        for fact in facts:
            raw_chapter = fact.get("introduced_in") or fact.get("source") or ""
            fact_chapter = normalize_chapter_id(raw_chapter)
            if fact_chapter in chapter_set:
                selected.append(fact)
        return selected

    async def _select_facts_by_instruction(
        self,
        project_id: str,
        keywords: List[str],
        exclude_ids: set,
        max_extra: int,
    ) -> List[Dict[str, Any]]:
        if not keywords:
            return []
        facts = await self.canon_storage.get_all_facts_raw(project_id)
        scored: List[Tuple[int, Dict[str, Any]]] = []
        for fact in facts:
            if fact.get("id") in exclude_ids:
                continue
            statement = str(fact.get("statement") or fact.get("content") or "")
            score = self._score_text_match(statement, keywords)
            if score > 0:
                scored.append((score, fact))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [fact for _, fact in scored[:max_extra]]

    async def _select_character_names(
        self,
        project_id: str,
        chapter_id: str,
        keywords: List[str],
        explicit_names: List[str],
        timeline_events: List[Any],
    ) -> List[str]:
        names = await self.card_storage.list_character_cards(project_id)
        name_scores: Dict[str, int] = {}
        explicit_set = [n for n in explicit_names if n]
        for name in explicit_set:
            name_scores[name] = name_scores.get(name, 0) + 100

        for event in timeline_events or []:
            for name in getattr(event, "participants", []) or []:
                if name:
                    name_scores[name] = name_scores.get(name, 0) + 10

        for name in names:
            score = 0
            if name in keywords:
                score += 5
            score += self._score_text_match(name, keywords)
            if score > 0:
                name_scores[name] = max(name_scores.get(name, 0), score)

        ranked = sorted(name_scores.items(), key=lambda x: x[1], reverse=True)
        selected = [name for name, _ in ranked][: self.MAX_CHARACTERS]
        return selected

    async def _select_relevant_facts(
        self,
        project_id: str,
        chapter_id: str,
        keywords: List[str],
    ) -> List[Dict[str, Any]]:
        all_facts = await self.canon_storage.get_all_facts_raw(project_id)
        if not all_facts:
            return []

        parsed_current = ChapterIDValidator.parse(chapter_id)
        previous_same_volume: Optional[str] = None
        if parsed_current and parsed_current.get("volume") and parsed_current.get("chapter") is not None:
            chapters = await self.draft_storage.list_chapters(project_id)
            candidates = []
            for ch in chapters:
                parsed = ChapterIDValidator.parse(ch)
                if not parsed or parsed.get("volume") != parsed_current.get("volume"):
                    continue
                if parsed.get("chapter", 0) < parsed_current.get("chapter", 0):
                    candidates.append((parsed.get("chapter", 0), ch))
            if candidates:
                previous_same_volume = max(candidates, key=lambda x: x[0])[1]

        selected: List[Dict[str, Any]] = []
        remaining = []

        for fact in all_facts:
            fact_chapter = normalize_chapter_id(
                fact.get("introduced_in") or fact.get("source") or ""
            )
            if previous_same_volume and fact_chapter == previous_same_volume:
                selected.append(fact)
            else:
                remaining.append(fact)

        if len(selected) < self.MAX_FACTS:
            scored: List[Tuple[int, Dict[str, Any]]] = []
            for fact in remaining:
                statement = str(fact.get("statement") or fact.get("content") or "")
                fact_chapter = normalize_chapter_id(
                    fact.get("introduced_in") or fact.get("source") or ""
                )
                dist = ChapterIDValidator.calculate_distance(chapter_id, fact_chapter) if fact_chapter else 999
                recency = max(0, 10 - min(dist, 10))
                match = self._score_text_match(statement, keywords) * 2
                score = recency + match
                if score > 0:
                    scored.append((score, fact))
            scored.sort(key=lambda x: x[0], reverse=True)
            for _, fact in scored:
                if len(selected) >= self.MAX_FACTS:
                    break
                selected.append(fact)

        return selected[: self.MAX_FACTS]

    async def _select_world_constraints(
        self,
        project_id: str,
        keywords: List[str],
        facts: List[Dict[str, Any]],
        summaries: List[str],
    ) -> List[str]:
        names = await self.card_storage.list_world_cards(project_id)
        if not names:
            return []

        facts_text = " ".join([str(f.get("statement") or "") for f in facts])
        summary_text = " ".join(summaries)
        combined = " ".join([facts_text, summary_text])
        combined_keywords = list(dict.fromkeys(keywords + self._extract_keywords(combined)))

        scored: List[Tuple[int, str]] = []
        for name in names:
            card = await self.card_storage.get_world_card(project_id, name)
            if not card:
                continue
            text = f"{card.name} {card.description or ''}"
            score = 0
            if card.name and card.name in combined:
                score += 5
            score += self._score_text_match(text, combined_keywords)
            if score > 0:
                scored.append((score, f"{card.name}: {card.description or ''}".strip()))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [item for _, item in scored][: self.MAX_WORLD_CONSTRAINTS]

    def _build_style_reminder(self, style_card: Any) -> str:
        if not style_card:
            return ""
        style_text = getattr(style_card, "style", "") or ""
        return style_text.strip()



    async def detect_setting_changes(self, draft_content: str, existing_card_names: List[str]) -> List[CardProposal]:
        """Detect potential new setting cards with pure heuristics (no LLM)."""
        existing = {name for name in (existing_card_names or []) if name}
        proposals: List[CardProposal] = []

        text = draft_content or ""
        if not text.strip():
            return proposals

        sentences = self._split_sentences(text)

        world_candidates = self._extract_world_candidates(text)
        character_candidates = self._extract_character_candidates(text)

        proposals.extend(
            self._build_card_proposals(
                candidates=world_candidates,
                card_type="World",
                existing=existing,
                sentences=sentences,
                min_count=2,
            )
        )
        proposals.extend(
            self._build_card_proposals(
                candidates=character_candidates,
                card_type="Character",
                existing=existing,
                sentences=sentences,
                min_count=1,
            )
        )

        return proposals

    def _split_sentences(self, text: str) -> List[str]:
        parts = re.split(r"[。！？\\n]", text)
        return [p.strip() for p in parts if p.strip()]

    def _extract_world_candidates(self, text: str) -> Dict[str, int]:
        suffixes = "帮|派|门|宗|城|山|谷|镇|村|府|馆|寺|庙|观|宫|殿|岛|关|寨|营|会|国|州|郡|湾|湖|河"
        pattern = re.compile(rf"([\\u4e00-\\u9fff]{{2,8}}(?:{suffixes}))")
        counts: Dict[str, int] = {}
        for match in pattern.findall(text):
            counts[match] = counts.get(match, 0) + 1
        return counts

    def _extract_character_candidates(self, text: str) -> Dict[str, int]:
        counts: Dict[str, int] = {}
        if not text:
            return counts

        say_pattern = re.compile(r"([\\u4e00-\\u9fff]{2,3})(?:\\s*)(?:说道|问道|答道|笑道|喝道|低声道|沉声道|道)")
        action_verbs = "走|看|望|想|叹|笑|皱|点头|摇头|转身|停下|沉默|开口|伸手|拔剑|抬眼"
        action_pattern = re.compile(rf"([\\u4e00-\\u9fff]{{2,3}})(?:\\s*)(?:{action_verbs})")

        for match in say_pattern.findall(text):
            if match in self.STOPWORDS:
                continue
            counts[match] = counts.get(match, 0) + 2

        for match in action_pattern.findall(text):
            if match in self.STOPWORDS:
                continue
            counts[match] = counts.get(match, 0) + 1

        return counts

    def _build_card_proposals(
        self,
        candidates: Dict[str, int],
        card_type: str,
        existing: set,
        sentences: List[str],
        min_count: int = 2,
    ) -> List[CardProposal]:
        proposals: List[CardProposal] = []
        for name, count in candidates.items():
            if not name or name in existing:
                continue
            if count < min_count:
                continue
            source_sentence = ""
            for sent in sentences:
                if name in sent:
                    source_sentence = sent
                    break
            if not source_sentence:
                continue
            confidence = min(0.9, 0.5 + 0.1 * min(count, 4))
            proposals.append(
                CardProposal(
                    name=name,
                    type=card_type,
                    description=source_sentence,
                    rationale=f"在本章中多次出现（{count} 次），具备可复用设定价值。",
                    source_text=source_sentence,
                    confidence=confidence,
                )
            )
        return proposals

    def _sample_text_for_style_profile(self, sample_text: str, max_chars: int = 20000) -> str:
        """
        采样文风提炼用的文本片段。

        目的：
        - 避免超长正文导致中段信息被截断
        - 让文风提炼同时“看到”开头/中段/结尾，提升稳定性
        """
        text = str(sample_text or "").strip()
        if not text:
            return ""
        if max_chars <= 0 or len(text) <= max_chars:
            return text

        head_len = int(max_chars * 0.35)
        tail_len = int(max_chars * 0.35)
        mid_len = max_chars - head_len - tail_len

        head = text[:head_len]
        tail = text[-tail_len:] if tail_len > 0 else ""

        mid_start = max(0, (len(text) // 2) - (mid_len // 2))
        mid = text[mid_start : mid_start + mid_len] if mid_len > 0 else ""

        parts = [p for p in [head, mid, tail] if p]
        return "\n\n……\n\n".join(parts)

    async def extract_style_profile(self, sample_text: str) -> str:
        """Extract writing style guidance from sample text."""
        provider = self.gateway.get_provider_for_agent(self.get_agent_name())
        if provider == "mock":
            return ""

        sampled = self._sample_text_for_style_profile(sample_text, max_chars=20000)
        prompt = archivist_style_profile_prompt(sample_text=sampled)
        messages = self.build_messages(
            system_prompt=prompt.system,
            user_prompt=prompt.user,
            context_items=None,
        )
        response = await self.call_llm(messages)
        return str(response or "").strip()

    async def extract_fanfiction_card(self, title: str, content: str) -> Dict[str, str]:
        """Extract a single card summary for fanfiction import."""
        clean_title = str(title or "").strip()
        clean_content = str(content or "").strip()
        if not clean_content:
            return {
                "name": clean_title or "Unknown",
                "type": self._infer_card_type_from_title(clean_title),
                "description": "",
            }

        prompt = archivist_fanfiction_card_prompt(title=clean_title, content=clean_content)

        provider_id = self.gateway.get_provider_for_agent(self.get_agent_name())
        profile = llm_config_service.get_profile_by_id(provider_id) or {}
        logger.info(
            "Fanfiction extraction using provider=%s model=%s content_chars=%s",
            provider_id,
            profile.get("model"),
            len(clean_content),
        )

        messages = self.build_messages(
            system_prompt=prompt.system,
            user_prompt=prompt.user,
            context_items=None,
        )

        max_attempts = 5
        last_description = ""
        last_length = 0
        for attempt in range(1, max_attempts + 1):
            response = await self.call_llm(messages, max_tokens=1400)
            logger.info("Fanfiction extraction response_chars=%s", len(response or ""))
            parsed = self._parse_json_object(response)
            if not self._is_valid_fanfiction_payload(parsed, clean_content):
                logger.info("Fanfiction extraction JSON parse failed, retrying with strict prompt")
                parsed = await self._extract_fanfiction_json_from_content(
                    clean_title,
                    clean_content,
                    hint=FANFICTION_CARD_REPAIR_HINT_STRICT_JSON,
                )

            if not self._is_valid_fanfiction_payload(parsed, clean_content):
                continue

            name = str(parsed.get("name") or clean_title or "Unknown").strip()
            card_type = str(parsed.get("type") or "").strip() or self._infer_card_type_from_title(name)
            description = self._sanitize_fanfiction_description(str(parsed.get("description") or "").strip())
            last_description = description
            last_length = len(description)

            if not description or self._is_copied_from_source(description, clean_content):
                parsed = await self._extract_fanfiction_json_from_content(
                    name,
                    clean_content,
                    hint=FANFICTION_CARD_REPAIR_HINT_ENRICH_DESCRIPTION,
                )
                if self._is_valid_fanfiction_payload(parsed, clean_content):
                    description = self._sanitize_fanfiction_description(str(parsed.get("description") or "").strip())
                    last_description = description
                    last_length = len(description)
                if not description or self._is_copied_from_source(description, clean_content):
                    continue

            if card_type not in {"Character", "World"}:
                card_type = self._infer_card_type_from_title(name)

            return {
                "name": name,
                "type": card_type,
                "description": description,
            }

        # 兜底：尝试从原文提取基础摘要
        fallback_desc = self._build_fanfiction_fallback(clean_title, clean_content)
        fallback_desc = self._sanitize_fanfiction_description(fallback_desc)
        if fallback_desc:
            return {
                "name": clean_title or "Unknown",
                "type": self._infer_card_type_from_title(clean_title),
                "description": fallback_desc,
            }
        raise ValueError(f"Fanfiction extraction failed: empty description (len={last_length})")

    async def _extract_fanfiction_json_from_content(
        self,
        title: str,
        content: str,
        hint: str = "",
    ) -> Dict[str, Any]:
        if not content:
            return {}
        prompt = archivist_fanfiction_card_repair_prompt(title=title, content=content, hint=hint)
        messages = self.build_messages(
            system_prompt=prompt.system,
            user_prompt=prompt.user,
            context_items=None,
        )
        response = await self.call_llm(messages, max_tokens=1200)
        return self._parse_json_object(response)

    

    def _is_valid_fanfiction_payload(self, payload: Dict[str, Any], source: str = "") -> bool:
        if not isinstance(payload, dict):
            return False
        name = str(payload.get("name") or "").strip()
        card_type = str(payload.get("type") or "").strip()
        description = str(payload.get("description") or "").strip()
        if not name or not description:
            return False
        if card_type not in {"Character", "World"}:
            return False
        if source and self._is_copied_from_source(description, source):
            return False
        return True

    def _is_copied_from_source(self, description: str, source: str = "") -> bool:
        if not description or not source:
            return False
        text = description.strip()
        if len(text) < 20:
            return False
        if text in source:
            return True
        window = 12
        hits = 0
        for i in range(0, len(text) - window + 1, 4):
            frag = text[i : i + window]
            if frag and frag in source:
                hits += 1
                if hits >= 2:
                    return True
        return False

    def _parse_json_object(self, text: str) -> Dict[str, Any]:
        if not text:
            return {}
        cleaned = text.strip()
        if "```" in cleaned:
            parts = cleaned.split("```")
            if len(parts) >= 2:
                cleaned = parts[1]
        cleaned = cleaned.strip()
        if cleaned.startswith("{") and cleaned.endswith("}"):
            try:
                return json.loads(cleaned)
            except Exception:
                return {}
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start >= 0 and end > start:
            try:
                return json.loads(cleaned[start : end + 1])
            except Exception:
                return {}
        return {}

    def _truncate_description(self, text: str, limit: int = 800) -> str:
        if not text:
            return ""
        clean = re.sub(r"\s+", " ", text).strip()
        if len(clean) <= limit:
            return clean
        return clean[:limit].rstrip()

    def _fallback_fanfiction_description(self, content: str) -> str:
        summary = ""
        summary_match = re.search(r"Summary:\s*(.+?)(?:\n\n|$)", content, re.IGNORECASE | re.DOTALL)
        if summary_match:
            summary = summary_match.group(1).strip()
        summary = self._sanitize_fanfiction_description(summary)
        if summary:
            return self._truncate_description(summary, limit=800)
        clean = re.sub(r"\s+", " ", content).strip()
        clean = self._sanitize_fanfiction_description(clean)
        return self._truncate_description(clean, limit=800)

    def _sanitize_fanfiction_description(self, text: str) -> str:
        if not text:
            return ""
        cleaned = text
        cleaned = re.sub(r"\bTitle:\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\bSummary:\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\bTable\s*\d*:\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\bRawText:\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*\|\s*", " ", cleaned)
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        # 去重相邻句子，减少重复
        sentences = re.split(r"(?<=[。！？!?.])", cleaned)
        deduped = []
        seen = set()
        for s in sentences:
            s = s.strip()
            if not s:
                continue
            key = s[:20]
            if key in seen:
                continue
            seen.add(key)
            deduped.append(s)
        result = "".join(deduped)
        return result


    def _extract_llm_section(self, content: str, label: str) -> str:
        if not content or not label:
            return ""
        pattern = re.compile(rf"{re.escape(label)}:\s*(.+?)(?:\n\n[A-Z][A-Za-z ]+:\s*|\Z)", re.DOTALL)
        match = pattern.search(content)
        return match.group(1).strip() if match else ""

    def _build_fanfiction_fallback(self, title: str, content: str) -> str:
        summary = self._extract_llm_section(content, "Summary")
        summary = self._sanitize_fanfiction_description(summary)
        if summary and len(summary) >= 60:
            return self._truncate_description(summary, limit=800)

        infobox = self._extract_llm_section(content, "Infobox")
        infobox = self._sanitize_fanfiction_description(infobox)
        info_lines = []
        if infobox:
            for line in infobox.split("\n"):
                line = line.strip("- ").strip()
                if not line:
                    continue
                key_lower = line.split(":")[0].lower() if ":" in line else line.lower()
                if any(k in key_lower for k in ["姓名", "本名", "别名", "身份", "职业", "性别", "所属", "阵营", "种族", "配音"]):
                    info_lines.append(line)
        if info_lines:
            combined = f"{title}，" + "，".join(info_lines)
            return self._truncate_description(self._sanitize_fanfiction_description(combined), limit=800)

        return self._fallback_fanfiction_description(content)

    def _infer_card_type_from_title(self, title: str) -> str:
        text = title or ""
        world_suffixes = (
            "城",
            "国",
            "派",
            "门",
            "宗",
            "山",
            "谷",
            "镇",
            "村",
            "府",
            "馆",
            "寺",
            "宫",
            "湖",
            "河",
            "岛",
            "大陆",
            "组织",
            "学院",
        )
        if any(text.endswith(suffix) for suffix in world_suffixes):
            return "World"
        return "Character"

    async def generate_chapter_summary(
        self,
        project_id: str,
        chapter: str,
        chapter_title: str,
        final_draft: str,
    ) -> ChapterSummary:
        """Generate a structured chapter summary."""
        provider = self.gateway.get_provider_for_agent(self.get_agent_name())
        if provider == "mock":
            return self._fallback_chapter_summary(chapter, chapter_title, final_draft)

        yaml_content = await self._generate_chapter_summary_yaml(
            chapter=chapter,
            chapter_title=chapter_title,
            final_draft=final_draft,
        )

        return self._parse_chapter_summary(yaml_content, chapter, chapter_title, final_draft)

    async def generate_volume_summary(
        self,
        project_id: str,
        volume_id: str,
        chapter_summaries: List[ChapterSummary],
    ) -> VolumeSummary:
        """Generate or refresh a volume summary."""
        chapter_count = len(chapter_summaries)
        provider = self.gateway.get_provider_for_agent(self.get_agent_name())

        if provider == "mock" or chapter_count == 0:
            return self._fallback_volume_summary(volume_id, chapter_summaries)

        yaml_content = await self._generate_volume_summary_yaml(volume_id, chapter_summaries)
        return self._parse_volume_summary(yaml_content, volume_id, chapter_summaries)

    async def extract_canon_updates(self, project_id: str, chapter: str, final_draft: str) -> Dict[str, Any]:
        """Extract canon updates from the final draft."""
        provider = self.gateway.get_provider_for_agent(self.get_agent_name())
        if provider == "mock":
            return {"facts": [], "timeline_events": [], "character_states": []}

        try:
            yaml_content = await self._generate_canon_updates_yaml(chapter=chapter, final_draft=final_draft)
            return await self._parse_canon_updates_yaml(
                project_id=project_id,
                chapter=chapter,
                yaml_content=yaml_content,
            )
        except Exception:
            return {"facts": [], "timeline_events": [], "character_states": []}

    async def bind_focus_characters(
        self,
        project_id: str,
        chapter: str,
        final_draft: str,
        limit: int = 5,
        max_candidates: int = 160,
    ) -> List[str]:
        """
        Bind focus characters for a chapter via LLM during sync.

        输出的是“重点角色（focus）”，用于后续检索 seeds 与 UI 展示。
        强约束：不允许隐式主角，必须在正文中出现姓名或别名才可绑定。
        """
        provider = self.gateway.get_provider_for_agent(self.get_agent_name())
        if provider == "mock":
            return []

        cleaned_text = str(final_draft or "")
        if not cleaned_text.strip():
            return []

        catalog = await self._build_focus_character_catalog(project_id, cleaned_text)
        if not catalog:
            return []

        prompt_candidates = catalog[:max_candidates]
        prompt = archivist_focus_characters_binding_prompt(
            chapter=chapter,
            candidates=prompt_candidates,
            final_draft=cleaned_text,
            limit=limit,
        )
        messages = self.build_messages(
            system_prompt=prompt.system,
            user_prompt=prompt.user,
            context_items=None,
        )
        response = await self.call_llm(messages)

        focus_from_llm = self._parse_focus_characters_yaml(response)
        focus_candidates = {item["name"]: item for item in prompt_candidates}
        focus_names = self._filter_explicit_mentions(
            cleaned_text,
            [name for name in focus_from_llm if name in focus_candidates],
            focus_candidates,
        )

        must_include = self._select_starred_mentions(catalog, cleaned_text, min_stars=3)
        selected: List[str] = []
        for name in must_include:
            if name not in selected:
                selected.append(name)
            if len(selected) >= limit:
                return selected[:limit]

        for name in focus_names:
            if name not in selected:
                selected.append(name)
            if len(selected) >= limit:
                return selected[:limit]

        # Fallback: explicit mentions sorted by (stars desc, mention_count desc)
        mentioned = [item for item in catalog if item.get("mention_count", 0) > 0]
        mentioned.sort(key=lambda x: (-int(x.get("stars") or 1), -int(x.get("mention_count") or 0), x.get("name") or ""))
        for item in mentioned:
            name = item.get("name") or ""
            if not name or name in selected:
                continue
            selected.append(name)
            if len(selected) >= limit:
                break

        return selected[:limit]

    async def _build_focus_character_catalog(self, project_id: str, text: str) -> List[Dict[str, Any]]:
        names = await self.card_storage.list_character_cards(project_id)
        catalog: List[Dict[str, Any]] = []
        if not names:
            return catalog

        for raw_name in names:
            raw_name = str(raw_name or "").strip()
            if not raw_name:
                continue
            card = await self.card_storage.get_character_card(project_id, raw_name)
            if not card:
                continue
            aliases = [str(a).strip() for a in (card.aliases or []) if str(a).strip()]
            tokens = list(dict.fromkeys([card.name] + aliases))
            mention_count = sum(text.count(token) for token in tokens if token)
            stars = card.stars if card.stars is not None else 1
            catalog.append(
                {
                    "name": card.name,
                    "aliases": aliases,
                    "stars": int(stars) if stars is not None else 1,
                    "mention_count": int(mention_count),
                }
            )

        # Prefer important + mentioned characters, but keep deterministic ordering.
        def sort_key(item: Dict[str, Any]):
            return (-int(item.get("stars") or 1), -int(item.get("mention_count") or 0), str(item.get("name") or ""))

        catalog.sort(key=sort_key)
        return catalog

    def _parse_focus_characters_yaml(self, response: str) -> List[str]:
        if not response:
            return []
        cleaned = str(response).strip()
        if "```" in cleaned:
            # Be tolerant: strip code fences if any.
            start = cleaned.find("```") + 3
            end = cleaned.rfind("```")
            if end > start:
                cleaned = cleaned[start:end].strip()
                if cleaned.lower().startswith("yaml"):
                    cleaned = cleaned[4:].strip()

        try:
            data = yaml.safe_load(cleaned) or {}
        except Exception:
            return []

        raw = data.get("focus_characters") or []
        result: List[str] = []
        for item in raw:
            if isinstance(item, str):
                name = item.strip()
            elif isinstance(item, dict):
                name = str(item.get("name") or item.get("character") or "").strip()
            else:
                name = str(item).strip()
            if name and name not in result:
                result.append(name)
        return result

    def _filter_explicit_mentions(
        self,
        text: str,
        names: List[str],
        candidates: Dict[str, Dict[str, Any]],
    ) -> List[str]:
        cleaned_text = text or ""
        result: List[str] = []
        for name in names or []:
            meta = candidates.get(name) or {}
            tokens = [name]
            tokens.extend(meta.get("aliases") or [])
            if any(token and token in cleaned_text for token in tokens):
                if name not in result:
                    result.append(name)
        return result

    def _select_starred_mentions(
        self,
        catalog: List[Dict[str, Any]],
        text: str,
        min_stars: int = 3,
    ) -> List[str]:
        cleaned_text = text or ""
        hits = []
        for item in catalog or []:
            stars = int(item.get("stars") or 1)
            if stars < min_stars:
                continue
            name = str(item.get("name") or "").strip()
            if not name:
                continue
            tokens = [name]
            tokens.extend(item.get("aliases") or [])
            if not any(token and token in cleaned_text for token in tokens):
                continue
            hits.append((int(item.get("mention_count") or 0), name))
        hits.sort(key=lambda x: (-x[0], x[1]))
        return [name for _count, name in hits]

    async def _generate_canon_updates_yaml(self, chapter: str, final_draft: str) -> str:
        """Generate canon updates YAML via LLM."""
        prompt = archivist_canon_updates_prompt(chapter=chapter, final_draft=final_draft)
        messages = self.build_messages(
            system_prompt=prompt.system,
            user_prompt=prompt.user,
            context_items=None,
        )
        response = await self.call_llm(messages)

        if "```yaml" in response:
            yaml_start = response.find("```yaml") + 7
            yaml_end = response.find("```", yaml_start)
            response = response[yaml_start:yaml_end].strip()
        elif "```" in response:
            yaml_start = response.find("```") + 3
            yaml_end = response.find("```", yaml_start)
            response = response[yaml_start:yaml_end].strip()

        return response

    async def _parse_canon_updates_yaml(
        self,
        project_id: str,
        chapter: str,
        yaml_content: str,
    ) -> Dict[str, Any]:
        """Parse canon update YAML."""
        data = yaml.safe_load(yaml_content) or {}

        existing_facts = await self.canon_storage.get_all_facts(project_id)
        next_fact_index = len(existing_facts) + 1

        raw_facts: List[Tuple[str, float]] = []
        for item in data.get("facts", []) or []:
            statement = ""
            confidence = 1.0
            if isinstance(item, str):
                statement = item
            elif isinstance(item, dict):
                statement = str(item.get("statement", "") or "")
                conf_raw = item.get("confidence")
                try:
                    confidence = float(conf_raw) if conf_raw is not None else 1.0
                except Exception:
                    confidence = 1.0

            if not statement.strip():
                continue
            raw_facts.append((statement.strip(), max(0.0, min(1.0, confidence))))

        selected_facts = self._select_high_value_facts(
            candidates=raw_facts,
            existing_statements=[f.statement for f in (existing_facts or []) if getattr(f, "statement", None)],
            limit=self.MAX_FACTS,
        )

        facts: List[Fact] = []
        for statement, confidence in selected_facts:
            fact_id = f"F{next_fact_index:04d}"
            next_fact_index += 1
            facts.append(
                Fact(
                    id=fact_id,
                    statement=statement.strip(),
                    source=chapter,
                    introduced_in=chapter,
                    confidence=max(0.0, min(1.0, float(confidence))),
                )
            )

        timeline_events: List[TimelineEvent] = []
        for item in data.get("timeline_events", []) or []:
            if not isinstance(item, dict):
                continue
            timeline_events.append(
                TimelineEvent(
                    time=str(item.get("time", "") or ""),
                    event=str(item.get("event", "") or ""),
                    participants=list(item.get("participants", []) or []),
                    location=str(item.get("location", "") or ""),
                    source=chapter,
                )
            )

        character_states: List[CharacterState] = []
        for item in data.get("character_states", []) or []:
            if not isinstance(item, dict):
                continue
            character = str(item.get("character", "") or "").strip()
            if not character:
                continue
            character_states.append(
                CharacterState(
                    character=character,
                    goals=list(item.get("goals", []) or []),
                    injuries=list(item.get("injuries", []) or []),
                    inventory=list(item.get("inventory", []) or []),
                    relationships=dict(item.get("relationships", {}) or {}),
                    location=item.get("location"),
                    emotional_state=item.get("emotional_state"),
                    last_seen=chapter,
                )
            )

        return {
            "facts": facts,
            "timeline_events": timeline_events,
            "character_states": character_states,
        }

    async def _generate_chapter_summary_yaml(
        self,
        chapter: str,
        chapter_title: str,
        final_draft: str,
    ) -> str:
        """Generate ChapterSummary YAML via LLM."""
        prompt = archivist_chapter_summary_prompt(
            chapter=chapter,
            chapter_title=chapter_title,
            final_draft=final_draft,
        )
        messages = self.build_messages(
            system_prompt=prompt.system,
            user_prompt=prompt.user,
            context_items=None,
        )

        response = await self.call_llm(messages)

        if "```yaml" in response:
            yaml_start = response.find("```yaml") + 7
            yaml_end = response.find("```", yaml_start)
            response = response[yaml_start:yaml_end].strip()
        elif "```" in response:
            yaml_start = response.find("```") + 3
            yaml_end = response.find("```", yaml_start)
            response = response[yaml_start:yaml_end].strip()

        return response

    async def _generate_volume_summary_yaml(
        self,
        volume_id: str,
        chapter_summaries: List[ChapterSummary],
    ) -> str:
        """Generate VolumeSummary YAML via LLM."""
        items = []
        for summary in chapter_summaries:
            items.append(
                {
                    "chapter": summary.chapter,
                    "title": summary.title,
                    "brief_summary": summary.brief_summary,
                    "key_events": summary.key_events,
                    "open_loops": summary.open_loops,
                }
            )

        prompt = archivist_volume_summary_prompt(volume_id=volume_id, chapter_items=items)
        messages = self.build_messages(
            system_prompt=prompt.system,
            user_prompt=prompt.user,
            context_items=None,
        )

        response = await self.call_llm(messages)

        if "```yaml" in response:
            yaml_start = response.find("```yaml") + 7
            yaml_end = response.find("```", yaml_start)
            response = response[yaml_start:yaml_end].strip()
        elif "```" in response:
            yaml_start = response.find("```") + 3
            yaml_end = response.find("```", yaml_start)
            response = response[yaml_start:yaml_end].strip()

        return response

    def _parse_volume_summary(
        self,
        yaml_content: str,
        volume_id: str,
        chapter_summaries: List[ChapterSummary],
    ) -> VolumeSummary:
        """Parse YAML into a VolumeSummary."""
        try:
            data = yaml.safe_load(yaml_content) or {}
            data["volume_id"] = volume_id
            data.setdefault("brief_summary", "")
            data.setdefault("key_themes", [])
            data.setdefault("major_events", [])
            data["chapter_count"] = len(chapter_summaries)
            data.setdefault("created_at", datetime.now())
            data["updated_at"] = datetime.now()
            return VolumeSummary(**data)
        except Exception:
            return self._fallback_volume_summary(volume_id, chapter_summaries)

    def _fallback_volume_summary(
        self,
        volume_id: str,
        chapter_summaries: List[ChapterSummary],
    ) -> VolumeSummary:
        """Fallback volume summary without LLM."""
        brief_parts = [s.brief_summary for s in chapter_summaries if s.brief_summary]
        brief_summary = " ".join(brief_parts)[:800]
        events = []
        for summary in chapter_summaries:
            events.extend(summary.key_events or [])
        major_events = list(dict.fromkeys([e for e in events if e]))[:20]

        return VolumeSummary(
            volume_id=volume_id,
            brief_summary=brief_summary,
            key_themes=[],
            major_events=major_events,
            chapter_count=len(chapter_summaries),
        )

    def _parse_chapter_summary(
        self,
        yaml_content: str,
        chapter: str,
        chapter_title: str,
        final_draft: str,
    ) -> ChapterSummary:
        """Parse YAML into ChapterSummary."""
        try:
            data = yaml.safe_load(yaml_content) or {}
            data["chapter"] = chapter
            data["title"] = data.get("title") or chapter_title
            data.setdefault("word_count", len(final_draft))
            data.setdefault("key_events", [])
            data.setdefault("new_facts", [])
            data.setdefault("character_state_changes", [])
            data.setdefault("open_loops", [])
            data.setdefault("brief_summary", "")
            return ChapterSummary(**data)
        except Exception:
            return self._fallback_chapter_summary(chapter, chapter_title, final_draft)

    def _fallback_chapter_summary(
        self,
        chapter: str,
        chapter_title: str,
        final_draft: str,
    ) -> ChapterSummary:
        """Fallback summary without LLM."""
        brief = final_draft.strip().replace("\r\n", "\n")
        brief = brief[:400] + ("..." if len(brief) > 400 else "")

        return ChapterSummary(
            chapter=chapter,
            title=chapter_title or chapter,
            word_count=len(final_draft),
            key_events=[],
            new_facts=[],
            character_state_changes=[],
            open_loops=[],
            brief_summary=brief,
        )












