"""
Orchestrator
Coordinates the multi-agent writing workflow.
"""

from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Tuple

from app.llm_gateway import get_gateway
from app.storage import CardStorage, CanonStorage, DraftStorage
from app.agents import ArchivistAgent, WriterAgent, ReviewerAgent, EditorAgent
from app.context_engine.select_engine import ContextSelectEngine
from app.context_engine.trace_collector import trace_collector
from app.orchestrator.storage_adapter import UnifiedStorageAdapter
from app.utils.chapter_id import ChapterIDValidator
from app.utils.logger import get_logger

logger = get_logger(__name__)


class SessionStatus(str, Enum):
    """Session status values."""

    IDLE = "idle"
    GENERATING_BRIEF = "generating_brief"
    WRITING_DRAFT = "writing_draft"
    REVIEWING = "reviewing"
    EDITING = "editing"
    WAITING_FEEDBACK = "waiting_feedback"
    COMPLETED = "completed"
    ERROR = "error"


class Orchestrator:
    """Coordinates the multi-agent writing workflow."""

    def __init__(self, data_dir: str = "../data", progress_callback: Optional[Callable] = None):
        self.card_storage = CardStorage(data_dir)
        self.canon_storage = CanonStorage(data_dir)
        self.draft_storage = DraftStorage(data_dir)

        self.gateway = get_gateway()

        self.archivist = ArchivistAgent(self.gateway, self.card_storage, self.canon_storage, self.draft_storage)
        self.writer = WriterAgent(self.gateway, self.card_storage, self.canon_storage, self.draft_storage)
        self.reviewer = ReviewerAgent(self.gateway, self.card_storage, self.canon_storage, self.draft_storage)
        self.editor = EditorAgent(self.gateway, self.card_storage, self.canon_storage, self.draft_storage)

        self.storage_adapter = UnifiedStorageAdapter(self.card_storage, self.canon_storage, self.draft_storage)
        self.select_engine = ContextSelectEngine()

        self.progress_callback = progress_callback
        self.current_status = SessionStatus.IDLE
        self.current_project_id: Optional[str] = None
        self.current_chapter: Optional[str] = None
        self.iteration_count = 0
        self.max_iterations = 5

    async def start_session(
        self,
        project_id: str,
        chapter: str,
        chapter_title: str,
        chapter_goal: str,
        target_word_count: int = 3000,
        character_names: Optional[list] = None,
    ) -> Dict[str, Any]:
        """Start a new writing session."""
        self.current_project_id = project_id
        self.current_chapter = chapter
        self.iteration_count = 0

        try:
            try:
                await trace_collector.start_agent_trace("archivist", f"{project_id}:{chapter}")
            except Exception as exc:
                logger.warning(f"Trace start failed: {exc}")

            await self._update_status(SessionStatus.GENERATING_BRIEF, "Archivist is preparing the scene brief...")

            archivist_result = await self.archivist.execute(
                project_id=project_id,
                chapter=chapter,
                context={
                    "chapter_title": chapter_title,
                    "chapter_goal": chapter_goal,
                    "characters": character_names or [],
                },
            )

            if not archivist_result.get("success"):
                try:
                    await trace_collector.end_agent_trace("archivist", status="failed")
                except Exception as exc:
                    logger.warning(f"Trace end failed: {exc}")
                return await self._handle_error("Scene brief generation failed")

            scene_brief = archivist_result["scene_brief"]
            try:
                await trace_collector.end_agent_trace("archivist", status="completed")
            except Exception as exc:
                logger.warning(f"Trace end failed: {exc}")

            critical_items = await self.select_engine.deterministic_select(
                project_id, "writer", self.storage_adapter
            )

            query = f"{scene_brief.title} {scene_brief.goal}" if scene_brief else chapter_goal
            dynamic_items = await self.select_engine.retrieval_select(
                project_id=project_id,
                query=query,
                item_types=["character", "world", "fact"],
                storage=self.storage_adapter,
                top_k=10,
            )

            style_card = next((item.content for item in critical_items if item.type.value == "style_card"), None)
            rules_card = next((item.content for item in critical_items if item.type.value == "rules_card"), None)

            character_cards = []
            world_cards = []
            facts = []

            for item in dynamic_items:
                if item.type.value == "character":
                    name = item.id.replace("char_", "")
                    card = await self.card_storage.get_character_card(project_id, name)
                    if card:
                        character_cards.append(card)
                elif item.type.value == "world":
                    name = item.id.replace("world_", "")
                    card = await self.card_storage.get_world_card(project_id, name)
                    if card:
                        world_cards.append(card)
                elif item.type.value == "fact":
                    facts.append(item.content)

            timeline = await self.canon_storage.get_all_timeline_events(project_id)
            character_states = await self.canon_storage.get_all_character_states(project_id)

            context_package = await self.draft_storage.get_context_for_writing(project_id, chapter)

            base_tokens = 2000
            base_tokens += sum(len(str(c)) // 2 for c in critical_items)
            base_tokens += sum(len(str(i.content)) // 2 for i in dynamic_items)

            safe_limit = 12000
            context_budget = max(0, safe_limit - base_tokens)
            trimmed_context, trim_stats = self._trim_context_package(context_package, context_budget)
            if trim_stats["trimmed"]:
                try:
                    await trace_collector.record_context_compress(
                        "archivist",
                        before_tokens=trim_stats["before"],
                        after_tokens=trim_stats["after"],
                        method="drop_low_priority_context",
                    )
                except Exception as exc:
                    logger.warning(f"Trace compress failed: {exc}")
            context_package = trimmed_context

            if character_names:
                for name in character_names:
                    if not any(getattr(c, "name", None) == name for c in character_cards):
                        card = await self.card_storage.get_character_card(project_id, name)
                        if card:
                            character_cards.append(card)

            try:
                summary_text = str(getattr(scene_brief, "summary", scene_brief))[:100]
                await trace_collector.record_handoff(
                    "archivist",
                    "writer",
                    f"Scene brief prepared: {summary_text}...",
                )
                await trace_collector.start_agent_trace("writer", f"{project_id}:{chapter}")
                await trace_collector.record_context_select(
                    "writer",
                    selected_count=len(critical_items) + len(dynamic_items),
                    total_candidates=100,
                    token_usage=sum(len(str(i.content)) for i in critical_items + dynamic_items),
                )
            except Exception as exc:
                logger.warning(f"Trace writer setup failed: {exc}")

            await self._update_status(SessionStatus.WRITING_DRAFT, "Writer is drafting...")

            writer_result = await self.writer.execute(
                project_id=project_id,
                chapter=chapter,
                context={
                    "scene_brief": scene_brief,
                    "chapter_goal": chapter_goal,
                    "target_word_count": target_word_count,
                    "style_card": style_card,
                    "rules_card": rules_card,
                    "character_cards": character_cards,
                    "world_cards": world_cards,
                    "facts": facts,
                    "timeline": timeline,
                    "character_states": character_states,
                    "context_package": context_package,
                },
            )

            if not writer_result.get("success"):
                try:
                    await trace_collector.end_agent_trace("writer", status="failed")
                except Exception as exc:
                    logger.warning(f"Trace end failed: {exc}")
                return await self._handle_error("Draft generation failed")

            draft = writer_result["draft"]
            try:
                await trace_collector.end_agent_trace("writer", status="completed")
                draft_content = draft.get("content", str(draft)) if isinstance(draft, dict) else str(draft)
                await trace_collector.record_handoff(
                    "writer",
                    "reviewer",
                    f"Draft generated ({len(draft_content)} chars)",
                )
                await trace_collector.start_agent_trace("reviewer", f"{project_id}:{chapter}")
            except Exception as exc:
                logger.warning(f"Trace writer->reviewer failed: {exc}")

            await self._update_status(SessionStatus.REVIEWING, "Reviewer is analyzing the draft...")

            reviewer_result = await self.reviewer.execute(
                project_id=project_id,
                chapter=chapter,
                context={"draft_version": "v1"},
            )

            if not reviewer_result.get("success"):
                try:
                    await trace_collector.end_agent_trace("reviewer", status="failed")
                except Exception as exc:
                    logger.warning(f"Trace end failed: {exc}")
                return await self._handle_error("Review failed")

            review = reviewer_result["review"]
            try:
                await trace_collector.end_agent_trace("reviewer", status="completed")
                issue_count = len(review.get("issues", [])) if isinstance(review, dict) else 0
                await trace_collector.record_handoff(
                    "reviewer",
                    "editor",
                    f"Review completed with {issue_count} issues",
                )
                await trace_collector.start_agent_trace("editor", f"{project_id}:{chapter}")
            except Exception as exc:
                logger.warning(f"Trace reviewer->editor failed: {exc}")

            await self._update_status(SessionStatus.EDITING, "Editor is revising the draft...")

            editor_result = await self.editor.execute(
                project_id=project_id,
                chapter=chapter,
                context={"draft_version": "v1", "user_feedback": ""},
            )

            if not editor_result.get("success"):
                try:
                    await trace_collector.end_agent_trace("editor", status="failed")
                except Exception as exc:
                    logger.warning(f"Trace end failed: {exc}")
                return await self._handle_error("Editing failed")

            revised_draft = editor_result["draft"]

            try:
                draft_len = len(draft.get("content", "")) if isinstance(draft, dict) else len(str(draft))
                revised_len = (
                    len(revised_draft.get("content", "")) if isinstance(revised_draft, dict) else len(str(revised_draft))
                )
                additions = max(0, revised_len - draft_len)
                deletions = max(0, draft_len - revised_len)
                if additions > 0 or deletions > 0:
                    await trace_collector.record_diff("editor", additions=additions, deletions=deletions)
                await trace_collector.end_agent_trace("editor", status="completed")
            except Exception as exc:
                logger.warning(f"Trace diff failed: {exc}")

            await self._update_status(SessionStatus.WAITING_FEEDBACK, "Waiting for user feedback...")

            draft_text = revised_draft.content if hasattr(revised_draft, "content") else str(revised_draft)
            proposals = await self._detect_proposals(project_id, draft_text)

            return {
                "success": True,
                "status": SessionStatus.WAITING_FEEDBACK,
                "scene_brief": scene_brief,
                "draft_v1": draft,
                "review": review,
                "draft_v2": revised_draft,
                "iteration": self.iteration_count,
                "proposals": proposals,
            }

        except Exception as exc:
            return await self._handle_error(f"Session error: {exc}")

    async def process_feedback(
        self,
        project_id: str,
        chapter: str,
        feedback: str,
        action: str = "revise",
        rejected_entities: list = None,
    ) -> Dict[str, Any]:
        """Process user feedback."""
        if action == "confirm":
            return await self._finalize_chapter(project_id, chapter)

        self.iteration_count += 1
        if self.iteration_count >= self.max_iterations:
            return {
                "success": False,
                "error": "Maximum iterations reached",
                "message": "Maximum revision iterations reached.",
            }

        try:
            versions = await self.draft_storage.list_draft_versions(project_id, chapter)
            latest_version = versions[-1] if versions else "v1"

            await self._update_status(SessionStatus.REVIEWING, "Re-reviewing based on feedback...")

            reviewer_result = await self.reviewer.execute(
                project_id=project_id,
                chapter=chapter,
                context={"draft_version": latest_version},
            )
            _ = reviewer_result

            await self._update_status(SessionStatus.EDITING, "Revising based on feedback...")

            editor_result = await self.editor.execute(
                project_id=project_id,
                chapter=chapter,
                context={
                    "draft_version": latest_version,
                    "user_feedback": feedback,
                    "rejected_entities": rejected_entities or [],
                },
            )

            if not editor_result.get("success"):
                return await self._handle_error("Revision failed")

            await self._update_status(SessionStatus.WAITING_FEEDBACK, "Waiting for user feedback...")

            proposals = await self._detect_proposals(project_id, editor_result["draft"])

            return {
                "success": True,
                "status": SessionStatus.WAITING_FEEDBACK,
                "draft": editor_result["draft"],
                "version": editor_result.get("version", latest_version),
                "iteration": self.iteration_count,
                "proposals": proposals,
            }

        except Exception as exc:
            return await self._handle_error(f"Feedback processing error: {exc}")

    async def _finalize_chapter(self, project_id: str, chapter: str) -> Dict[str, Any]:
        """Finalize chapter and save final draft."""
        try:
            versions = await self.draft_storage.list_draft_versions(project_id, chapter)
            if not versions:
                return await self._handle_error("No draft found to finalize")

            latest_version = versions[-1]
            draft = await self.draft_storage.get_draft(project_id, chapter, latest_version)
            if not draft:
                return await self._handle_error("No draft content found to finalize")

            await self.draft_storage.save_final_draft(project_id=project_id, chapter=chapter, content=draft.content)

            await self._analyze_content(project_id, chapter, draft.content)

            await self._update_status(SessionStatus.COMPLETED, "Chapter completed.")

            return {
                "success": True,
                "status": SessionStatus.COMPLETED,
                "message": "Chapter finalized successfully",
                "final_draft": draft,
            }

        except Exception as exc:
            return await self._handle_error(f"Finalization error: {exc}")

    async def _update_status(self, status: SessionStatus, message: str) -> None:
        """Update session status and notify callback."""
        self.current_status = status

        if self.progress_callback:
            await self.progress_callback(
                {
                    "status": status.value,
                    "message": message,
                    "project_id": self.current_project_id,
                    "chapter": self.current_chapter,
                    "iteration": self.iteration_count,
                }
            )

    async def _handle_error(self, error_message: str) -> Dict[str, Any]:
        """Handle error and update status."""
        self.current_status = SessionStatus.ERROR

        if self.progress_callback:
            await self.progress_callback(
                {
                    "status": SessionStatus.ERROR.value,
                    "message": error_message,
                    "project_id": self.current_project_id,
                    "chapter": self.current_chapter,
                }
            )

        return {"success": False, "status": SessionStatus.ERROR, "error": error_message}

    def get_status(self) -> Dict[str, Any]:
        """Get current session status."""
        return {
            "status": self.current_status.value,
            "project_id": self.current_project_id,
            "chapter": self.current_chapter,
            "iteration": self.iteration_count,
        }

    async def analyze_chapter(self, project_id: str, chapter: str) -> Dict[str, Any]:
        """Manually trigger analysis for a chapter."""
        try:
            versions = await self.draft_storage.list_draft_versions(project_id, chapter)
            if not versions:
                return {"success": False, "error": "No draft found"}

            latest = versions[-1]
            draft = await self.draft_storage.get_draft(project_id, chapter, latest)

            if not draft:
                return {"success": False, "error": "Draft content missing"}

            self.current_project_id = project_id
            self.current_chapter = chapter
            await self._update_status(SessionStatus.GENERATING_BRIEF, "Analyzing content...")

            await self._analyze_content(project_id, chapter, draft.content)

            await self._update_status(SessionStatus.IDLE, "Analysis completed.")
            return {"success": True}
        except Exception as exc:
            return await self._handle_error(f"Analysis failed: {exc}")

    async def _analyze_content(self, project_id: str, chapter: str, content: str):
        """Run post-draft analysis (summaries + canon updates)."""
        try:
            scene_brief = await self.draft_storage.get_scene_brief(project_id, chapter)
            chapter_title = scene_brief.title if scene_brief and scene_brief.title else chapter

            summary = await self.archivist.generate_chapter_summary(
                project_id=project_id,
                chapter=chapter,
                chapter_title=chapter_title,
                final_draft=content,
            )
            await self.draft_storage.save_chapter_summary(project_id, summary)

            volume_id = ChapterIDValidator.extract_volume_id(chapter) or "V1"
            volume_summaries = await self.draft_storage.list_chapter_summaries(project_id, volume_id=volume_id)
            volume_summary = await self.archivist.generate_volume_summary(
                project_id=project_id,
                volume_id=volume_id,
                chapter_summaries=volume_summaries,
            )
            await self.draft_storage.volume_storage.save_volume_summary(project_id, volume_summary)
        except Exception as exc:
            logger.warning(f"Failed to generate summaries: {exc}")

        try:
            canon_updates = await self.archivist.extract_canon_updates(
                project_id=project_id,
                chapter=chapter,
                final_draft=content,
            )

            for fact in canon_updates.get("facts", []) or []:
                await self.canon_storage.add_fact(project_id, fact)

            for event in canon_updates.get("timeline_events", []) or []:
                await self.canon_storage.add_timeline_event(project_id, event)

            for state in canon_updates.get("character_states", []) or []:
                await self.canon_storage.update_character_state(project_id, state)

            try:
                report = await self.canon_storage.detect_conflicts(
                    project_id=project_id,
                    chapter=chapter,
                    new_facts=canon_updates.get("facts", []) or [],
                    new_timeline_events=canon_updates.get("timeline_events", []) or [],
                    new_character_states=canon_updates.get("character_states", []) or [],
                )
                await self.draft_storage.save_conflict_report(
                    project_id=project_id,
                    chapter=chapter,
                    report=report,
                )
            except Exception as exc:
                logger.warning(f"Failed to detect conflicts: {exc}")
        except Exception as exc:
            logger.warning(f"Failed to update canon: {exc}")

    async def _detect_proposals(self, project_id: str, content: Any) -> List[Dict]:
        """Detect setting proposals from content."""
        try:
            if hasattr(content, "content"):
                content_text = content.content
            else:
                content_text = str(content)

            chars = await self.card_storage.list_character_cards(project_id)
            worlds = await self.card_storage.list_world_cards(project_id)
            existing = chars + worlds

            proposals = await self.archivist.detect_setting_changes(content_text, existing)
            return [p.model_dump() for p in proposals]
        except Exception as exc:
            logger.warning(f"Proposal detection failed: {exc}")
            return []

    def _estimate_context_tokens(self, context_package: Dict[str, Any]) -> int:
        """Estimate tokens for context package only."""
        total = 0
        for key in ["full_facts", "summary_with_events", "summary_only", "title_only", "volume_summaries"]:
            for item in context_package.get(key, []) or []:
                total += len(str(item)) // 2
        return total

    def _trim_context_package(
        self,
        context_package: Dict[str, Any],
        max_tokens: int,
    ) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        """Trim low-priority context to fit within max_tokens."""
        trimmed = dict(context_package or {})
        for key in ["full_facts", "summary_with_events", "summary_only", "title_only", "volume_summaries"]:
            trimmed[key] = list(trimmed.get(key, []) or [])

        before = self._estimate_context_tokens(trimmed)
        if before <= max_tokens:
            return trimmed, {"trimmed": False, "before": before, "after": before}

        if max_tokens <= 0:
            for key in ["summary_with_events", "summary_only", "title_only", "volume_summaries"]:
                trimmed[key] = []
            return trimmed, {"trimmed": True, "before": before, "after": self._estimate_context_tokens(trimmed)}

        removal_order = ["title_only", "volume_summaries", "summary_only", "summary_with_events"]
        while self._estimate_context_tokens(trimmed) > max_tokens:
            removed_any = False
            for key in removal_order:
                if trimmed[key]:
                    trimmed[key].pop(0)
                    removed_any = True
                    if self._estimate_context_tokens(trimmed) <= max_tokens:
                        break
            if not removed_any:
                break

        after = self._estimate_context_tokens(trimmed)
        return trimmed, {"trimmed": True, "before": before, "after": after}
