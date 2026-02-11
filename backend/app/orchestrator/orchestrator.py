"""
Orchestrator
Coordinates the multi-agent writing workflow.
"""

from enum import Enum
import asyncio
import time
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Tuple

from app.llm_gateway import get_gateway
from app.storage import CardStorage, CanonStorage, DraftStorage, MemoryPackStorage
from app.agents import ArchivistAgent, WriterAgent, EditorAgent
from app.context_engine.select_engine import ContextSelectEngine
from app.context_engine.trace_collector import trace_collector
from app.orchestrator.storage_adapter import UnifiedStorageAdapter
from app.utils.chapter_id import ChapterIDValidator
from app.utils.logger import get_logger
from app.schemas.canon import Fact, TimelineEvent, CharacterState
from app.schemas.draft import ChapterSummary, CardProposal
from app.schemas.card import CharacterCard, WorldCard, StyleCard
from app.schemas.evidence import EvidenceItem
from app.services.chapter_binding_service import chapter_binding_service

logger = get_logger(__name__)


class SessionStatus(str, Enum):
    """Session status values."""

    IDLE = "idle"
    GENERATING_BRIEF = "generating_brief"
    WRITING_DRAFT = "writing_draft"
    EDITING = "editing"
    WAITING_FEEDBACK = "waiting_feedback"
    WAITING_USER_INPUT = "waiting_user_input"
    COMPLETED = "completed"
    ERROR = "error"


