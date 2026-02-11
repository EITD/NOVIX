"""
Chapter bindings router.
"""

from typing import Any, Dict, List, Optional

from fastapi import APIRouter
from pydantic import BaseModel

from app.services.chapter_binding_service import chapter_binding_service

router = APIRouter(prefix="/projects/{project_id}/bindings", tags=["bindings"])


class BindingResponse(BaseModel):
    binding: Optional[Dict[str, Any]] = None


class BindingBatchRequest(BaseModel):
    chapters: Optional[List[str]] = None


@router.post("/rebuild-batch")
async def rebuild_bindings_batch(project_id: str, request: BindingBatchRequest):
    """Rebuild bindings for multiple chapters.

    Args:
        project_id: Target project id.
        request: Batch rebuild request.

    Returns:
        Batch rebuild results.
    """
    results = await chapter_binding_service.build_bindings_batch(
        project_id=project_id,
        chapters=request.chapters,
        force=True,
    )
    return {"success": True, "results": results}


@router.get("/{chapter}", response_model=BindingResponse)
async def get_bindings(project_id: str, chapter: str):
    """Get bindings for a chapter.

    Args:
        project_id: Target project id.
        chapter: Chapter id.

    Returns:
        Binding payload.
    """
    binding = await chapter_binding_service.read_bindings(project_id, chapter)
    return {"binding": binding}


@router.post("/{chapter}/rebuild")
async def rebuild_bindings(project_id: str, chapter: str):
    """Rebuild bindings for a chapter.

    Args:
        project_id: Target project id.
        chapter: Chapter id.

    Returns:
        Rebuilt binding payload.
    """
    binding = await chapter_binding_service.build_bindings(project_id, chapter, force=True)
    return {"success": True, "binding": binding}
