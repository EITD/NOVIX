"""
Session Router
Writing session management endpoints.
"""

from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.orchestrator import Orchestrator
from app.orchestrator.orchestrator import SessionStatus
from app.routers.websocket import broadcast_progress
from app.schemas.draft import ChapterSummary

router = APIRouter(tags=["session"])

_orchestrator: Optional[Orchestrator] = None


def get_orchestrator() -> Orchestrator:
    """Get or create orchestrator instance."""
    global _orchestrator

    async def _progress_callback(payload: dict) -> None:
        project = payload.get("project_id")
        if not project:
            return
        await broadcast_progress(project, payload)

    if _orchestrator is None:
        _orchestrator = Orchestrator(progress_callback=_progress_callback)
    else:
        _orchestrator.progress_callback = _progress_callback
    return _orchestrator


class StartSessionRequest(BaseModel):
    """Request body for starting a session."""

    chapter: str = Field(..., description="Chapter ID")
    chapter_title: str = Field(..., description="Chapter title")
    chapter_goal: str = Field(..., description="Chapter goal")
    target_word_count: int = Field(3000, description="Target word count")
    character_names: Optional[List[str]] = Field(None, description="Character names")


class FeedbackRequest(BaseModel):
    """Request body for submitting feedback."""

    chapter: str = Field(..., description="Chapter ID")
    feedback: str = Field(..., description="User feedback")
    action: str = Field("revise", description="Action: revise or confirm")
    rejected_entities: Optional[List[str]] = Field(None, description="Rejected entity names")


class EditSuggestRequest(BaseModel):
    """Request body for suggesting an edit on current (unsaved) content."""

    chapter: Optional[str] = Field(None, description="Chapter ID (optional)")
    content: str = Field(..., description="Current content to edit (may be unsaved)")
    instruction: str = Field(..., description="Edit instruction")
    rejected_entities: Optional[List[str]] = Field(None, description="Rejected entity names")
    context_mode: Optional[str] = Field(
        "quick",
        description="Context mode: quick (use memory pack) | full (rebuild memory pack)",
    )


class QuestionAnswer(BaseModel):
    """Answer to a pre-writing question."""
    type: str = Field(..., description="Question type")
    question: Optional[str] = Field(None, description="Question text")
    key: Optional[str] = Field(None, description="Stable question key")
    answer: str = Field(..., description="User answer")


class AnswerQuestionsRequest(BaseModel):
    """Request to answer pre-writing questions."""
    chapter: str = Field(..., description="Chapter ID")
    chapter_title: str = Field(..., description="Chapter title")
    chapter_goal: str = Field(..., description="Chapter goal")
    target_word_count: int = Field(3000, description="Target word count")
    character_names: Optional[List[str]] = Field(None, description="Character names")
    answers: List[QuestionAnswer] = Field(default_factory=list, description="Answers")


