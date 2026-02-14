# -*- coding: utf-8 -*-
"""
文枢 WenShape - 深度上下文感知的智能体小说创作系统
WenShape - Deep Context-Aware Agent-Based Novel Writing System

Copyright © 2025-2026 WenShape Team
License: PolyForm Noncommercial License 1.0.0

模块说明 / Module Description:
  证据搜索路由 - 提供跨事实、摘要、卡片的证据检索 API，支持类型配额和语义重排。
  Evidence search router - Provides evidence retrieval API with type quotas, seed entity ranking, and optional semantic reranking.
"""

from typing import Any, Dict, List, Optional

from fastapi import APIRouter
from pydantic import BaseModel

from app.services.evidence_service import evidence_service

router = APIRouter(prefix="/projects/{project_id}/evidence", tags=["evidence"])


class EvidenceSearchRequest(BaseModel):
    queries: List[str]
    types: Optional[List[str]] = None
    quotas: Optional[Dict[str, Dict[str, int]]] = None
    limit: int = 12
    seed_entities: Optional[List[str]] = None
    include_text_chunks: bool = True
    text_chunk_chapters: Optional[List[str]] = None
    text_chunk_exclude_chapters: Optional[List[str]] = None
    rebuild: bool = False


class EvidenceSearchResponse(BaseModel):
    items: List[Dict[str, Any]]
    stats: Dict[str, Any]


@router.post("/search", response_model=EvidenceSearchResponse)
async def search_evidence(project_id: str, request: EvidenceSearchRequest):
    """Search evidence items.

    Args:
        project_id: Target project id.
        request: Search request payload.

    Returns:
        Evidence items and stats.
    """
    result = await evidence_service.search(
        project_id=project_id,
        queries=request.queries,
        types=request.types,
        quotas=request.quotas,
        limit=request.limit,
        seed_entities=request.seed_entities,
        include_text_chunks=request.include_text_chunks,
        text_chunk_chapters=request.text_chunk_chapters,
        text_chunk_exclude_chapters=request.text_chunk_exclude_chapters,
        rebuild=request.rebuild,
    )
    return result


@router.post("/rebuild")
async def rebuild_evidence(project_id: str):
    """Rebuild all evidence indices.

    Args:
        project_id: Target project id.

    Returns:
        Rebuild metadata.
    """
    meta = await evidence_service.build_all(project_id, force=True)
    return {"success": True, "meta": {k: v.model_dump(mode="json") for k, v in meta.items()}}
