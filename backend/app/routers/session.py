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


@router.post("/projects/{project_id}/session/cancel")
async def cancel_session(project_id: str):
    """Cancel current session."""
    orchestrator = get_orchestrator()

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


@router.post("/projects/{project_id}/session/analyze")
async def analyze_chapter(project_id: str, request: AnalyzeRequest):
    """Analyze chapter content manually."""
    try:
        orchestrator = get_orchestrator()
        return await orchestrator.analyze_chapter(project_id, request.chapter)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
