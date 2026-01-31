"""
Writer Agent
Generates draft based on scene brief.
"""

from typing import Any, Dict, List

from app.agents.base import BaseAgent


class WriterAgent(BaseAgent):
    """Agent responsible for generating drafts."""

    def get_agent_name(self) -> str:
        return "writer"

    def get_system_prompt(self) -> str:
        return (
            "You are a Writer agent for novel writing.\n\n"
            "Your responsibilities:\n"
            "1. Write draft based on scene brief\n"
            "2. Follow style guidelines strictly\n"
            "3. DO NOT invent new settings - mark anything uncertain as [TO_CONFIRM]\n"
            "4. Respect character boundaries and timeline constraints\n\n"
            "Core principle:\n"
            "- Chapter goal comes first. Use cards/canon as constraints and a reference, not a checklist.\n"
            "- Do NOT try to mention or use every card in every chapter. Only apply what is relevant.\n"
            "- Before writing, form a brief internal plan (3-6 beats) to reach the chapter goal.\n\n"
            "Output Format:\n"
            "- FIRST, Provide your internal plan inside <plan> tags.\n"
            "- SECOND, Write the narrative prose inside <draft> tags.\n"
            "- Mark uncertain details with [TO_CONFIRM: detail] inside the text.\n"
        )

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
        rules_card = context.get("rules_card")
        character_cards = context.get("character_cards") or []
        world_cards = context.get("world_cards") or []
        facts = context.get("facts") or []
        timeline = context.get("timeline") or []
        character_states = context.get("character_states") or []
        chapter_goal = context.get("chapter_goal")

        draft_content = await self._generate_draft(
            scene_brief=scene_brief,
            target_word_count=context.get("target_word_count", 3000),
            previous_summaries=previous_summaries,
            style_card=style_card,
            rules_card=rules_card,
            character_cards=character_cards,
            world_cards=world_cards,
            facts=facts,
            timeline=timeline,
            character_states=character_states,
            chapter_goal=chapter_goal,
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

        return {
            "success": True,
            "draft": draft,
            "word_count": word_count,
            "pending_confirmations": pending_confirmations,
        }

    async def execute_stream(self, project_id: str, chapter: str, context: Dict[str, Any]):
        """Stream draft generation token by token."""
        scene_brief = context.get("scene_brief")
        if not scene_brief:
            yield "[Error: Scene brief not found]"
            return

        def get_field(obj, field, default=""):
            if hasattr(obj, field):
                return getattr(obj, field, default)
            if isinstance(obj, dict):
                return obj.get(field, default)
            return default

        brief_chapter = get_field(scene_brief, "chapter", chapter)
        brief_title = get_field(scene_brief, "title", "Untitled")
        brief_goal = get_field(scene_brief, "goal", "")
        brief_characters = get_field(scene_brief, "characters", [])

        context_items = []
        chapter_goal = context.get("chapter_goal")
        if chapter_goal:
            context_items.append(f"GOAL: {chapter_goal}")

        char_names = []
        for char in brief_characters or []:
            if isinstance(char, dict):
                char_names.append(char.get("name", str(char)))
            elif hasattr(char, "name"):
                char_names.append(char.name)
            else:
                char_names.append(str(char))

        context_items.append(
            """Scene Brief:
Chapter: {chapter}
Title: {title}
Goal: {goal}
Characters: {characters}
""".format(
                chapter=brief_chapter,
                title=brief_title,
                goal=brief_goal,
                characters=", ".join(char_names) if char_names else "None",
            )
        )

        if context.get("style_card"):
            context_items.append(f"Style: {context.get('style_card')}")

        messages = self.build_messages(
            system_prompt=self.get_system_prompt(),
            user_prompt=f"Write a {context.get('target_word_count', 3000)} word draft for this chapter.",
            context_items=context_items,
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
        rules_card: Any = None,
        character_cards: List[Any] = None,
        world_cards: List[Any] = None,
        facts: List[Any] = None,
        timeline: List[Any] = None,
        character_states: List[Any] = None,
        chapter_goal: str = None,
    ) -> str:
        """Generate draft using LLM."""
        context_items = []

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

        if style_card:
            try:
                context_items.append("Style Card:\n" + str(style_card.model_dump()))
            except Exception:
                context_items.append("Style Card:\n" + str(style_card))

        if rules_card:
            try:
                context_items.append("Rules Card:\n" + str(rules_card.model_dump()))
            except Exception:
                context_items.append("Rules Card:\n" + str(rules_card))

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

        if previous_summaries:
            context_items.append("Previous Chapters:\n" + "\n\n".join(previous_summaries))

        user_prompt = f"""Write a draft for this chapter.

Chapter goal (top priority): {chapter_goal or brief_goal}

Requirements:
- Target word count: approximately {target_word_count} words
- Follow the style reminder strictly
- Respect all constraints and forbidden actions
- DO NOT invent new settings without marking them [TO_CONFIRM: detail]

Output format:
<plan>
(Your 3-6 beats plan here, in Markdown list format)
</plan>
<draft>
(Your narrative prose here)
</draft>
"""

        messages = self.build_messages(
            system_prompt=self.get_system_prompt(),
            user_prompt=user_prompt,
            context_items=context_items,
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
