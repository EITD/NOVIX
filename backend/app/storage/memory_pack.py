"""
Memory Pack Storage / 章节记忆包存储
负责持久化每章最新一份的检索记忆包，供主笔/编辑复用
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

import aiofiles

from app.storage.base import BaseStorage
from app.utils.chapter_id import ChapterIDValidator, normalize_chapter_id


class MemoryPackStorage(BaseStorage):
    """File-based storage for chapter memory packs / 章节记忆包文件存储。"""

    def _canonicalize_chapter_id(self, chapter_id: str) -> str:
        normalized = normalize_chapter_id(chapter_id)
        if normalized and ChapterIDValidator.validate(normalized):
            return normalized
        return (str(chapter_id).strip() if chapter_id else "")

    def get_pack_path(self, project_id: str, chapter: str) -> Path:
        """Return the JSON path for a chapter memory pack."""
        canonical = self._canonicalize_chapter_id(chapter)
        return self.get_project_path(project_id) / "memory_packs" / f"{canonical}.json"

    async def read_pack(self, project_id: str, chapter: str) -> Optional[Dict[str, Any]]:
        """Read memory pack for a chapter; return None if not found."""
        path = self.get_pack_path(project_id, chapter)
        if not path.exists():
            return None
        async with aiofiles.open(path, "r", encoding=self.encoding) as f:
            raw = await f.read()
            payload = json.loads(raw)
        canonical = self._canonicalize_chapter_id(chapter)
        if canonical:
            payload["chapter"] = canonical
        return payload

    async def write_pack(self, project_id: str, chapter: str, pack: Dict[str, Any]) -> None:
        """Write (overwrite) memory pack for a chapter."""
        path = self.get_pack_path(project_id, chapter)
        self.ensure_dir(path.parent)
        canonical = self._canonicalize_chapter_id(chapter)
        pack = dict(pack or {})
        if canonical:
            pack["chapter"] = canonical
        if not pack.get("built_at"):
            pack["built_at"] = datetime.now(timezone.utc).isoformat()
        async with aiofiles.open(path, "w", encoding=self.encoding) as f:
            await f.write(json.dumps(pack, ensure_ascii=False, indent=2))

    def build_status(self, chapter: str, pack: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        """Build a lightweight status payload for frontend display."""
        canonical = self._canonicalize_chapter_id(chapter)
        if not pack:
            return {
                "exists": False,
                "chapter": canonical,
            }
        payload = pack.get("payload") or pack.get("working_memory_payload") or {}
        evidence_stats = (payload.get("evidence_pack") or {}).get("stats") or {}
        snapshot = pack.get("card_snapshot") or {}
        return {
            "exists": True,
            "chapter": canonical,
            "built_at": pack.get("built_at"),
            "source": pack.get("source"),
            "evidence_stats": evidence_stats,
            "card_snapshot": {
                "characters": len(snapshot.get("characters") or []),
                "world": len(snapshot.get("world") or []),
            } if isinstance(snapshot, dict) else {"characters": 0, "world": 0},
        }
