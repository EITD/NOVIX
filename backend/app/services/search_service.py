# -*- coding: utf-8 -*-
"""
文枢 WenShape - 深度上下文感知的智能体小说创作系统
WenShape - Deep Context-Aware Agent-Based Novel Writing System

Copyright © 2025-2026 WenShape Team
License: PolyForm Noncommercial License 1.0.0

模块说明 / Module Description:
  搜索服务 - 为同人创作导入功能提供萌娘百科搜索，仅支持萌娘百科以确保稳定性和一致性。
  Search service for fanfiction import - Moegirlpedia OpenSearch wrapper providing stable, unified search results for wiki article discovery.
"""

from typing import List, Dict
from urllib.parse import parse_qs, quote, unquote, urlparse

import requests
from app.utils.logger import get_logger

logger = get_logger(__name__)


class SearchService:
    """
    萌娘百科搜索服务包装 - 专用于同人创作导入的搜索。

    Wrapper around Moegirlpedia OpenSearch API.
    Restricts to Moegirlpedia only to ensure consistency and reliability.
    Normalizes URLs and deduplicates results.

    Attributes:
        moegirl_opensearch_api: 萌娘百科搜索 API URL / Moegirlpedia OpenSearch API endpoint
    """
    
    def __init__(self):
        self.moegirl_opensearch_api = "https://mzh.moegirl.org.cn/api.php"
        self._headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            )
        }

    def _normalize_moegirl_url(self, url: str) -> str:
        """
        Normalize Moegirlpedia URLs to a stable `index.php?title=...` form.

        输入可能是：
        - `https://mzh.moegirl.org.cn/index.php?title=词条`
        - `https://zh.moegirl.org.cn/词条`
        - `https://zh.moegirl.org.cn/wiki/词条`

        输出统一为：
        - `https://mzh.moegirl.org.cn/index.php?title=词条`
        """
        raw = str(url or "").strip()
        if not raw:
            return ""

        try:
            parsed = urlparse(raw)
        except Exception:
            return raw

        host = (parsed.netloc or "").lower()
        if "moegirl.org" not in host:
            return raw

        query = parse_qs(parsed.query or "")
        title = query.get("title", [None])[0]
        if title:
            title = unquote(str(title)).strip()
        else:
            path = (parsed.path or "").strip("/")
            if path.startswith("wiki/"):
                path = path[len("wiki/") :]
            if path and path not in {"index.php", "api.php"}:
                title = unquote(path).strip()

        if not title:
            return raw

        safe = quote(str(title).replace(" ", "_"), safe="")
        return f"https://mzh.moegirl.org.cn/index.php?title={safe}"
    
    def search_wiki(self, query: str, max_results: int = 10, engine: str = "moegirl") -> List[Dict[str, str]]:
        """
        Search Moegirlpedia pages.
        
        Args:
            query: Search query
            max_results: Maximum number of results to return
            engine: Kept for backward compatibility; ignored (always moegirl)
            
        Returns:
            List of search results with title, url, snippet, and source
        """
        q = str(query or "").strip()
        if not q:
            return []

        limit = max(1, min(int(max_results or 10), 20))

        try:
            resp = requests.get(
                self.moegirl_opensearch_api,
                params={
                    "action": "opensearch",
                    "search": q,
                    "limit": limit,
                    "format": "json",
                },
                headers=self._headers,
                timeout=(3, 10),
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:
            logger.error("Moegirl API error query=%s err=%s", q, exc)
            return []

        if not isinstance(data, list) or len(data) < 4:
            return []

        titles = data[1] or []
        descriptions = data[2] or []
        urls = data[3] or []

        results: List[Dict[str, str]] = []
        seen_urls = set()
        for i in range(min(len(titles), len(urls))):
            title = str(titles[i] or "").strip()
            url = self._normalize_moegirl_url(urls[i]) or str(urls[i] or "").strip()
            if not title or not url or url in seen_urls:
                continue
            seen_urls.add(url)

            desc = str(descriptions[i] or "").strip() if i < len(descriptions) else ""
            snippet = desc if desc else f"萌娘百科词条：{title}"

            results.append({"title": title, "url": url, "snippet": snippet, "source": "萌娘百科"})
            if len(results) >= limit:
                break

        return results


# Singleton instance
search_service = SearchService()
