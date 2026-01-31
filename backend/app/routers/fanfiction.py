"""
Fanfiction Router
API endpoints for the fanfiction feature
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from app.services.search_service import search_service
from app.services.crawler_service import crawler_service
from app.agents.archivist import ArchivistAgent
from app.llm_gateway.gateway import get_gateway
from app.storage import CanonStorage, DraftStorage
from app.storage.cards import cards_storage
from app.utils.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/fanfiction", tags=["fanfiction"])

# Use imported storage instance
card_storage = cards_storage
canon_storage = CanonStorage()
draft_storage = DraftStorage()


# Schema definitions
class SearchRequest(BaseModel):
    query: str
    engine: str = "all"


class SearchResult(BaseModel):
    title: str
    url: str
    snippet: str
    source: str


class PreviewRequest(BaseModel):
    url: str


class PreviewResponse(BaseModel):
    success: bool
    title: Optional[str] = None
    content: Optional[str] = None
    links: List[Dict[str, str]] = []
    is_list_page: bool = False
    error: Optional[str] = None


class ExtractRequest(BaseModel):
    project_id: str
    url: Optional[str] = None
    title: Optional[str] = None
    content: Optional[str] = None
    max_cards: Optional[int] = None


class BatchExtractRequest(BaseModel):
    project_id: str
    urls: List[str]


class ExtractResponse(BaseModel):
    success: bool
    proposals: List[Dict] = []
    error: Optional[str] = None


@router.post("/search", response_model=List[SearchResult])
async def search_wikis(request: SearchRequest):
    """Search for relevant Wiki pages"""
    try:
        results = search_service.search_wiki(request.query, engine=request.engine, max_results=10)
        return [SearchResult(**r) for r in results]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/preview", response_model=PreviewResponse)
async def preview_page(request: PreviewRequest):
    """
    Scrape a Wiki page and return preview
    
    Args:
        url: URL of the wiki page
        
    Returns:
        Page content and metadata
    """
    try:
        result = crawler_service.scrape_page(request.url)
        
        if not result['success']:
            return PreviewResponse(
                success=False,
                error=result.get('error', 'Unknown error')
            )
        
        return PreviewResponse(
            success=True,
            title=result['title'],
            content=result['content'],
            links=result['links'],
            is_list_page=result['is_list_page']
        )
    except Exception as e:
        return PreviewResponse(
            success=False,
            error=str(e)
        )


@router.post("/extract", response_model=ExtractResponse)
async def extract_cards(request: ExtractRequest):
    """Extract a single card summary for a page"""
    try:
        title = request.title or ""
        content = request.content or ""
        url = request.url or ""

        if url:
            crawl_result = crawler_service.scrape_page(url)
            if not crawl_result.get("success"):
                return {"success": False, "error": crawl_result.get("error", "Crawl failed"), "proposals": []}
            title = crawl_result.get("title") or title
            content = crawl_result.get("llm_content") or crawl_result.get("content") or content

        if not content:
            return {"success": False, "error": "No content to extract", "proposals": []}

        agent = ArchivistAgent(
            gateway=get_gateway(),
            card_storage=card_storage,
            canon_storage=canon_storage,
            draft_storage=draft_storage,
        )

        proposal = await agent.extract_fanfiction_card(title=title, content=content)
        proposal["source_url"] = url

        return {
            "success": True,
            "proposals": [proposal],
        }
    except Exception as e:
        logger.error(f"Extraction failed: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e),
            "proposals": []
        }

@router.post("/extract/batch", response_model=ExtractResponse)
async def batch_extract_cards(request: BatchExtractRequest):
    """Batch extraction for multiple pages (one card per page)"""
    try:
        urls = request.urls[:50]
        results = await crawler_service.scrape_pages_concurrent(urls)

        agent = ArchivistAgent(
            gateway=get_gateway(),
            card_storage=card_storage,
            canon_storage=canon_storage,
            draft_storage=draft_storage,
        )

        proposals: List[Dict[str, Any]] = []
        for page in results:
            if not page.get("success"):
                continue
            title = page.get("title") or ""
            content = page.get("llm_content") or page.get("content") or ""
            if not content:
                continue
            proposal = await agent.extract_fanfiction_card(title=title, content=content)
            proposal["source_url"] = page.get("url")
            proposals.append(proposal)

        if not proposals:
            return {"success": False, "error": "No extractable pages", "proposals": []}

        return {"success": True, "proposals": proposals}
        
    except Exception as e:
        logger.error(f"Batch extraction failed: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e),
            "proposals": []
        }