@router.post("/projects/{project_id}/session/start")
async def start_session(project_id: str, request: StartSessionRequest):
    """Start a new writing session."""
    try:
        orchestrator = get_orchestrator()
        return await orchestrator.start_session(
            project_id=project_id,
            chapter=request.chapter,
            chapter_title=request.chapter_title,
            chapter_goal=request.chapter_goal,
            target_word_count=request.target_word_count,
            character_names=request.character_names,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/projects/{project_id}/session/status")
async def get_session_status(project_id: str):
    """Get current session status."""
    orchestrator = get_orchestrator()
    status = orchestrator.get_status()

    if status["project_id"] != project_id:
        return {"status": "idle", "message": "No active session for this project"}

    return status


@router.post("/projects/{project_id}/session/feedback")
async def submit_feedback(project_id: str, request: FeedbackRequest):
    """Submit user feedback."""
    try:
        orchestrator = get_orchestrator()
        return await orchestrator.process_feedback(
            project_id=project_id,
            chapter=request.chapter,
            feedback=request.feedback,
            action=request.action,
            rejected_entities=request.rejected_entities,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/projects/{project_id}/session/edit-suggest")
async def suggest_edit(project_id: str, request: EditSuggestRequest):
    """Suggest a diff-style revision without persisting it."""
    try:
        orchestrator = get_orchestrator()
        memory_pack_payload = None
        if request.chapter:
            mode = str(request.context_mode or "quick").strip().lower()
            force_refresh = mode == "full"
            memory_pack_payload = await orchestrator.ensure_memory_pack(
                project_id=project_id,
                chapter=request.chapter,
                chapter_goal="",
                scene_brief=None,
                user_feedback=request.instruction,
                force_refresh=force_refresh,
                source="editor",
            )
        revised = await orchestrator.editor.suggest_revision(
            project_id=project_id,
            original_draft=request.content,
            user_feedback=request.instruction,
            rejected_entities=request.rejected_entities or [],
            memory_pack=memory_pack_payload,
        )
        return {"success": True, "revised_content": revised, "word_count": len(revised)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/projects/{project_id}/session/answer-questions")
async def answer_questions(project_id: str, request: AnswerQuestionsRequest):
    """Continue session after answering pre-writing questions."""
    try:
        orchestrator = get_orchestrator()
        answers = [item.model_dump() for item in request.answers]
        return await orchestrator.answer_questions(
            project_id=project_id,
            chapter=request.chapter,
            chapter_title=request.chapter_title,
            chapter_goal=request.chapter_goal,
            target_word_count=request.target_word_count,
            answers=answers,
            character_names=request.character_names,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/projects/{project_id}/session/cancel")
async def cancel_session(project_id: str):
    """Cancel current session."""
    orchestrator = get_orchestrator()

    if orchestrator._stream_task:
        orchestrator._stream_task.cancel()
        orchestrator._stream_task = None

    orchestrator.current_status = SessionStatus.IDLE
    orchestrator.current_project_id = None
    orchestrator.current_chapter = None

    await broadcast_progress(
        project_id,
        {
            "status": SessionStatus.IDLE.value,
            "message": "Session cancelled",
            "project_id": project_id,
            "chapter": None,
            "iteration": 0,
        },
    )

    return {"success": True, "message": "Session cancelled"}


class AnalyzeRequest(BaseModel):
    """Request body for chapter analysis."""

    chapter: str = Field(..., description="Chapter ID")
    content: Optional[str] = Field(None, description="Draft content")
    chapter_title: Optional[str] = Field(None, description="Chapter title")


class AnalysisPayload(BaseModel):
    """Structured analysis payload."""

    summary: ChapterSummary
    facts: List[dict] = Field(default_factory=list)
    timeline_events: List[dict] = Field(default_factory=list)
    character_states: List[dict] = Field(default_factory=list)
    proposals: List[dict] = Field(default_factory=list)


class SaveAnalysisRequest(BaseModel):
    """Request body for saving analysis output."""

    chapter: str = Field(..., description="Chapter ID")
    analysis: AnalysisPayload
    overwrite: bool = Field(False, description="Overwrite existing facts/cards")


class AnalyzeSyncRequest(BaseModel):
    """Request body for analysis sync."""

    chapters: List[str] = Field(default_factory=list, description="Chapter IDs")


class AnalyzeBatchRequest(BaseModel):
    """Request body for batch analysis."""

    chapters: List[str] = Field(default_factory=list, description="Chapter IDs")


class SaveAnalysisBatchItem(BaseModel):
    """Batch item for saving analysis."""

    chapter: str = Field(..., description="Chapter ID")
    analysis: AnalysisPayload


class SaveAnalysisBatchRequest(BaseModel):
    """Request body for saving analysis batch."""

    items: List[SaveAnalysisBatchItem] = Field(default_factory=list)
    overwrite: bool = Field(False, description="Overwrite existing facts/cards")


@router.post("/projects/{project_id}/session/analyze")
async def analyze_chapter(project_id: str, request: AnalyzeRequest):
    """Analyze chapter content manually."""
    try:
        orchestrator = get_orchestrator()
        return await orchestrator.analyze_chapter(
            project_id=project_id,
            chapter=request.chapter,
            content=request.content,
            chapter_title=request.chapter_title,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/projects/{project_id}/session/save-analysis")
async def save_analysis(project_id: str, request: SaveAnalysisRequest):
    """Persist analysis output (summary, facts, cards)."""
    try:
        orchestrator = get_orchestrator()
        return await orchestrator.save_analysis(
            project_id=project_id,
            chapter=request.chapter,
            analysis=request.analysis.model_dump(),
            overwrite=request.overwrite,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/projects/{project_id}/session/analyze-sync")
async def analyze_sync(project_id: str, request: AnalyzeSyncRequest):
    """Batch analyze and overwrite summaries/facts/cards for selected chapters."""
    try:
        orchestrator = get_orchestrator()
        return await orchestrator.analyze_sync(project_id, request.chapters)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/projects/{project_id}/session/analyze-batch")
async def analyze_batch(project_id: str, request: AnalyzeBatchRequest):
    """Batch analyze chapters and return analysis payload."""
    try:
        orchestrator = get_orchestrator()
        return await orchestrator.analyze_batch(project_id, request.chapters)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/projects/{project_id}/session/save-analysis-batch")
async def save_analysis_batch(project_id: str, request: SaveAnalysisBatchRequest):
    """Persist analysis payload batch."""
    try:
        orchestrator = get_orchestrator()
        items = [
            {"chapter": item.chapter, "analysis": item.analysis.model_dump()}
            for item in request.items
        ]
        return await orchestrator.save_analysis_batch(
            project_id=project_id,
            items=items,
            overwrite=request.overwrite,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
