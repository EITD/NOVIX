"""
Text chunk search router.
"""

from typing import Any, Dict, List, Optional

from fastapi import APIRouter
from pydantic import BaseModel

from app.storage import DraftStorage

router = APIRouter(prefix="/projects/{project_id}/text-chunks", tags=["text_chunks"])
draft_storage = DraftStorage()


class TextChunkSearchRequest(BaseModel):
    query: str
    limit: int = 8
    chapters: Optional[List[str]] = None
    exclude_chapters: Optional[List[str]] = None
    rebuild: bool = False


class TextChunkSearchResponse(BaseModel):
    results: List[Dict[str, Any]]


@router.post("/search", response_model=TextChunkSearchResponse)
async def search_text_chunks(project_id: str, request: TextChunkSearchRequest):
    """Search text chunks.

    Args:
        project_id: Target project id.
        request: Search request payload.

    Returns:
        Search results.
    """
    results = await draft_storage.search_text_chunks(
        project_id=project_id,
        query=request.query,
        limit=request.limit,
        chapters=request.chapters,
        exclude_chapters=request.exclude_chapters,
        rebuild=request.rebuild,
    )
    return {"results": results}


@router.post("/rebuild")
async def rebuild_text_chunk_index(project_id: str):
    """Rebuild text chunk index.

    Args:
        project_id: Target project id.

    Returns:
        Rebuild metadata.
    """
    meta = await draft_storage.rebuild_text_chunk_index(project_id)
    return {"success": True, "meta": meta}
