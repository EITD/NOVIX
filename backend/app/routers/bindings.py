# -*- coding: utf-8 -*-
"""
文枢 WenShape - 深度上下文感知的智能体小说创作系统
WenShape - Deep Context-Aware Agent-Based Novel Writing System

Copyright © 2025-2026 WenShape Team
License: PolyForm Noncommercial License 1.0.0

模块说明 / Module Description:
  章节绑定路由 - 提供章节实体绑定的查询和批量重建 API，关联角色/世界观卡片到章节文本。
  Chapter bindings router - Provides query and batch rebuild APIs for chapter-to-entity associations (character and world cards).
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
