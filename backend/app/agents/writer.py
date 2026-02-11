"""
Writer Agent
Generates draft based on scene brief.
"""

from typing import Any, Dict, List
import json

from app.agents.base import BaseAgent
from app.prompts import WRITER_SYSTEM_PROMPT, writer_draft_prompt, writer_questions_prompt, writer_research_plan_prompt


class WriterAgent(BaseAgent):
    """Agent responsible for generating drafts."""

    DEFAULT_QUESTIONS = [
        {"type": "plot_point", "text": "为达成本章目标，尚缺的剧情/世界信息是什么？"},
        {"type": "character_change", "text": "哪些主角的动机或情绪需再确认，避免违背既有事实？"},
        {"type": "detail_gap", "text": "还有哪些具体细节（地点/时间/物件）需要确定后再写？"},
    ]

    def get_agent_name(self) -> str:
        return "writer"

    def get_system_prompt(self) -> str:
        return WRITER_SYSTEM_PROMPT

    async def execute(self, project_id: str, chapter: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """Generate draft for a chapter."""
        scene_brief = context.get("scene_brief")
        if not scene_brief:
            scene_brief = await self.draft_storage.get_scene_brief(project_id, chapter)

        if not scene_brief:
            return {"success": False, "error": "Scene brief not found"}

        previous_summaries = context.get("previous_summaries")
        context_package = context.get("context_package")
        if previous_summaries is None and context_package:
            previous_summaries = self._build_previous_summaries_from_context(context_package)
        if previous_summaries is None:
            previous_summaries = await self._load_previous_summaries(project_id, chapter)

        style_card = context.get("style_card")
        character_cards = context.get("character_cards") or []
        world_cards = context.get("world_cards") or []
        facts = context.get("facts") or []
        text_chunks = context.get("text_chunks") or []
        working_memory = context.get("working_memory")
        unresolved_gaps = context.get("unresolved_gaps") or []
        timeline = context.get("timeline") or []
        character_states = context.get("character_states") or []
        chapter_goal = context.get("chapter_goal")
        user_answers = context.get("user_answers") or []
        user_feedback = context.get("user_feedback") or ""

        draft_content = await self._generate_draft(
            scene_brief=scene_brief,
            target_word_count=context.get("target_word_count", 3000),
            previous_summaries=previous_summaries,
            style_card=style_card,
            character_cards=character_cards,
            world_cards=world_cards,
            facts=facts,
            text_chunks=text_chunks,
            working_memory=working_memory,
            unresolved_gaps=unresolved_gaps,
            timeline=timeline,
            character_states=character_states,
            chapter_goal=chapter_goal,
            user_answers=user_answers,
            user_feedback=user_feedback,
        )

        pending_confirmations = self._extract_confirmations(draft_content)
        word_count = len(draft_content)

        draft = await self.draft_storage.save_draft(
            project_id=project_id,
            chapter=chapter,
            version="v1",
            content=draft_content,
            word_count=word_count,
            pending_confirmations=pending_confirmations,
        )

        try:
            from app.services.chapter_binding_service import chapter_binding_service
            await chapter_binding_service.build_bindings(project_id, chapter, force=True)
        except Exception:
            pass

        return {
            "success": True,
            "draft": draft,
            "word_count": word_count,
            "pending_confirmations": pending_confirmations,
        }

    async def generate_questions(
        self,
        context_package: Dict[str, Any],
        scene_brief: Any,
        chapter_goal: str
    ) -> List[Dict[str, str]]:
        """Generate pre-writing questions for user confirmation."""
        def get_field(obj, field, default=""):
            if hasattr(obj, field):
                return getattr(obj, field, default)
            if isinstance(obj, dict):
                return obj.get(field, default)
            return default

        brief_chapter = get_field(scene_brief, "chapter", "")
        brief_title = get_field(scene_brief, "title", "")
        brief_goal = get_field(scene_brief, "goal", "")
        brief_characters = get_field(scene_brief, "characters", [])

        characters_text = []
        for char in brief_characters or []:
            if isinstance(char, dict):
                characters_text.append(char.get("name", str(char)))
            elif hasattr(char, "name"):
                characters_text.append(char.name)
            else:
                characters_text.append(str(char))

        context_items = [
            f"Chapter: {brief_chapter}",
            f"Title: {brief_title}",
            f"Goal: {brief_goal or chapter_goal}",
            f"Characters: {', '.join(characters_text) if characters_text else 'None'}",
        ]

        if context_package:
            context_items.append("事实摘要（节选，供反问参考）：")
            for key in ["summary_with_events", "summary_only", "full_facts"]:
                items = context_package.get(key, []) or []
                for item in items[:2]:
                    summary = str(item.get("summary") or "").strip()
                    events = item.get("key_events") or []
                    chapter_id = item.get("chapter") or ""
                    title = item.get("title") or ""
                    if summary or events:
                        block = [f"- {chapter_id} {title}".strip()]
                        if summary:
                            block.append(f"摘要：{summary}")
                        if events:
                            block.append("事件：" + "；".join([str(e) for e in events[:4]]))
                        context_items.append("\n".join(block))
        prompt = writer_questions_prompt(context_items)

        messages = self.build_messages(
            system_prompt=prompt.system,
            user_prompt=prompt.user,
            context_items=context_items,
        )

        try:
            raw = await self.call_llm(messages)
            data = json.loads(raw.strip())
            if isinstance(data, list) and len(data) == 3:
                cleaned = []
                for item in data:
                    if not isinstance(item, dict):
                        continue
                    q_type = item.get("type")
                    text = item.get("text")
                    if q_type and text:
                        cleaned.append({"type": q_type, "text": text})
                if len(cleaned) == 3:
                    return cleaned
        except Exception:
            pass

        return list(self.DEFAULT_QUESTIONS)

    async def generate_research_plan(
        self,
        chapter_goal: str,
        unresolved_gaps: List[Dict[str, Any]],
        evidence_stats: Dict[str, Any],
        round_index: int,
    ) -> Dict[str, Any]:
        """Generate a compact research plan (queries) for the next retrieval round."""
        gap_texts = []
        for gap in unresolved_gaps or []:
            if not isinstance(gap, dict):
                continue
            text = str(gap.get("text") or "").strip()
            if text:
                gap_texts.append(text)
        prompt = writer_research_plan_prompt(
            chapter_goal=chapter_goal,
            gap_texts=gap_texts,
            evidence_stats=evidence_stats,
            round_index=round_index,
        )

        messages = self.build_messages(
            system_prompt=prompt.system,
            user_prompt=prompt.user,
            context_items=[],
        )

        try:
            raw = await self.call_llm(messages)
            data = json.loads(raw.strip())
            if isinstance(data, dict):
                queries = data.get("queries") or []
                if isinstance(queries, list):
                    cleaned = [str(q).strip() for q in queries if str(q).strip()]
                    if cleaned:
                        return {"queries": cleaned[:4], "note": str(data.get("note") or "").strip()}
        except Exception:
            pass

        fallback = [t for t in gap_texts if t][:3]
        return {"queries": fallback, "note": "fallback_from_gaps"}

    async def execute_stream(self, project_id: str, chapter: str, context: Dict[str, Any]):
        """Stream draft generation token by token."""
        scene_brief = context.get("scene_brief")
        if not scene_brief:
            yield "[Error: Scene brief not found]"
            return

        messages = self._build_draft_messages(
            scene_brief=scene_brief,
            target_word_count=context.get("target_word_count", 3000),
            previous_summaries=context.get("previous_summaries"),
            style_card=context.get("style_card"),
            character_cards=context.get("character_cards") or [],
            world_cards=context.get("world_cards") or [],
            facts=context.get("facts") or [],
            text_chunks=context.get("text_chunks") or [],
            working_memory=context.get("working_memory"),
            unresolved_gaps=context.get("unresolved_gaps") or [],
            timeline=context.get("timeline") or [],
            character_states=context.get("character_states") or [],
            chapter_goal=context.get("chapter_goal"),
            user_answers=context.get("user_answers") or [],
            user_feedback=context.get("user_feedback") or "",
            include_plan=False,
        )

        async for chunk in self.call_llm_stream(messages):
            yield chunk

    async def execute_stream_draft(self, project_id: str, chapter: str, context: Dict[str, Any]):
        """Stream draft text only (no plan tags)."""
        scene_brief = context.get("scene_brief")
        if not scene_brief:
            yield "[Error: Scene brief not found]"
            return

        messages = self._build_draft_messages(
            scene_brief=scene_brief,
            target_word_count=context.get("target_word_count", 3000),
            previous_summaries=context.get("previous_summaries"),
            style_card=context.get("style_card"),
            character_cards=context.get("character_cards") or [],
            world_cards=context.get("world_cards") or [],
            facts=context.get("facts") or [],
            text_chunks=context.get("text_chunks") or [],
            working_memory=context.get("working_memory"),
            unresolved_gaps=context.get("unresolved_gaps") or [],
            timeline=context.get("timeline") or [],
            character_states=context.get("character_states") or [],
            chapter_goal=context.get("chapter_goal"),
            user_answers=context.get("user_answers") or [],
            user_feedback=context.get("user_feedback") or "",
            include_plan=False,
        )

        async for chunk in self.call_llm_stream(messages):
            yield chunk

    async def _load_previous_summaries(self, project_id: str, current_chapter: str) -> List[str]:
        """Load previous summaries."""
        context_package = await self.draft_storage.get_context_for_writing(project_id, current_chapter)
        return self._build_previous_summaries_from_context(context_package)

    def _build_previous_summaries_from_context(self, context_package: Dict[str, Any]) -> List[str]:
        """Build summary blocks from structured context."""
        blocks: List[str] = []

        def add_block(items: List[Dict[str, Any]], fields: List[str]) -> None:
            for item in items:
                parts = [f"{item.get('chapter')}: {item.get('title')}"]
                for field in fields:
                    value = item.get(field)
                    if isinstance(value, list):
                        value = "\n".join([f"- {val}" for val in value]) or "-"
                    if value:
                        parts.append(f"{field}:\n{value}")
                blocks.append("\n".join(parts))

        add_block(context_package.get("full_facts", []), ["summary", "key_events", "open_loops"])
        add_block(context_package.get("summary_with_events", []), ["summary", "key_events"])
        add_block(context_package.get("summary_only", []), ["summary"])
        add_block(context_package.get("title_only", []), [])

        for volume in context_package.get("volume_summaries", []):
            parts = [f"{volume.get('volume_id')}: {volume.get('brief_summary')}"]
            key_themes = volume.get("key_themes") or []
            major_events = volume.get("major_events") or []
            if key_themes:
                parts.append("Key Themes:\n" + "\n".join([f"- {val}" for val in key_themes]))
            if major_events:
                parts.append("Major Events:\n" + "\n".join([f"- {val}" for val in major_events]))
            blocks.append("\n".join(parts))

        return blocks

    async def _generate_draft(
        self,
        scene_brief: Any,
        target_word_count: int,
        previous_summaries: List[str],
        style_card: Any = None,
        character_cards: List[Any] = None,
        world_cards: List[Any] = None,
        facts: List[Any] = None,
        text_chunks: List[Any] = None,
        working_memory: str = None,
        unresolved_gaps: List[Dict[str, Any]] = None,
        timeline: List[Any] = None,
        character_states: List[Any] = None,
        chapter_goal: str = None,
        user_answers: List[Dict[str, str]] = None,
        user_feedback: str = None,
    ) -> str:
        """Generate draft using LLM."""
        messages = self._build_draft_messages(
            scene_brief=scene_brief,
            target_word_count=target_word_count,
            previous_summaries=previous_summaries,
            style_card=style_card,
            character_cards=character_cards,
            world_cards=world_cards,
            facts=facts,
            text_chunks=text_chunks,
            working_memory=working_memory,
            unresolved_gaps=unresolved_gaps,
            timeline=timeline,
            character_states=character_states,
            chapter_goal=chapter_goal,
            user_answers=user_answers,
            user_feedback=user_feedback,
            include_plan=True,
        )

        raw_response = await self.call_llm(messages)
        draft_content = raw_response
        if "<draft>" in raw_response:
            start = raw_response.find("<draft>") + 7
            end = raw_response.find("</draft>")
            if end == -1:
                end = len(raw_response)
            draft_content = raw_response[start:end].strip()

        return draft_content

    def _build_draft_messages(
        self,
        scene_brief: Any,
        target_word_count: int,
        previous_summaries: List[str],
        style_card: Any = None,
        character_cards: List[Any] = None,
        world_cards: List[Any] = None,
        facts: List[Any] = None,
        text_chunks: List[Any] = None,
        working_memory: str = None,
        unresolved_gaps: List[Dict[str, Any]] = None,
        timeline: List[Any] = None,
        character_states: List[Any] = None,
        chapter_goal: str = None,
        user_answers: List[Dict[str, str]] = None,
        user_feedback: str = None,
        include_plan: bool = True,
    ) -> List[Dict[str, str]]:
        context_items = []
        use_compact_context = bool(working_memory and str(working_memory).strip())

        def get_field(obj, field, default=""):
            if hasattr(obj, field):
                return getattr(obj, field, default)
            if isinstance(obj, dict):
                return obj.get(field, default)
            return default

        if chapter_goal:
            context_items.append(
                "GOAL PRIORITY:\n- " + str(chapter_goal).strip() + "\n"
                "Only write content that serves the goal."
            )

        brief_chapter = get_field(scene_brief, "chapter", "")
        brief_title = get_field(scene_brief, "title", "")
        brief_goal = get_field(scene_brief, "goal", "")
        brief_characters = get_field(scene_brief, "characters", [])
        brief_timeline = get_field(scene_brief, "timeline_context", {})
        brief_constraints = get_field(scene_brief, "world_constraints", [])
        brief_style = get_field(scene_brief, "style_reminder", "")
        brief_forbidden = get_field(scene_brief, "forbidden", [])

        brief_text = f"""Scene Brief:
Chapter: {brief_chapter}
Title: {brief_title}
Goal: {brief_goal}

Characters:
{self._format_characters(brief_characters)}

Timeline Context:
{self._format_dict(brief_timeline)}

World Constraints:
{self._format_list(brief_constraints)}

Style Reminder: {brief_style}

FORBIDDEN:
{self._format_list(brief_forbidden)}
"""
        context_items.append(brief_text)

        if working_memory:
            context_items.append("Working Memory:\n" + str(working_memory))

        if unresolved_gaps:
            lines = ["未解决缺口（不得编造，必须留白或用[TO_CONFIRM:…]标记）:"]
            for gap in unresolved_gaps[:6]:
                if not isinstance(gap, dict):
                    continue
                text = str(gap.get("text") or "").strip()
                if text:
                    lines.append(f"- {text}")
            if len(lines) > 1:
                context_items.append("\n".join(lines))

        if style_card:
            try:
                context_items.append("Style Card:\n" + str(style_card.model_dump()))
            except Exception:
                context_items.append("Style Card:\n" + str(style_card))

        if text_chunks:
            lines = ["Text Chunks:"]
            for chunk in text_chunks[:6]:
                if isinstance(chunk, dict):
                    chapter = chunk.get("chapter") or ""
                    text = chunk.get("text") or ""
                    prefix = f"[{chapter}] " if chapter else ""
                    lines.append(prefix + text)
                else:
                    lines.append(str(chunk))
            context_items.append("\n".join(lines))

        if not use_compact_context:
            if character_cards:
                lines = ["Character Cards:"]
                for card in character_cards[:10]:
                    try:
                        lines.append(str(card.model_dump()))
                    except Exception:
                        lines.append(str(card))
                context_items.append("\n".join(lines))

            if world_cards:
                lines = ["World Cards:"]
                for card in world_cards[:10]:
                    try:
                        lines.append(str(card.model_dump()))
                    except Exception:
                        lines.append(str(card))
                context_items.append("\n".join(lines))

            if facts:
                lines = ["Canon Facts:"]
                for fact in facts[-20:]:
                    try:
                        lines.append(str(fact.model_dump()))
                    except Exception:
                        lines.append(str(fact))
                context_items.append("\n".join(lines))

            if timeline:
                lines = ["Canon Timeline:"]
                for item in timeline[-20:]:
                    try:
                        lines.append(str(item.model_dump()))
                    except Exception:
                        lines.append(str(item))
                context_items.append("\n".join(lines))

            if character_states:
                lines = ["Character States:"]
                for state in character_states[:20]:
                    try:
                        lines.append(str(state.model_dump()))
                    except Exception:
                        lines.append(str(state))
                context_items.append("\n".join(lines))

        if user_answers:
            lines = ["User Answers:"]
            for answer in user_answers:
                if not isinstance(answer, dict):
                    continue
                question = answer.get("question") or answer.get("text") or answer.get("type") or ""
                reply = answer.get("answer") or ""
                if question or reply:
                    lines.append(f"- {question}: {reply}")
            if len(lines) > 1:
                context_items.append("\n".join(lines))

        if user_feedback:
            context_items.append("User Feedback:\n" + str(user_feedback))

        if previous_summaries:
            context_items.append("Previous Chapters:\n" + "\n\n".join(previous_summaries))
        prompt = writer_draft_prompt(
            include_plan=include_plan,
            chapter_goal=chapter_goal or "",
            brief_goal=brief_goal or "",
            target_word_count=target_word_count,
        )

        return self.build_messages(
            system_prompt=prompt.system,
            user_prompt=prompt.user,
            context_items=context_items,
        )

    def _format_characters(self, characters: List[Dict]) -> str:
        if not characters:
            return "None specified"
        lines = []
        for char in characters:
            name = char.get("name", "Unknown")
            state = char.get("current_state", "Normal")
            traits = char.get("relevant_traits", "")
            lines.append(f"- {name}: {state} ({traits})")
        return "\n".join(lines)

    def _format_dict(self, data: Dict) -> str:
        if not data:
            return "None"
        return "\n".join([f"- {key}: {value}" for key, value in data.items()])

    def _format_list(self, items: List) -> str:
        if not items:
            return "None"
        return "\n".join([f"- {item}" for item in items])

    def _extract_confirmations(self, content: str) -> List[str]:
        confirmations = []
        for line in content.split("\n"):
            if "[TO_CONFIRM:" in line:
                start = line.find("[TO_CONFIRM:") + 12
                end = line.find("]", start)
                if end > start:
                    confirmations.append(line[start:end].strip())
        return confirmations
