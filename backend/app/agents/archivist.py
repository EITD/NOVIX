"""
Archivist Agent
Manages canon data and generates scene briefs and summaries.
"""

import json
from datetime import datetime
from typing import Any, Dict, List

import yaml

from app.agents.base import BaseAgent
from app.schemas.canon import Fact, TimelineEvent, CharacterState
from app.schemas.draft import SceneBrief, ChapterSummary, CardProposal
from app.schemas.volume import VolumeSummary
from app.utils.logger import get_logger

logger = get_logger(__name__)


class ArchivistAgent(BaseAgent):
    """Agent responsible for canon management and summaries."""

    def get_agent_name(self) -> str:
        return "archivist"

    def get_system_prompt(self) -> str:
        return (
            "You are an Archivist agent for novel writing.\n\n"
            "Your responsibilities:\n"
            "1. Maintain facts, timeline, and character states\n"
            "2. Generate scene briefs for writers based on chapter goals\n"
            "3. Detect conflicts between new content and existing canon\n"
            "4. Ensure consistency across the story\n\n"
            "Core principle:\n"
            "- Chapter goal is the primary driver. Cards/canon are constraints and a knowledge base.\n"
            "- Do NOT try to cover every card in every chapter. Select only what is relevant.\n"
            "- Prefer clarity and actionability over completeness.\n\n"
            "Output Format:\n"
            "- Generate scene briefs in JSON format\n"
            "- Include relevant context only (not exhaustive)\n"
            "- Flag any conflicts or inconsistencies\n"
        )

    async def execute(self, project_id: str, chapter: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """Generate a scene brief for a chapter."""
        style_card = await self.card_storage.get_style_card(project_id)
        rules_card = await self.card_storage.get_rules_card(project_id)

        character_names = context.get("characters", [])
        if not character_names:
            character_names = await self.card_storage.list_character_cards(project_id)

        characters = []
        for name in character_names[:5]:
            card = await self.card_storage.get_character_card(project_id, name)
            if card:
                state = await self.canon_storage.get_character_state(project_id, name)
                characters.append({"card": card, "state": state})

        recent_events = await self.canon_storage.get_timeline_events_near_chapter(
            project_id=project_id,
            chapter=chapter,
            window=3,
            max_events=10,
        )

        facts = await self.canon_storage.get_all_facts(project_id)
        recent_facts = facts[-10:] if facts else []

        try:
            logger.debug(f"Starting scene brief generation for chapter: {chapter}")
            scene_brief_content = await self._generate_scene_brief(
                chapter=chapter,
                chapter_goal=context.get("chapter_goal", ""),
                chapter_title=context.get("chapter_title", ""),
                characters=characters,
                timeline_events=recent_events,
                facts=recent_facts,
                style_card=style_card,
                rules_card=rules_card,
            )
            logger.info(f"Scene brief generation successful, length: {len(scene_brief_content)}")
        except Exception:
            logger.error("Scene brief generation failed", exc_info=True)
            raise

        scene_brief = self._parse_scene_brief(scene_brief_content, chapter)
        await self.draft_storage.save_scene_brief(project_id, chapter, scene_brief)

        return {
            "success": True,
            "scene_brief": scene_brief,
            "conflicts": [],
        }

    async def _generate_scene_brief(
        self,
        chapter: str,
        chapter_goal: str,
        chapter_title: str,
        characters: List[Dict],
        timeline_events: List,
        facts: List,
        style_card: Any,
        rules_card: Any,
    ) -> str:
        """Generate a scene brief using the LLM."""
        context_items = []

        if characters:
            char_info = ["Characters:"]
            for char in characters:
                card = char["card"]
                state = char.get("state")
                char_info.append(f"\n- {card.name}")
                char_info.append(f"  Identity: {card.identity}")
                char_info.append(f"  Motivation: {card.motivation}")
                char_info.append(f"  Boundaries: {', '.join(card.boundaries)}")
                if state:
                    char_info.append(f"  Current State: {state.emotional_state or 'Normal'}")
                    char_info.append(f"  Location: {state.location or 'Unknown'}")
            context_items.append("".join(char_info))

        if timeline_events:
            timeline_info = ["Recent Timeline:"]
            for event in timeline_events:
                timeline_info.append(f"\n- {event.time}: {event.event} at {event.location}")
            context_items.append("".join(timeline_info))

        if facts:
            facts_info = ["Recent Facts:"]
            for fact in facts:
                facts_info.append(f"\n- {fact.statement}")
            context_items.append("".join(facts_info))

        if style_card:
            style_info = (
                "Writing Style:\n"
                f"- Narrative Distance: {style_card.narrative_distance}\n"
                f"- Pacing: {style_card.pacing}\n"
                f"- Sentence Structure: {style_card.sentence_structure}"
            )
            context_items.append(style_info)

        if rules_card and rules_card.forbidden_actions:
            rules_info = "Forbidden Actions:\n" + "\n".join(
                [f"- {action}" for action in rules_card.forbidden_actions]
            )
            context_items.append(rules_info)

        user_prompt = f"""Generate a scene brief for:
Chapter: {chapter}
Title: {chapter_title}
Goal: {chapter_goal}

Goal-first requirements:
- The scene brief must be a plan to accomplish the chapter goal.
- Only include characters that must appear or be referenced to achieve the goal.
- Only include world constraints/forbidden items relevant to this chapter.
- Avoid dumping all facts/constraints; select the minimal set that prevents mistakes.
- If a useful detail is missing, include it as [TO_CONFIRM: ...] in the most appropriate field.

Output the scene brief in JSON format matching this structure:
```json
{{
  "chapter": "{chapter}",
  "title": "{chapter_title}",
  "goal": "{chapter_goal}",
  "characters": [
    {{
      "name": "<character_name>",
      "current_state": "<state_description>",
      "relevant_traits": "<traits>"
    }}
  ],
  "timeline_context": {{
    "before": "<previous_event>",
    "current": "<current_time>",
    "after": "<upcoming_hints>"
  }},
  "world_constraints": ["<constraint1>"],
  "style_reminder": "<style_note>",
  "forbidden": ["<forbidden_action1>"]
}}
```

Generate VALID JSON only. No markdown, no comments outside JSON.
"""

        messages = self.build_messages(
            system_prompt=self.get_system_prompt(),
            user_prompt=user_prompt,
            context_items=context_items,
        )

        response = await self.call_llm(messages)

        json_content = response
        if "```json" in response:
            start = response.find("```json") + 7
            end = response.find("```", start)
            json_content = response[start:end].strip()
        elif "```" in response:
            start = response.find("```") + 3
            end = response.find("```", start)
            json_content = response[start:end].strip()

        return json_content

    def _parse_scene_brief(self, json_content: str, chapter: str) -> SceneBrief:
        """Parse JSON to SceneBrief."""
        try:
            data = json.loads(json_content)
            data["chapter"] = chapter
            data["title"] = data.get("title", "")
            data["goal"] = data.get("goal", "")
            data["characters"] = data.get("characters", [])
            data["timeline_context"] = data.get("timeline_context", {})
            data["world_constraints"] = data.get("world_constraints", [])
            data["style_reminder"] = data.get("style_reminder", "")
            data["forbidden"] = data.get("forbidden", [])
            return SceneBrief(**data)
        except Exception as exc:
            logger.error(f"Failed to parse scene brief: {exc}")
            return SceneBrief(
                chapter=chapter,
                title="",
                goal="Parsing failed, please check logs.",
                characters=[],
                timeline_context={},
                world_constraints=[],
                style_reminder="",
                forbidden=[],
            )

    async def detect_setting_changes(self, draft_content: str, existing_card_names: List[str]) -> List[CardProposal]:
        """Detect potential new setting cards."""
        provider = self.gateway.get_provider_for_agent(self.get_agent_name())
        if provider == "mock":
            return []

        prompt = self._build_setting_detection_prompt(draft_content, existing_card_names)
        messages = self.build_messages(system_prompt=self.get_system_prompt(), user_prompt=prompt)
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
                if item.get("confidence", 0) < 0.6:
                    continue
                proposals.append(CardProposal(**item))
        except Exception as exc:
            logger.error(f"Failed to parse setting proposals: {exc}")

        return proposals

    def _build_setting_detection_prompt(self, draft: str, existing: List[str]) -> str:
        return f"""Analyze the draft to identify NEW world-building elements that need a Setting Card.

Rules:
1. NO DUPLICATES: Ignore entities already in this list: {', '.join(existing)}.
2. SIGNIFICANCE CHECK:
   - Characters: Named and active in the scene.
   - Locations: Specific places, not generic.
   - Rules/Concepts: Named systems, factions, or lore.
3. RATIONALE: Provide a strong reason for why a card is needed.

Draft Content (Excerpt):
{draft[:15000]}...

Output strict JSON List format:
[
  {{
    "name": "Exact Name",
    "type": "Character" | "World" | "Rule",
    "description": "Concise definition based on text",
    "rationale": "Strong reason why user should approve this card.",
    "source_text": "Short quote triggering detection",
    "confidence": 0.85
  }}
]
Output JSON ONLY. No markdown, no commentary.
"""

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

    async def _generate_canon_updates_yaml(self, chapter: str, final_draft: str) -> str:
        """Generate canon updates YAML via LLM."""
        user_prompt = f"""Extract canon updates from the final draft.

Chapter: {chapter}

Output YAML only, matching this schema:
```yaml
facts:
  - statement: <fact statement>
    confidence: <0.0-1.0>
timeline_events:
  - time: <time description>
    event: <event description>
    participants: [<name1>, <name2>]
    location: <location>
character_states:
  - character: <character name>
    goals: [<goal1>]
    injuries: [<injury1>]
    inventory: [<item1>]
    relationships: {{ <other>: <relation> }}
    location: <current location>
    emotional_state: <emotion>
```

Rules:
- Include only updates that can be inferred from the draft.
- If an item is unknown, use empty string / empty list.

Final Draft:
""" + final_draft

        messages = self.build_messages(
            system_prompt=self.get_system_prompt(),
            user_prompt=user_prompt,
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

        facts: List[Fact] = []
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

            fact_id = f"F{next_fact_index:04d}"
            next_fact_index += 1
            facts.append(
                Fact(
                    id=fact_id,
                    statement=statement.strip(),
                    source=chapter,
                    introduced_in=chapter,
                    confidence=max(0.0, min(1.0, confidence)),
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
        user_prompt = f"""Generate a structured chapter summary in YAML.

Chapter: {chapter}
Title: {chapter_title}

The YAML must match this schema exactly:
```yaml
chapter: {chapter}
title: {chapter_title}
word_count: <int>
key_events:
  - <event1>
new_facts:
  - <fact1>
character_state_changes:
  - <change1>
open_loops:
  - <loop1>
brief_summary: <one paragraph summary>
```

Constraints:
- Write concise but informative items.
- Output YAML only, no extra text.

Final Draft:
""" + final_draft

        messages = self.build_messages(
            system_prompt=self.get_system_prompt(),
            user_prompt=user_prompt,
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

        user_prompt = f"""Generate a structured volume summary in YAML.

Volume: {volume_id}
Chapter count: {len(chapter_summaries)}

Chapter summaries JSON:
{json.dumps(items, ensure_ascii=True)}

Output YAML matching this schema:
```yaml
volume_id: {volume_id}
brief_summary: <one paragraph summary>
key_themes:
  - <theme1>
major_events:
  - <event1>
chapter_count: {len(chapter_summaries)}
```

Constraints:
- Summaries must be concise and consistent.
- Output YAML only, no extra text.
"""

        messages = self.build_messages(
            system_prompt=self.get_system_prompt(),
            user_prompt=user_prompt,
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