class Orchestrator:
    """Coordinates the multi-agent writing workflow."""

    def __init__(self, data_dir: str = "../data", progress_callback: Optional[Callable] = None):
        self.card_storage = CardStorage(data_dir)
        self.canon_storage = CanonStorage(data_dir)
        self.draft_storage = DraftStorage(data_dir)
        self.memory_pack_storage = MemoryPackStorage(data_dir)

        self.gateway = get_gateway()

        self.archivist = ArchivistAgent(self.gateway, self.card_storage, self.canon_storage, self.draft_storage)
        self.writer = WriterAgent(self.gateway, self.card_storage, self.canon_storage, self.draft_storage)
        self.editor = EditorAgent(self.gateway, self.card_storage, self.canon_storage, self.draft_storage)

        self.storage_adapter = UnifiedStorageAdapter(self.card_storage, self.canon_storage, self.draft_storage)
        self.select_engine = ContextSelectEngine()

        self.progress_callback = progress_callback
        self.current_status = SessionStatus.IDLE
        self.current_project_id: Optional[str] = None
        self.current_chapter: Optional[str] = None
        self.iteration_count = 0
        self.max_iterations = 5
        self.question_round = 0
        self.max_question_rounds = 2
        self.max_research_rounds = 5
        self._stream_task: Optional[asyncio.Task] = None
        self._last_stream_results: Dict[str, Dict[str, Any]] = {}

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
        self.question_round = 0
        self._last_stream_results = {}

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

            context_bundle = await self._prepare_writer_context(
                project_id=project_id,
                chapter=chapter,
                chapter_goal=chapter_goal,
                scene_brief=scene_brief,
                character_names=character_names,
            )
            writer_context = context_bundle["writer_context"]
            critical_items = context_bundle["critical_items"]
            dynamic_items = context_bundle["dynamic_items"]
            context_debug = self._build_context_debug(context_bundle.get("working_memory_payload"))

            questions = context_bundle.get("questions")
            if questions is None:
                questions = await self.writer.generate_questions(
                    context_package=writer_context.get("context_package"),
                    scene_brief=scene_brief,
                    chapter_goal=chapter_goal,
                )
            if questions and self.question_round < self.max_question_rounds:
                self.question_round += 1
                await self._update_status(SessionStatus.WAITING_USER_INPUT, "Waiting for user input...")
                return {
                    "success": True,
                    "status": SessionStatus.WAITING_USER_INPUT,
                    "questions": questions,
                    "scene_brief": scene_brief,
                    "question_round": self.question_round,
                    "context_debug": context_debug,
                }

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

            result = await self._run_writing_flow(
                project_id=project_id,
                chapter=chapter,
                writer_context=writer_context,
                target_word_count=target_word_count,
                working_memory_payload=context_bundle.get("working_memory_payload"),
            )
            if result.get("success"):
                result["scene_brief"] = scene_brief
                if context_debug:
                    result["context_debug"] = context_debug
            return result

        except Exception as exc:
            return await self._handle_error(f"Session error: {exc}")

    async def run_research_only(
        self,
        project_id: str,
        chapter: str,
        chapter_title: str,
        chapter_goal: str,
        character_names: Optional[list] = None,
        user_answers: Optional[List[Dict[str, Any]]] = None,
        offline: bool = False,
    ) -> Dict[str, Any]:
        """Run archivist + research loop only (no draft generation).

        This is used for regression evaluation of agent behaviors:
        - progress events and trace visibility
        - retrieval coverage and sufficiency checks
        - question triggering rules
        """
        self.current_project_id = project_id
        self.current_chapter = chapter
        self.iteration_count = 0
        self.question_round = 0

        try:
            scene_brief = None
            try:
                scene_brief = await self.draft_storage.get_scene_brief(project_id, chapter)
            except Exception:
                scene_brief = None

            if not scene_brief and not offline:
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
                    return await self._handle_error("Scene brief generation failed")
                scene_brief = archivist_result["scene_brief"]

            if not scene_brief:
                return await self._handle_error("Scene brief not available for offline research")

            working_memory_payload = await self._run_research_loop(
                project_id=project_id,
                chapter=chapter,
                chapter_goal=chapter_goal,
                scene_brief=scene_brief,
                user_answers=user_answers,
                offline=offline,
            )
            if working_memory_payload:
                await self._save_memory_pack(
                    project_id=project_id,
                    chapter=chapter,
                    chapter_goal=chapter_goal,
                    scene_brief=scene_brief,
                    working_memory_payload=working_memory_payload,
                    source="research_only",
                )
            context_debug = self._build_context_debug(working_memory_payload)
            questions = (working_memory_payload or {}).get("questions") or []

            return {
                "success": True,
                "status": "research_completed",
                "scene_brief": scene_brief,
                "questions": questions,
                "context_debug": context_debug,
            }
        except Exception as exc:
            return await self._handle_error(f"Research only session error: {exc}")

    async def ensure_memory_pack_payload(
        self,
        project_id: str,
        chapter: str,
        chapter_goal: Optional[str] = None,
        scene_brief: Any = None,
        user_feedback: str = "",
        force_refresh: bool = False,
        source: str = "editor",
    ) -> Optional[Dict[str, Any]]:
        """Ensure the latest memory pack payload exists for the chapter."""
        self.current_project_id = project_id
        self.current_chapter = chapter

        resolved_scene_brief = scene_brief
        if resolved_scene_brief is None:
            try:
                resolved_scene_brief = await self.draft_storage.get_scene_brief(project_id, chapter)
            except Exception:
                resolved_scene_brief = None

        goal_text = self._resolve_chapter_goal(chapter_goal or "", resolved_scene_brief, user_feedback)
        if not goal_text:
            goal_text = "未提供"

        return await self._prepare_memory_pack_payload(
            project_id=project_id,
            chapter=chapter,
            chapter_goal=goal_text,
            scene_brief=resolved_scene_brief,
            user_answers=None,
            force_refresh=force_refresh,
            source=source,
        )

    async def ensure_memory_pack(
        self,
        project_id: str,
        chapter: str,
        chapter_goal: Optional[str] = None,
        scene_brief: Any = None,
        user_feedback: str = "",
        force_refresh: bool = False,
        source: str = "editor",
    ) -> Optional[Dict[str, Any]]:
        """Ensure the latest memory pack exists for the chapter and return the full pack."""
        self.current_project_id = project_id
        self.current_chapter = chapter

        resolved_scene_brief = scene_brief
        if resolved_scene_brief is None:
            try:
                resolved_scene_brief = await self.draft_storage.get_scene_brief(project_id, chapter)
            except Exception:
                resolved_scene_brief = None

        goal_text = self._resolve_chapter_goal(chapter_goal or "", resolved_scene_brief, user_feedback)
        if not goal_text:
            goal_text = "未提供"

        if not force_refresh:
            existing_pack = await self._load_memory_pack(project_id, chapter)
            existing_payload = self._extract_memory_pack_payload(existing_pack)
            if existing_pack and existing_payload:
                if not existing_pack.get("card_snapshot"):
                    try:
                        existing_pack["card_snapshot"] = await self._build_card_snapshot(project_id, existing_payload)
                        await self.memory_pack_storage.write_pack(project_id, chapter, existing_pack)
                    except Exception as exc:
                        logger.warning(f"Memory pack snapshot enrichment failed: {exc}")
                await self._emit_progress("使用已生成记忆包", stage="memory_pack", note=source)
                return existing_pack

        working_memory_payload = await self._build_working_memory_payload(
            project_id=project_id,
            chapter=chapter,
            chapter_goal=goal_text,
            scene_brief=resolved_scene_brief,
            user_answers=None,
        )
        if not working_memory_payload:
            if not force_refresh:
                return None
            existing_pack = await self._load_memory_pack(project_id, chapter)
            existing_payload = self._extract_memory_pack_payload(existing_pack)
            if existing_pack and existing_payload:
                await self._emit_progress("复用已有记忆包", stage="memory_pack", note="fallback")
                return existing_pack
            return None

        saved_pack = await self._save_memory_pack(
            project_id=project_id,
            chapter=chapter,
            chapter_goal=goal_text,
            scene_brief=resolved_scene_brief,
            working_memory_payload=working_memory_payload,
            source=source,
        )
        if saved_pack:
            await self._emit_progress("记忆包已更新", stage="memory_pack", note=source)
        return saved_pack

    async def answer_questions(
        self,
        project_id: str,
        chapter: str,
        chapter_title: str,
        chapter_goal: str,
        target_word_count: int,
        answers: List[Dict[str, str]],
        character_names: Optional[list] = None,
    ) -> Dict[str, Any]:
        """Continue session after user answers pre-writing questions."""
        self.current_project_id = project_id
        self.current_chapter = chapter

        scene_brief = await self.draft_storage.get_scene_brief(project_id, chapter)
        if not scene_brief:
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
                return await self._handle_error("Scene brief generation failed")
            scene_brief = archivist_result["scene_brief"]

        context_bundle = await self._prepare_writer_context(
            project_id=project_id,
            chapter=chapter,
            chapter_goal=chapter_goal,
            scene_brief=scene_brief,
            character_names=character_names,
            user_answers=answers,
        )
        await self._persist_answer_memory(project_id, chapter, answers)
        writer_context = context_bundle["writer_context"]
        writer_context["user_answers"] = answers
        context_debug = self._build_context_debug(context_bundle.get("working_memory_payload"))

        followup_questions = context_bundle.get("questions") or []
        answered_keys = set()
        for item in answers or []:
            if not isinstance(item, dict):
                continue
            q_type = str(item.get("type") or "").strip()
            q_text = str(item.get("question") or item.get("text") or "").strip()
            q_key = str(item.get("key") or item.get("question_key") or "").strip()
            if q_key:
                answered_keys.add(("key", q_key))
            if q_type and q_text:
                answered_keys.add((q_type, q_text))
        if answered_keys and followup_questions:
            followup_questions = [
                q
                for q in followup_questions
                if ("key", str(q.get("key") or "").strip()) not in answered_keys
                and (str(q.get("type") or "").strip(), str(q.get("text") or "").strip()) not in answered_keys
            ]

        if followup_questions and answers and self.question_round < self.max_question_rounds:
            self.question_round += 1
            await self._update_status(SessionStatus.WAITING_USER_INPUT, "Waiting for user input...")
            return {
                "success": True,
                "status": SessionStatus.WAITING_USER_INPUT,
                "questions": followup_questions,
                "scene_brief": scene_brief,
                "question_round": self.question_round,
                "context_debug": context_debug,
            }

        result = await self._run_writing_flow(
            project_id=project_id,
            chapter=chapter,
            writer_context=writer_context,
            target_word_count=target_word_count,
            working_memory_payload=context_bundle.get("working_memory_payload"),
        )
        if result.get("success"):
            result["scene_brief"] = scene_brief
            if context_debug:
                result["context_debug"] = context_debug
        return result

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
            latest_draft = await self.draft_storage.get_draft(project_id, chapter, latest_version)
            draft_length = len(latest_draft.content) if latest_draft and latest_draft.content else 0

            if draft_length <= 500:
                await self._update_status(SessionStatus.WRITING_DRAFT, "Writer is refining based on feedback...")
                scene_brief = await self.draft_storage.get_scene_brief(project_id, chapter)
                if not scene_brief:
                    return await self._handle_error("Scene brief not found for rewrite")

                context_bundle = await self._prepare_writer_context(
                    project_id=project_id,
                    chapter=chapter,
                    chapter_goal=scene_brief.goal,
                    scene_brief=scene_brief,
                    character_names=None,
                )
                writer_context = context_bundle["writer_context"]
                writer_context["user_feedback"] = feedback

                writer_result = await self.writer.execute(
                    project_id=project_id,
                    chapter=chapter,
                    context=writer_context,
                )
                if not writer_result.get("success"):
                    return await self._handle_error("Rewrite failed")

                draft = writer_result["draft"]
                await self._update_status(SessionStatus.WAITING_FEEDBACK, "Waiting for user feedback...")
                proposals = await self._detect_proposals(project_id, draft)

                return {
                    "success": True,
                    "status": SessionStatus.WAITING_FEEDBACK,
                    "draft": draft,
                    "version": draft.version,
                    "iteration": self.iteration_count,
                    "proposals": proposals,
                }

            await self._update_status(SessionStatus.EDITING, "Revising based on feedback...")

            memory_pack_payload = await self.ensure_memory_pack(
                project_id=project_id,
                chapter=chapter,
                chapter_goal="",
                scene_brief=None,
                user_feedback=feedback,
                force_refresh=False,
                source="editor",
            )

            editor_result = await self.editor.execute(
                project_id=project_id,
                chapter=chapter,
                context={
                    "draft_version": latest_version,
                    "user_feedback": feedback,
                    "rejected_entities": rejected_entities or [],
                    "memory_pack": memory_pack_payload,
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

    def _resolve_chapter_goal(self, chapter_goal: str, scene_brief: Any, fallback_text: str = "") -> str:
        goal_text = str(chapter_goal or "").strip()
        if not goal_text and scene_brief is not None:
            goal_text = str(getattr(scene_brief, "goal", "") or "").strip()
        if not goal_text and fallback_text:
            goal_text = str(fallback_text or "").strip()
        if not goal_text and scene_brief is not None:
            goal_text = str(getattr(scene_brief, "summary", "") or getattr(scene_brief, "title", "") or "").strip()

        feedback = str(fallback_text or "").strip()
        if feedback:
            if not goal_text:
                goal_text = feedback
            else:
                # Editor flows pass user_feedback as fallback_text. Even when a scene brief exists,
                # we still want the latest instruction to influence retrieval/entity extraction.
                if feedback not in goal_text:
                    goal_text = f"{goal_text}\n\n用户最新指令：{feedback}"
        return goal_text

    async def _build_working_memory_payload(
        self,
        project_id: str,
        chapter: str,
        chapter_goal: str,
        scene_brief: Any,
        user_answers: Optional[List[Dict[str, Any]]] = None,
        offline: bool = False,
    ) -> Optional[Dict[str, Any]]:
        working_memory_payload = None
        try:
            working_memory_payload = await self._run_research_loop(
                project_id=project_id,
                chapter=chapter,
                chapter_goal=chapter_goal,
                scene_brief=scene_brief,
                user_answers=user_answers,
                offline=offline,
            )
        except Exception as exc:
            logger.warning(f"Research loop failed: {exc}")

        if not working_memory_payload:
            try:
                from app.services.working_memory_service import working_memory_service
                working_memory_payload = await working_memory_service.prepare(
                    project_id=project_id,
                    chapter=chapter,
                    scene_brief=scene_brief,
                    chapter_goal=chapter_goal,
                    user_answers=user_answers,
                    force_minimum_questions=False,
                )
            except Exception as exc:
                logger.warning(f"Working memory build failed: {exc}")

        if working_memory_payload and not working_memory_payload.get("research_stop_reason"):
            working_memory_payload["questions"] = []

        return working_memory_payload

    async def _load_memory_pack(self, project_id: str, chapter: str) -> Optional[Dict[str, Any]]:
        try:
            return await self.memory_pack_storage.read_pack(project_id, chapter)
        except Exception as exc:
            logger.warning(f"Memory pack read failed: {exc}")
        return None

    def _extract_memory_pack_payload(self, pack: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if not pack:
            return None
        payload = pack.get("payload") or pack.get("working_memory_payload")
        if isinstance(payload, dict):
            return payload
        return None

    async def _save_memory_pack(
        self,
        project_id: str,
        chapter: str,
        chapter_goal: str,
        scene_brief: Any,
        working_memory_payload: Optional[Dict[str, Any]],
        source: str,
    ) -> Optional[Dict[str, Any]]:
        if not working_memory_payload:
            return None
        card_snapshot = await self._build_card_snapshot(project_id, working_memory_payload)
        pack = {
            "chapter": chapter,
            "built_at": datetime.now(timezone.utc).isoformat(),
            "source": source,
            "chapter_goal": chapter_goal,
            "scene_brief": {
                "title": str(getattr(scene_brief, "title", "") or ""),
                "goal": str(getattr(scene_brief, "goal", "") or ""),
            } if scene_brief is not None else {},
            "card_snapshot": card_snapshot,
            "payload": working_memory_payload,
        }
        try:
            await self.memory_pack_storage.write_pack(project_id, chapter, pack)
            return pack
        except Exception as exc:
            logger.warning(f"Memory pack save failed: {exc}")
            return None

    async def _prepare_memory_pack_payload(
        self,
        project_id: str,
        chapter: str,
        chapter_goal: str,
        scene_brief: Any,
        user_answers: Optional[List[Dict[str, Any]]] = None,
        force_refresh: bool = False,
        source: str = "writer",
    ) -> Optional[Dict[str, Any]]:
        existing_pack: Optional[Dict[str, Any]] = None
        if not force_refresh:
            existing_pack = await self._load_memory_pack(project_id, chapter)
            existing_payload = self._extract_memory_pack_payload(existing_pack)
            if existing_payload:
                await self._emit_progress("使用已生成记忆包", stage="memory_pack", note=source)
                return existing_payload

        working_memory_payload = await self._build_working_memory_payload(
            project_id=project_id,
            chapter=chapter,
            chapter_goal=chapter_goal,
            scene_brief=scene_brief,
            user_answers=user_answers,
        )

        if working_memory_payload:
            await self._save_memory_pack(
                project_id=project_id,
                chapter=chapter,
                chapter_goal=chapter_goal,
                scene_brief=scene_brief,
                working_memory_payload=working_memory_payload,
                source=source,
            )
            await self._emit_progress("记忆包已更新", stage="memory_pack", note=source)
            return working_memory_payload

        if force_refresh:
            existing_pack = await self._load_memory_pack(project_id, chapter)
            existing_payload = self._extract_memory_pack_payload(existing_pack)
            if existing_payload:
                await self._emit_progress("复用已有记忆包", stage="memory_pack", note="fallback")
                return existing_payload

        return None

    async def _build_card_snapshot(self, project_id: str, working_memory_payload: Dict[str, Any]) -> Dict[str, Any]:
        """Build compact snapshots of relevant cards to reduce editor hallucinations."""
        evidence_items = ((working_memory_payload.get("evidence_pack") or {}).get("items") or [])
        seed_entities = working_memory_payload.get("seed_entities") or []

        card_names: List[str] = []
        for item in evidence_items:
            if not isinstance(item, dict):
                continue
            source = item.get("source") or {}
            card = str(source.get("card") or "").strip()
            if card and card not in card_names:
                card_names.append(card)
        for name in seed_entities:
            n = str(name or "").strip()
            if n and n not in card_names:
                card_names.append(n)
        card_names = card_names[:12]

        characters = []
        world = []
        for name in card_names:
            try:
                char_card = await self.card_storage.get_character_card(project_id, name)
            except Exception:
                char_card = None
            if char_card:
                characters.append(char_card.model_dump(mode="json"))
                continue
            try:
                world_card = await self.card_storage.get_world_card(project_id, name)
            except Exception:
                world_card = None
            if world_card:
                world.append(world_card.model_dump(mode="json"))

        style = None
        try:
            style_card = await self.card_storage.get_style_card(project_id)
            if style_card:
                style = style_card.model_dump(mode="json")
        except Exception:
            style = None

        return {"characters": characters[:8], "world": world[:8], "style": style}

    async def _prepare_writer_context(
        self,
        project_id: str,
        chapter: str,
        chapter_goal: str,
        scene_brief: Any,
        character_names: Optional[list],
        user_answers: Optional[List[Dict[str, Any]]] = None,
        force_refresh_memory_pack: bool = True,
        memory_pack_source: str = "writer",
    ) -> Dict[str, Any]:
        """Prepare context for writer and return trace info."""
        critical_items = await self.select_engine.deterministic_select(
            project_id, "writer", self.storage_adapter
        )

        query = f"{scene_brief.title} {scene_brief.goal}" if scene_brief else chapter_goal
        try:
            from app.services.chapter_binding_service import chapter_binding_service
            seeds = await chapter_binding_service.get_seed_entities(
                project_id,
                chapter,
                window=2,
                ensure_built=True,
            )
            if seeds:
                query = f"{query} {' '.join(seeds)}".strip()
        except Exception:
            seeds = []
        dynamic_items = await self.select_engine.retrieval_select(
            project_id=project_id,
            query=query,
            item_types=["character", "world", "fact", "text_chunk"],
            storage=self.storage_adapter,
            top_k=10,
        )

        style_card = next((item.content for item in critical_items if item.type.value == "style_card"), None)

        character_cards = []
        world_cards = []
        facts = []
        text_chunks = []

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
            elif item.type.value == "text_chunk":
                source = item.metadata.get("source") or {}
                text_chunks.append(
                    {
                        "text": item.content,
                        "chapter": source.get("chapter"),
                        "source": source,
                    }
                )

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

        tail_chunks = context_package.get("previous_tail_chunks") or []
        if tail_chunks:
            seen = {(item.get("chapter"), item.get("text")) for item in text_chunks if isinstance(item, dict)}
            for chunk in tail_chunks:
                if not isinstance(chunk, dict):
                    continue
                key = (chunk.get("chapter"), chunk.get("text"))
                if key in seen:
                    continue
                text_chunks.append(chunk)
                seen.add(key)

        if character_names:
            for name in character_names:
                if not any(getattr(c, "name", None) == name for c in character_cards):
                    card = await self.card_storage.get_character_card(project_id, name)
                    if card:
                        character_cards.append(card)

        working_memory_payload = await self._prepare_memory_pack_payload(
            project_id=project_id,
            chapter=chapter,
            chapter_goal=chapter_goal,
            scene_brief=scene_brief,
            user_answers=user_answers,
            force_refresh=force_refresh_memory_pack,
            source=memory_pack_source,
        )

        writer_context = {
            "scene_brief": scene_brief,
            "chapter_goal": chapter_goal,
            "style_card": style_card,
            "character_cards": character_cards,
            "world_cards": world_cards,
            "facts": facts,
            "text_chunks": text_chunks,
            "timeline": timeline,
            "character_states": character_states,
            "context_package": context_package,
        }
        if working_memory_payload:
            writer_context["working_memory"] = working_memory_payload.get("working_memory")
            writer_context["evidence_pack"] = working_memory_payload.get("evidence_pack")
            writer_context["gaps"] = working_memory_payload.get("gaps")
            writer_context["unresolved_gaps"] = working_memory_payload.get("unresolved_gaps")

        return {
            "writer_context": writer_context,
            "critical_items": critical_items,
            "dynamic_items": dynamic_items,
            "questions": working_memory_payload.get("questions") if working_memory_payload else [],
            "working_memory_payload": working_memory_payload,
        }

    async def _run_writing_flow(
        self,
        project_id: str,
        chapter: str,
        writer_context: Dict[str, Any],
        target_word_count: int,
        working_memory_payload: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Run writer flow and wait for user feedback."""
        await self._update_status(SessionStatus.WRITING_DRAFT, "Writer is drafting...")

        writer_payload = dict(writer_context)
        writer_payload["target_word_count"] = target_word_count

        if self._stream_task:
            self._stream_task.cancel()
            self._stream_task = None

        try:
            self._stream_task = asyncio.create_task(
                self._stream_writer_output(
                    project_id,
                    chapter,
                    writer_payload,
                    working_memory_payload=working_memory_payload,
                )
            )
            await self._stream_task
            self._stream_task = None
        except asyncio.CancelledError:
            return await self._handle_error("Stream cancelled")
        except Exception as exc:
            return await self._handle_error(f"Draft generation failed: {exc}")

        versions = await self.draft_storage.list_draft_versions(project_id, chapter)
        latest_version = versions[-1] if versions else "v1"
        draft = await self.draft_storage.get_draft(project_id, chapter, latest_version)
        if not draft:
            fallback = self._last_stream_results.get(str(chapter)) or {}
            fallback_draft = fallback.get("draft")
            fallback_proposals = fallback.get("proposals") or []
            if isinstance(fallback_draft, dict) and str(fallback_draft.get("content") or "").strip():
                await self._update_status(SessionStatus.WAITING_FEEDBACK, "Waiting for user feedback...")
                return {
                    "success": True,
                    "status": SessionStatus.WAITING_FEEDBACK,
                    "draft_v1": fallback_draft,
                    "iteration": self.iteration_count,
                    "proposals": fallback_proposals,
                }
            return await self._handle_error("Draft generation failed")

        await self._update_status(SessionStatus.WAITING_FEEDBACK, "Waiting for user feedback...")
        draft_text = draft.content if hasattr(draft, "content") else str(draft)
        proposals = await self._detect_proposals(project_id, draft_text)

        return {
            "success": True,
            "status": SessionStatus.WAITING_FEEDBACK,
            "draft_v1": draft,
            "iteration": self.iteration_count,
            "proposals": proposals,
        }

    async def _run_research_loop(
        self,
        project_id: str,
        chapter: str,
        chapter_goal: str,
        scene_brief: Any,
        user_answers: Optional[List[Dict[str, Any]]] = None,
        offline: bool = False,
    ) -> Optional[Dict[str, Any]]:
        """Run multi-round research loop (max rounds with early stop)."""
        try:
            from app.services.working_memory_service import working_memory_service
        except Exception:
            return None

        research_trace: List[Dict[str, Any]] = []
        extra_queries: List[str] = []
        working_payload: Optional[Dict[str, Any]] = None
        stop_reason = "unknown"

        await self._emit_progress("正在阅读前文...", stage="read_previous", round=0)
        await self._emit_progress("正在阅读相关事实摘要...", stage="read_facts", round=0)
        character_names = self._extract_scene_brief_names(scene_brief, limit=3)
        instruction_entities = await chapter_binding_service.extract_entities_from_text(project_id, chapter_goal)
        instruction_characters = instruction_entities.get("characters") or []
        loose_mentions = chapter_binding_service.extract_loose_mentions(chapter_goal, limit=6)

        mention_candidates: List[str] = []
        for name in instruction_characters + character_names + loose_mentions:
            if name and name not in mention_candidates:
                mention_candidates.append(name)

        # Pre-check which mentioned entities have existing cards. This list is used as
        # retrieval seeds (to improve recall), but UI should display the *actual*
        # cards hit from evidence_pack/card_snapshot later.
        card_hits: List[str] = []
        missing_cards: List[str] = []
        for name in mention_candidates[:12]:
            resolved = None
            try:
                resolved = await self.card_storage.get_character_card(project_id, name)
            except Exception:
                resolved = None
            if resolved:
                card_hits.append(name)
                continue
            try:
                resolved = await self.card_storage.get_world_card(project_id, name)
            except Exception:
                resolved = None
            if resolved:
                card_hits.append(name)
                continue
            missing_cards.append(name)

        try:
            initial_gaps = working_memory_service.build_gap_items(scene_brief, chapter_goal)
            if offline:
                plan_queries: List[str] = []
                for gap in initial_gaps or []:
                    for query in gap.get("queries") or []:
                        if query:
                            plan_queries.append(str(query).strip())
                extra_queries = list(dict.fromkeys([q for q in plan_queries if q]))[:4]
                if extra_queries:
                    await self._emit_progress(
                        "研究计划已生成（离线）",
                        stage="generate_plan",
                        round=1,
                        queries=extra_queries,
                        note="offline_from_gaps",
                    )
            else:
                plan = await self.writer.generate_research_plan(
                    chapter_goal=chapter_goal,
                    unresolved_gaps=initial_gaps,
                    evidence_stats={},
                    round_index=1,
                )
                extra_queries = [str(q).strip() for q in (plan.get("queries") or []) if str(q).strip()]
                if extra_queries:
                    await self._emit_progress(
                        "研究计划已生成",
                        stage="generate_plan",
                        round=1,
                        queries=extra_queries,
                        note=str(plan.get("note") or ""),
                    )
        except Exception as exc:
            logger.warning(f"Initial research plan failed: {exc}")

        for round_index in range(1, self.max_research_rounds + 1):
            await self._emit_progress(
                f"正在思考...（第{round_index}轮）",
                stage="prepare_retrieval",
                round=round_index,
                note="整理缺口并准备检索",
            )

            merged_extra_queries = extra_queries
            retrieval_seeds = [q for q in (card_hits + missing_cards) if str(q or "").strip()]
            if retrieval_seeds:
                merged_extra_queries = list(dict.fromkeys([q for q in (extra_queries + retrieval_seeds) if str(q or "").strip()]))[:8]

            payload = await working_memory_service.prepare(
                project_id=project_id,
                chapter=chapter,
                scene_brief=scene_brief,
                chapter_goal=chapter_goal,
                user_answers=user_answers,
                extra_queries=merged_extra_queries,
                force_minimum_questions=False,
                semantic_rerank=not offline,
            )
            if not payload:
                stop_reason = "empty_payload"
                break

            if round_index == 1:
                snapshot = await self._build_card_snapshot(project_id, payload)
                hit_characters = [
                    str(item.get("name") or "").strip()
                    for item in (snapshot.get("characters") or [])
                    if isinstance(item, dict) and str(item.get("name") or "").strip()
                ]
                hit_world = [
                    str(item.get("name") or "").strip()
                    for item in (snapshot.get("world") or [])
                    if isinstance(item, dict) and str(item.get("name") or "").strip()
                ]
                hit_cards = list(dict.fromkeys((hit_characters + hit_world)))[:5]
                if hit_cards:
                    card_message = "正在查询设定“" + "”“".join(hit_cards) + "”"
                else:
                    card_message = "正在查询相关设定..."

                await self._emit_progress(
                    card_message,
                    stage="lookup_cards",
                    round=0,
                    queries=hit_cards,
                    payload={
                        "hit_characters": hit_characters[:10],
                        "hit_world": hit_world[:10],
                        "seed_entities": payload.get("seed_entities") or [],
                        "source": "card_snapshot",
                    },
                )

            retrieval_requests = payload.get("retrieval_requests") or []
            for req in retrieval_requests:
                req["round"] = round_index

            evidence_pack = payload.get("evidence_pack") or {}
            evidence_groups = evidence_pack.get("groups") or []
            stats = evidence_pack.get("stats") or {}
            queries = []
            hits = 0
            for req in retrieval_requests:
                for query in req.get("queries") or []:
                    if query:
                        queries.append(query)
                if not req.get("skipped"):
                    hits += int(req.get("count") or 0)
            queries = list(dict.fromkeys(queries))
            top_sources = self._extract_top_sources(evidence_groups, limit=3)
            await self._emit_progress(
                f"正在检索...（第{round_index}轮）",
                stage="execute_retrieval",
                round=round_index,
                queries=queries,
                hits=hits,
                top_sources=top_sources,
                note="已完成检索，正在整理证据",
            )

            research_trace.append(
                {
                    "round": round_index,
                    "queries": stats.get("queries") or queries,
                    "types": stats.get("types") or {},
                    "count": stats.get("total", len(evidence_pack.get("items") or [])),
                    "hits": hits,
                    "top_sources": top_sources,
                    "extra_queries": extra_queries,
                }
            )

            working_payload = payload
            report = payload.get("sufficiency_report") or {}
            if report.get("sufficient") is True:
                stop_reason = "sufficient"
                await self._emit_progress(
                    "证据判定：充分，准备结束研究",
                    stage="self_check",
                    round=round_index,
                    stop_reason=stop_reason,
                    note="证据充分，提前结束研究",
                )
                break

            if round_index >= self.max_research_rounds:
                stop_reason = "max_rounds"
                await self._emit_progress(
                    "证据仍不足，已到最大轮次",
                    stage="self_check",
                    round=round_index,
                    stop_reason=stop_reason,
                    note="达到最大轮次，进入反问或待确认",
                )
                break

            await self._emit_progress(
                "证据不足，继续检索",
                stage="self_check",
                round=round_index,
                note="证据不足，进入下一轮",
            )

            if offline:
                stop_reason = "offline_stop"
                await self._emit_progress(
                    "离线模式：停止继续规划检索",
                    stage="self_check",
                    round=round_index,
                    stop_reason=stop_reason,
                    note="离线评测仅执行第1轮检索",
                )
                break

            plan = await self.writer.generate_research_plan(
                chapter_goal=chapter_goal,
                unresolved_gaps=payload.get("unresolved_gaps") or [],
                evidence_stats=stats,
                round_index=round_index + 1,
            )
            extra_queries = [str(q).strip() for q in (plan.get("queries") or []) if str(q).strip()]
            if not extra_queries:
                stop_reason = "no_queries"
                await self._emit_progress(
                    "研究计划为空，停止检索",
                    stage="self_check",
                    round=round_index,
                    stop_reason=stop_reason,
                    note="缺口无法转化为有效检索",
                )
                break
            await self._emit_progress(
                "研究计划已生成",
                stage="generate_plan",
                round=round_index + 1,
                queries=extra_queries,
                note=str(plan.get("note") or ""),
            )

        if working_payload is None:
            return None

        report = working_payload.get("sufficiency_report") or {}
        needs_user_input = bool(report.get("needs_user_input"))
        if stop_reason != "max_rounds" or not needs_user_input:
            working_payload["questions"] = []

        if research_trace and stop_reason:
            stop_note = ""
            if stop_reason == "sufficient":
                stop_note = "证据充分，提前结束研究"
            elif stop_reason == "max_rounds":
                stop_note = "达到最大轮次，进入反问或待确认"
            elif stop_reason == "no_queries":
                stop_note = "无法生成有效检索，停止研究"
            else:
                stop_note = "研究流程提前停止"
            research_trace[-1]["stop_reason"] = stop_reason
            research_trace[-1]["note"] = stop_note

        working_payload["research_trace"] = research_trace
        working_payload["research_stop_reason"] = stop_reason
        return working_payload

    async def _stream_writer_output(
        self,
        project_id: str,
        chapter: str,
        writer_payload: Dict[str, Any],
        working_memory_payload: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Stream writer output to client while persisting the final draft."""
        await self._emit_progress("正在撰写...", stage="writing", status="writing")
        if self.progress_callback:
            await self.progress_callback({
                "type": "stream_start",
                "project_id": project_id,
                "chapter": chapter,
            })

        chunks: List[str] = []
        async for chunk in self.writer.execute_stream_draft(
            project_id=project_id,
            chapter=chapter,
            context=writer_payload,
        ):
            if not chunk:
                continue
            if self._stream_task and self._stream_task.cancelled():
                break
            chunks.append(chunk)
            if self.progress_callback:
                await self.progress_callback({
                    "type": "token",
                    "project_id": project_id,
                    "chapter": chapter,
                    "content": chunk,
                })

        final_text = "".join(chunks).strip()
        if not final_text:
            raise RuntimeError("Empty draft result")

        pending_confirmations = self._collect_pending_confirmations(
            final_text=final_text,
            unresolved_gaps=writer_payload.get("unresolved_gaps") or [],
            sufficiency_report=(working_memory_payload or {}).get("sufficiency_report") or {},
        )
        draft = await self.draft_storage.save_draft(
            project_id=project_id,
            chapter=chapter,
            version="v1",
            content=final_text,
            word_count=len(final_text),
            pending_confirmations=pending_confirmations,
        )

        proposals = await self._detect_proposals(project_id, final_text)

        await self._persist_research_trace_memory(
            project_id=project_id,
            chapter=chapter,
            working_memory_payload=working_memory_payload,
        )

        if self.progress_callback:
            try:
                draft_payload = draft.model_dump(mode="json")
            except Exception:
                draft_payload = {
                    "chapter": getattr(draft, "chapter", chapter),
                    "version": getattr(draft, "version", "v1"),
                    "content": getattr(draft, "content", final_text),
                    "word_count": getattr(draft, "word_count", len(final_text)),
                }
            self._last_stream_results[str(chapter)] = {
                "draft": draft_payload,
                "proposals": proposals,
                "timestamp": int(time.time() * 1000),
            }
            await self.progress_callback({
                "type": "stream_end",
                "project_id": project_id,
                "chapter": chapter,
                "draft": draft_payload,
                "proposals": proposals,
            })

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

    async def analyze_chapter(
        self,
        project_id: str,
        chapter: str,
        content: Optional[str] = None,
        chapter_title: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Manually trigger analysis for a chapter (no persistence)."""
        try:
            draft_content = content or ""
            if not draft_content:
                versions = await self.draft_storage.list_draft_versions(project_id, chapter)
                if not versions:
                    return {"success": False, "error": "No draft found"}

                latest = versions[-1]
                draft = await self.draft_storage.get_draft(project_id, chapter, latest)
                if not draft:
                    return {"success": False, "error": "Draft content missing"}
                draft_content = draft.content

            self.current_project_id = project_id
            self.current_chapter = chapter
            await self._update_status(SessionStatus.GENERATING_BRIEF, "Analyzing content...")

            analysis = await self._build_analysis(
                project_id=project_id,
                chapter=chapter,
                content=draft_content,
                chapter_title=chapter_title,
            )

            await self._update_status(SessionStatus.IDLE, "Analysis completed.")
            return {"success": True, "analysis": analysis}
        except Exception as exc:
            return await self._handle_error(f"Analysis failed: {exc}")

    async def _build_analysis(
        self,
        project_id: str,
        chapter: str,
        content: str,
        chapter_title: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Build analysis payload (summary, facts, proposals) without persisting."""
        scene_brief = await self.draft_storage.get_scene_brief(project_id, chapter)
        title = chapter_title or (scene_brief.title if scene_brief and scene_brief.title else chapter)

        summary = await self.archivist.generate_chapter_summary(
            project_id=project_id,
            chapter=chapter,
            chapter_title=title,
            final_draft=content,
        )
        volume_id = summary.volume_id or ChapterIDValidator.extract_volume_id(chapter) or "V1"
        summary_data = summary.model_dump()
        summary_data["chapter"] = chapter
        summary_data["volume_id"] = volume_id
        summary_data["word_count"] = len(content)
        if not summary_data.get("title"):
            summary_data["title"] = title
        summary = ChapterSummary(**summary_data)

        canon_updates = await self.archivist.extract_canon_updates(
            project_id=project_id,
            chapter=chapter,
            final_draft=content,
        )

        facts = canon_updates.get("facts", []) or []
        if len(facts) > 5:
            facts = facts[:5]

        proposals = await self._detect_proposals(project_id, content)

        return {
            "summary": summary.model_dump(),
            "facts": [fact.model_dump() for fact in facts],
            "timeline_events": [event.model_dump() for event in canon_updates.get("timeline_events", []) or []],
            "character_states": [state.model_dump() for state in canon_updates.get("character_states", []) or []],
            "proposals": proposals or [],
        }

    async def analyze_sync(self, project_id: str, chapters: List[str]) -> Dict[str, Any]:
        """Batch analyze and overwrite summaries/facts/cards for selected chapters."""
        results = []
        chapter_list = [str(ch).strip() for ch in (chapters or []) if str(ch).strip()]
        chapters = ChapterIDValidator.sort_chapters(chapter_list)
        total = len(chapters)
        completed = 0

        async def emit_progress(message: str) -> None:
            if not self.progress_callback:
                return
            await self.progress_callback(
                {
                    "status": "sync",
                    "message": message,
                    "project_id": project_id,
                }
            )

        if total == 0:
            return {"success": True, "results": []}

        for chapter in chapters:
            try:
                completed += 1
                await emit_progress(f"同步分析中 ({completed}/{total})：{chapter}")
                versions = await self.draft_storage.list_draft_versions(project_id, chapter)
                if not versions:
                    results.append({"chapter": chapter, "success": False, "error": "No draft found"})
                    continue
                latest = versions[-1]
                draft = await self.draft_storage.get_draft(project_id, chapter, latest)
                if not draft:
                    results.append({"chapter": chapter, "success": False, "error": "Draft content missing"})
                    continue
                analysis = await self._build_analysis(
                    project_id=project_id,
                    chapter=chapter,
                    content=draft.content,
                    chapter_title=None,
                )
                await emit_progress(f"同步保存中 ({completed}/{total})：{chapter}")
                save_result = await self.save_analysis(
                    project_id=project_id,
                    chapter=chapter,
                    analysis=analysis,
                    overwrite=True,
                )
                bindings_result = {"bindings_built": False}
                try:
                    from app.services.chapter_binding_service import chapter_binding_service
                    await emit_progress(f"同步绑定中 ({completed}/{total})：{chapter}")
                    focus_characters: List[str] = []
                    try:
                        focus_characters = await self.archivist.bind_focus_characters(
                            project_id=project_id,
                            chapter=chapter,
                            final_draft=draft.content,
                            limit=5,
                        )
                    except Exception as exc:
                        bindings_result["focus_error"] = str(exc)

                    base_binding = await chapter_binding_service.build_bindings(project_id, chapter, force=True)
                    if focus_characters:
                        base_binding["characters"] = focus_characters
                        base_binding["focus_characters"] = focus_characters
                        base_binding["binding_method"] = "llm_focus"
                    else:
                        base_binding["binding_method"] = base_binding.get("binding_method") or "algorithmic"

                    await chapter_binding_service.write_bindings(project_id, chapter, base_binding)
                    bindings_result["bindings_built"] = True
                    bindings_result["binding_method"] = base_binding.get("binding_method")
                    bindings_result["focus_characters"] = focus_characters
                except Exception as exc:
                    bindings_result["bindings_error"] = str(exc)
                results.append({"chapter": chapter, **save_result, **bindings_result})
            except Exception as exc:
                results.append({"chapter": chapter, "success": False, "error": str(exc)})

        await emit_progress("同步完成")
        return {"success": True, "results": results}

    def _collect_pending_confirmations(
        self,
        final_text: str,
        unresolved_gaps: List[Dict[str, Any]],
        sufficiency_report: Dict[str, Any],
    ) -> List[str]:
        confirmations = self.writer._extract_confirmations(final_text)
        gap_texts = []
        for gap in unresolved_gaps or []:
            if isinstance(gap, dict):
                text = str(gap.get("text") or "").strip()
            else:
                text = str(gap or "").strip()
            if text:
                gap_texts.append(text)
        missing_entities = [str(item).strip() for item in (sufficiency_report.get("missing_entities") or []) if str(item).strip()]
        merged = list(dict.fromkeys(confirmations + gap_texts + missing_entities))
        return merged[:12]

    async def _persist_research_trace_memory(
        self,
        project_id: str,
        chapter: str,
        working_memory_payload: Optional[Dict[str, Any]],
    ) -> None:
        if not working_memory_payload:
            return
        trace = working_memory_payload.get("research_trace") or []
        stop_reason = working_memory_payload.get("research_stop_reason") or ""
        report = working_memory_payload.get("sufficiency_report") or {}
        if not trace:
            return

        lines = [f"研究轮次: {len(trace)}", f"停止原因: {stop_reason or 'unknown'}"]
        if report:
            needs = "是" if report.get("needs_user_input") else "否"
            lines.append(f"证据不足需反问: {needs}")
            weak = report.get("weak_gaps") or []
            if weak:
                lines.append("薄弱缺口: " + "；".join([str(item) for item in weak[:4]]))

        for item in trace[:5]:
            if not isinstance(item, dict):
                continue
            queries = item.get("queries") or []
            types = item.get("types") or {}
            count = item.get("count")
            lines.append(f"第{item.get('round')}轮: {', '.join(queries[:4])} | types={types} | count={count}")

        text = "\n".join([line for line in lines if line])
        if not text:
            return

        try:
            from app.services.evidence_service import evidence_service
        except Exception:
            return

        item = EvidenceItem(
            id=f"memory:research:{int(time.time())}",
            type="memory",
            text=text,
            source={"chapter": chapter, "kind": "research_trace"},
            scope="chapter",
            entities=[],
            meta={"kind": "research_trace"},
        )
        await evidence_service.append_memory_items(project_id, [item])

    async def _emit_progress(self, message: str, **kwargs) -> None:
        if not self.progress_callback:
            return
        status = kwargs.pop("status", "research")
        payload = {
            "status": status,
            "message": message,
            "project_id": self.current_project_id,
            "chapter": self.current_chapter,
            "timestamp": int(time.time() * 1000),
        }
        for key, value in kwargs.items():
            if value is not None:
                payload[key] = value
        await self.progress_callback(payload)

    async def analyze_batch(self, project_id: str, chapters: List[str]) -> Dict[str, Any]:
        """Batch analyze chapters and return analysis payload."""
        results = []
        for chapter in chapters:
            try:
                versions = await self.draft_storage.list_draft_versions(project_id, chapter)
                if not versions:
                    results.append({"chapter": chapter, "success": False, "error": "No draft found"})
                    continue
                latest = versions[-1]
                draft = await self.draft_storage.get_draft(project_id, chapter, latest)
                if not draft:
                    results.append({"chapter": chapter, "success": False, "error": "Draft content missing"})
                    continue
                analysis = await self._build_analysis(
                    project_id=project_id,
                    chapter=chapter,
                    content=draft.content,
                    chapter_title=None,
                )
                results.append({"chapter": chapter, "success": True, "analysis": analysis})
            except Exception as exc:
                results.append({"chapter": chapter, "success": False, "error": str(exc)})

        return {"success": True, "results": results}

    async def save_analysis_batch(
        self,
        project_id: str,
        items: List[Dict[str, Any]],
        overwrite: bool = False,
    ) -> Dict[str, Any]:
        """Persist analysis payload batch."""
        results = []
        for item in items:
            chapter = item.get("chapter")
            analysis = item.get("analysis", {}) if isinstance(item, dict) else {}
            if not chapter:
                results.append({"chapter": "", "success": False, "error": "Missing chapter"})
                continue
            try:
                result = await self.save_analysis(
                    project_id=project_id,
                    chapter=chapter,
                    analysis=analysis,
                    overwrite=overwrite,
                )
                results.append({"chapter": chapter, **result})
            except Exception as exc:
                results.append({"chapter": chapter, "success": False, "error": str(exc)})
        return {"success": True, "results": results}

    async def save_analysis(
        self,
        project_id: str,
        chapter: str,
        analysis: Dict[str, Any],
        overwrite: bool = False,
    ) -> Dict[str, Any]:
        """Persist analysis output (summary, facts, cards)."""
        try:
            summary_data = analysis.get("summary", {}) or {}
            summary_data["chapter"] = self._normalize_chapter_id(
                summary_data.get("chapter") or chapter
            )
            summary = ChapterSummary(**summary_data)
            summary.new_facts = []
            if not summary.volume_id:
                summary.volume_id = ChapterIDValidator.extract_volume_id(summary.chapter) or "V1"
            if not summary.title:
                summary.title = chapter

            await self.draft_storage.save_chapter_summary(project_id, summary)

            volume_summaries = await self.draft_storage.list_chapter_summaries(
                project_id,
                volume_id=summary.volume_id,
            )
            volume_summary = await self.archivist.generate_volume_summary(
                project_id=project_id,
                volume_id=summary.volume_id,
                chapter_summaries=volume_summaries,
            )
            await self.draft_storage.volume_storage.save_volume_summary(project_id, volume_summary)

            facts_saved = 0
            timeline_saved = 0
            states_saved = 0

            if overwrite:
                await self.canon_storage.normalize_fact_records(project_id)
                await self.canon_storage.delete_facts_by_chapter(project_id, summary.chapter)

            existing_facts = await self.canon_storage.get_all_facts_raw(project_id)
            existing_ids = {item.get("id") for item in existing_facts if item.get("id")}
            next_fact_index = len(existing_facts) + 1

            facts_input = analysis.get("facts", []) or []
            if len(facts_input) > 5:
                facts_input = facts_input[:5]

            for item in facts_input:
                fact_data = item if isinstance(item, dict) else {}
                fact_data = {**fact_data}
                if not fact_data.get("statement") and not fact_data.get("content"):
                    continue
                fact_data["statement"] = fact_data.get("statement") or fact_data.get("content") or ""
                fact_data["source"] = fact_data.get("source") or summary.chapter
                fact_data["introduced_in"] = fact_data.get("introduced_in") or summary.chapter
                if not fact_data.get("id") or fact_data.get("id") in existing_ids:
                    fact_data["id"] = f"F{next_fact_index:04d}"
                    next_fact_index += 1
                existing_ids.add(fact_data["id"])
                await self.canon_storage.add_fact(project_id, Fact(**fact_data))
                facts_saved += 1

            for item in analysis.get("timeline_events", []) or []:
                event_data = item if isinstance(item, dict) else {}
                event_data = {**event_data, "source": event_data.get("source") or chapter}
                await self.canon_storage.add_timeline_event(project_id, TimelineEvent(**event_data))
                timeline_saved += 1

            for item in analysis.get("character_states", []) or []:
                state_data = item if isinstance(item, dict) else {}
                if not state_data.get("character"):
                    continue
                state_data = {**state_data, "last_seen": state_data.get("last_seen") or chapter}
                await self.canon_storage.update_character_state(project_id, CharacterState(**state_data))
                states_saved += 1

            cards_created = await self._create_cards_from_proposals(
                project_id=project_id,
                proposals=analysis.get("proposals", []) or [],
                overwrite=overwrite,
            )

            return {
                "success": True,
                "stats": {
                    "facts_saved": facts_saved,
                    "timeline_saved": timeline_saved,
                    "states_saved": states_saved,
                    "cards_created": cards_created,
                },
            }
        except Exception as exc:
            return await self._handle_error(f"Analysis save failed: {exc}")

    async def _analyze_content(self, project_id: str, chapter: str, content: str):
        """Run post-draft analysis (summaries + canon updates)."""
        try:
            normalized_chapter = self._normalize_chapter_id(chapter)
            scene_brief = await self.draft_storage.get_scene_brief(project_id, chapter)
            chapter_title = scene_brief.title if scene_brief and scene_brief.title else chapter

            summary = await self.archivist.generate_chapter_summary(
                project_id=project_id,
                chapter=normalized_chapter,
                chapter_title=chapter_title,
                final_draft=content,
            )
            summary.chapter = normalized_chapter
            await self.draft_storage.save_chapter_summary(project_id, summary)

            volume_id = ChapterIDValidator.extract_volume_id(normalized_chapter) or "V1"
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
                chapter=normalized_chapter,
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

    async def _create_cards_from_proposals(
        self,
        project_id: str,
        proposals: List[Dict[str, Any]],
        overwrite: bool = False,
    ) -> int:
        """Create cards from proposals. Returns created count."""
        created = 0
        for item in proposals:
            try:
                proposal = CardProposal(**(item or {}))
            except Exception:
                continue

            name = (proposal.name or "").strip()
            if not name:
                continue

            ptype = (proposal.type or "").lower()
            if ptype == "character":
                existing = await self.card_storage.get_character_card(project_id, name)
                if existing and not overwrite:
                    continue
                card = CharacterCard(
                    name=name,
                    description=self._merge_card_description(
                        proposal.description,
                        proposal.rationale,
                    ),
                )
                await self.card_storage.save_character_card(project_id, card)
                created += 1
                continue

            if ptype == "world":
                existing = await self.card_storage.get_world_card(project_id, name)
                if existing and not overwrite:
                    continue
                card = WorldCard(
                    name=name,
                    description=self._merge_card_description(
                        proposal.description,
                        proposal.rationale,
                    ),
                )
                await self.card_storage.save_world_card(project_id, card)
                created += 1
                continue

        return created

    def _normalize_chapter_id(self, chapter_id: str) -> str:
        if not chapter_id:
            return chapter_id
        normalized = str(chapter_id).strip().upper()
        if not normalized:
            return chapter_id
        if normalized.startswith("CH"):
            normalized = "C" + normalized[2:]
        if ChapterIDValidator.validate(normalized):
            if normalized.startswith("C"):
                return f"V1{normalized}"
            return normalized
        return str(chapter_id).strip()

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

    def _merge_card_description(self, description: str, rationale: str) -> str:
        description_text = (description or "").strip()
        rationale_text = (rationale or "").strip()
        if description_text and rationale_text:
            return f"{description_text}\n理由: {rationale_text}"
        return description_text or rationale_text

    def _extract_scene_brief_names(self, scene_brief: Any, limit: int = 3) -> List[str]:
        names: List[str] = []
        items = getattr(scene_brief, "characters", []) or []
        for item in items:
            if isinstance(item, dict):
                name = str(item.get("name") or "").strip()
            else:
                name = str(getattr(item, "name", "") or "").strip()
            if name:
                names.append(name)
        unique = []
        seen = set()
        for name in names:
            if name in seen:
                continue
            seen.add(name)
            unique.append(name)
        return unique[:limit]

    def _extract_top_sources(self, evidence_groups: List[Dict[str, Any]], limit: int = 3) -> List[Dict[str, Any]]:
        items: List[Dict[str, Any]] = []
        for group in evidence_groups or []:
            for item in group.get("items") or []:
                if not isinstance(item, dict):
                    continue
                if item.get("type") == "memory":
                    continue
                items.append(item)
        items.sort(key=lambda x: float(x.get("score") or 0), reverse=True)
        top_sources = []
        for item in items:
            text = str(item.get("text") or "").strip()
            if not text:
                continue
            source = item.get("source") or {}
            source_summary = {}
            for key in ["chapter", "draft", "path", "paragraph", "field", "fact_id", "card", "introduced_in"]:
                if source.get(key) is not None:
                    source_summary[key] = source.get(key)
            top_sources.append(
                {
                    "type": item.get("type") or "",
                    "score": float(item.get("score") or 0),
                    "snippet": text[:80],
                    "source": source_summary,
                }
            )
            if len(top_sources) >= limit:
                break
        return top_sources

    def _build_context_debug(self, payload: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if not payload:
            return None
        return {
            "working_memory": payload.get("working_memory"),
            "gaps": payload.get("gaps"),
            "unresolved_gaps": payload.get("unresolved_gaps"),
            "seed_entities": payload.get("seed_entities"),
            "seed_window": payload.get("seed_window"),
            "retrieval_requests": payload.get("retrieval_requests"),
            "evidence_pack": payload.get("evidence_pack"),
            "research_trace": payload.get("research_trace"),
            "research_stop_reason": payload.get("research_stop_reason"),
            "sufficiency_report": payload.get("sufficiency_report"),
        }

    async def _persist_answer_memory(
        self,
        project_id: str,
        chapter: str,
        answers: List[Dict[str, Any]],
    ) -> None:
        """Persist pre-writing answers as memory evidence items."""
        if not answers:
            return
        try:
            from app.services.evidence_service import evidence_service
            from app.services.working_memory_service import _answer_to_evidence_items
        except Exception:
            return

        items = []
        for raw in _answer_to_evidence_items(answers, chapter=chapter):
            try:
                items.append(
                    EvidenceItem(
                        id=raw.get("id") or "",
                        type="memory",
                        text=raw.get("text") or "",
                        source={
                            **(raw.get("source") or {}),
                            "chapter": chapter,
                        },
                        scope="chapter",
                        entities=[],
                        meta=raw.get("meta") or {},
                    )
                )
            except Exception:
                continue

        if items:
            await evidence_service.append_memory_items(project_id, items)

    async def extract_style_profile(self, project_id: str, sample_text: str) -> StyleCard:
        """Extract writing style guidance from sample text."""
        style_text = await self.archivist.extract_style_profile(sample_text)
        return StyleCard(style=style_text)
