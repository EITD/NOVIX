"""
Draft Storage
Manages scene briefs, drafts, reviews, and summaries.
"""

import shutil
from pathlib import Path
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.context.retriever import DynamicContextRetriever
from app.schemas.draft import ChapterSummary, Draft, ReviewResult, SceneBrief
from app.schemas.volume import VolumeSummary
from app.storage.base import BaseStorage
from app.storage.volumes import VolumeStorage
from app.utils.chapter_id import ChapterIDValidator, normalize_chapter_id


class DraftStorage(BaseStorage):
    """File-based draft storage."""

    def __init__(self, data_dir: Optional[str] = None):
        super().__init__(data_dir)
        self.context_retriever = DynamicContextRetriever(self)
        self.volume_storage = VolumeStorage(data_dir)

    def _canonicalize_chapter_id(self, chapter_id: str) -> str:
        normalized = normalize_chapter_id(chapter_id)
        if normalized and ChapterIDValidator.validate(normalized):
            return normalized
        return (str(chapter_id).strip() if chapter_id else "")

    def _resolve_chapter_dir_name(self, project_id: str, chapter: str) -> str:
        drafts_dir = self.get_project_path(project_id) / "drafts"
        canonical = self._canonicalize_chapter_id(chapter)
        if drafts_dir.exists():
            canonical_path = drafts_dir / canonical
            if canonical_path.exists():
                return canonical
            raw_path = drafts_dir / str(chapter)
            if raw_path.exists():
                return str(chapter)
            for path in drafts_dir.iterdir():
                if path.is_dir() and self._canonicalize_chapter_id(path.name) == canonical:
                    return path.name
        return canonical

    def _migrate_chapter_dir(self, project_id: str, chapter: str, canonical: str) -> None:
        drafts_dir = self.get_project_path(project_id) / "drafts"
        if not drafts_dir.exists():
            return
        source_name = self._resolve_chapter_dir_name(project_id, chapter)
        if not source_name or source_name == canonical:
            return
        source_path = drafts_dir / source_name
        target_path = drafts_dir / canonical
        if not source_path.exists() or not source_path.is_dir():
            return
        if target_path.exists():
            for item in source_path.iterdir():
                target_item = target_path / item.name
                if not target_item.exists():
                    item.rename(target_item)
            try:
                source_path.rmdir()
            except OSError:
                pass
            return
        source_path.rename(target_path)

    def _resolve_summary_path(self, project_id: str, chapter: str) -> Optional[Path]:
        summaries_dir = self.get_project_path(project_id) / "summaries"
        canonical = self._canonicalize_chapter_id(chapter)
        if summaries_dir.exists():
            canonical_path = summaries_dir / f"{canonical}_summary.yaml"
            if canonical_path.exists():
                return canonical_path
            raw_path = summaries_dir / f"{chapter}_summary.yaml"
            if raw_path.exists():
                return raw_path
            for path in summaries_dir.glob("*_summary.yaml"):
                name = path.stem.replace("_summary", "")
                if self._canonicalize_chapter_id(name) == canonical:
                    return path
        return summaries_dir / f"{canonical}_summary.yaml"

    def _migrate_summary_file(self, project_id: str, chapter: str, canonical: str) -> None:
        summaries_dir = self.get_project_path(project_id) / "summaries"
        if not summaries_dir.exists():
            return
        target_path = summaries_dir / f"{canonical}_summary.yaml"
        if target_path.exists():
            return
        source_path = self._resolve_summary_path(project_id, chapter)
        if not source_path:
            return
        if source_path.exists() and source_path != target_path:
            source_path.rename(target_path)

    async def save_scene_brief(self, project_id: str, chapter: str, brief: SceneBrief) -> None:
        """Save a scene brief."""
        canonical = self._canonicalize_chapter_id(chapter)
        self._migrate_chapter_dir(project_id, chapter, canonical)
        file_path = self.get_project_path(project_id) / "drafts" / canonical / "scene_brief.yaml"
        await self.write_yaml(file_path, brief.model_dump())

    async def get_scene_brief(self, project_id: str, chapter: str) -> Optional[SceneBrief]:
        """Get a scene brief."""
        resolved = self._resolve_chapter_dir_name(project_id, chapter)
        file_path = self.get_project_path(project_id) / "drafts" / resolved / "scene_brief.yaml"
        if not file_path.exists():
            return None
        data = await self.read_yaml(file_path)
        return SceneBrief(**data)

    async def save_draft(
        self,
        project_id: str,
        chapter: str,
        version: str,
        content: str,
        word_count: int,
        pending_confirmations: Optional[List[str]] = None,
    ) -> Draft:
        """Save a draft."""
        canonical = self._canonicalize_chapter_id(chapter)
        self._migrate_chapter_dir(project_id, chapter, canonical)
        draft = Draft(
            chapter=canonical,
            version=version,
            content=content,
            word_count=word_count,
            pending_confirmations=pending_confirmations or [],
            created_at=datetime.now(),
        )

        file_path = self.get_project_path(project_id) / "drafts" / canonical / f"draft_{version}.md"
        await self.write_text(file_path, content)

        meta_path = self.get_project_path(project_id) / "drafts" / canonical / f"draft_{version}.meta.yaml"
        await self.write_yaml(meta_path, draft.model_dump(mode="json"))

        return draft

    async def get_draft(self, project_id: str, chapter: str, version: str) -> Optional[Draft]:
        """Get a draft."""
        resolved = self._resolve_chapter_dir_name(project_id, chapter)
        canonical = self._canonicalize_chapter_id(chapter)
        file_path = self.get_project_path(project_id) / "drafts" / resolved / f"draft_{version}.md"
        if not file_path.exists():
            return None

        content = await self.read_text(file_path)
        meta_path = self.get_project_path(project_id) / "drafts" / resolved / f"draft_{version}.meta.yaml"

        if meta_path.exists():
            meta = await self.read_yaml(meta_path)
            meta["chapter"] = canonical or meta.get("chapter") or chapter
            return Draft(**meta)

        return Draft(
            chapter=canonical or chapter,
            version=version,
            content=content,
            word_count=len(content),
            pending_confirmations=[],
            created_at=datetime.now(),
        )

    async def get_latest_draft(self, project_id: str, chapter: str) -> Optional[Draft]:
        """Get the latest draft."""
        versions = await self.list_draft_versions(project_id, chapter)
        if not versions:
            return None
        latest = versions[-1]
        return await self.get_draft(project_id, chapter, latest)

    async def list_draft_versions(self, project_id: str, chapter: str) -> List[str]:
        """List draft versions for a chapter."""
        resolved = self._resolve_chapter_dir_name(project_id, chapter)
        drafts_dir = self.get_project_path(project_id) / "drafts" / resolved
        if not drafts_dir.exists():
            return []

        versions = []
        for file_path in drafts_dir.glob("draft_*.md"):
            versions.append(file_path.stem.replace("draft_", ""))

        return sorted(versions)

    async def save_review(self, project_id: str, chapter: str, review: ReviewResult) -> None:
        """Save a review result."""
        canonical = self._canonicalize_chapter_id(chapter)
        self._migrate_chapter_dir(project_id, chapter, canonical)
        file_path = self.get_project_path(project_id) / "drafts" / canonical / "review.yaml"
        await self.write_yaml(file_path, review.model_dump())

    async def get_review(self, project_id: str, chapter: str) -> Optional[ReviewResult]:
        """Get a review result."""
        resolved = self._resolve_chapter_dir_name(project_id, chapter)
        file_path = self.get_project_path(project_id) / "drafts" / resolved / "review.yaml"
        if not file_path.exists():
            return None
        data = await self.read_yaml(file_path)
        return ReviewResult(**data)

    async def save_final_draft(self, project_id: str, chapter: str, content: str) -> None:
        """Save a final draft."""
        canonical = self._canonicalize_chapter_id(chapter)
        self._migrate_chapter_dir(project_id, chapter, canonical)
        file_path = self.get_project_path(project_id) / "drafts" / canonical / "final.md"
        await self.write_text(file_path, content)

    async def get_final_draft(self, project_id: str, chapter: str) -> Optional[str]:
        """Get a final draft."""
        resolved = self._resolve_chapter_dir_name(project_id, chapter)
        file_path = self.get_project_path(project_id) / "drafts" / resolved / "final.md"
        if not file_path.exists():
            return None
        return await self.read_text(file_path)

    async def save_chapter_summary(self, project_id: str, summary: ChapterSummary) -> None:
        """Save a chapter summary."""
        raw_chapter = summary.chapter
        summary.chapter = self._canonicalize_chapter_id(summary.chapter)
        summary = self._ensure_volume_id(summary)
        self._migrate_summary_file(project_id, raw_chapter, summary.chapter)
        file_path = self.get_project_path(project_id) / "summaries" / f"{summary.chapter}_summary.yaml"
        await self.write_yaml(file_path, summary.model_dump())

    async def get_chapter_summary(self, project_id: str, chapter: str) -> Optional[ChapterSummary]:
        """Get a chapter summary."""
        canonical = self._canonicalize_chapter_id(chapter)
        file_path = self._resolve_summary_path(project_id, chapter)
        if not file_path.exists():
            return None
        data = await self.read_yaml(file_path)
        summary = ChapterSummary(**data)
        summary.chapter = canonical or summary.chapter
        return self._ensure_volume_id(summary)

    async def list_chapter_summaries(
        self,
        project_id: str,
        volume_id: Optional[str] = None,
    ) -> List[ChapterSummary]:
        """List chapter summaries."""
        summaries_dir = self.get_project_path(project_id) / "summaries"
        if not summaries_dir.exists():
            return []

        summaries: Dict[str, ChapterSummary] = {}
        summary_mtime: Dict[str, float] = {}
        for file_path in summaries_dir.glob("*_summary.yaml"):
            try:
                data = await self.read_yaml(file_path)
                summary = ChapterSummary(**data)
                summary.chapter = self._canonicalize_chapter_id(summary.chapter or file_path.stem.replace("_summary", ""))
                summary = self._ensure_volume_id(summary)
                if volume_id and summary.volume_id != volume_id:
                    continue
                chapter_id = summary.chapter
                current_mtime = file_path.stat().st_mtime
                if chapter_id not in summaries or current_mtime > summary_mtime.get(chapter_id, 0):
                    summaries[chapter_id] = summary
                    summary_mtime[chapter_id] = current_mtime
            except Exception:
                continue

        ordered = sorted(summaries.values(), key=lambda summary: ChapterIDValidator.calculate_weight(summary.chapter))
        return ordered

    async def list_chapters(self, project_id: str) -> List[str]:
        """List chapters for a project."""
        drafts_dir = self.get_project_path(project_id) / "drafts"
        if not drafts_dir.exists():
            return []

        chapters = []
        seen = set()
        for path in drafts_dir.iterdir():
            if not path.is_dir():
                continue
            canonical = self._canonicalize_chapter_id(path.name)
            if not canonical or canonical in seen:
                continue
            seen.add(canonical)
            chapters.append(canonical)
        return ChapterIDValidator.sort_chapters(chapters)

    async def delete_chapter(self, project_id: str, chapter: str) -> bool:
        """Delete all draft artifacts for a chapter."""
        project_path = self.get_project_path(project_id)
        canonical = self._canonicalize_chapter_id(chapter)
        deleted_any = False
        drafts_dir = project_path / "drafts"
        if drafts_dir.exists():
            for path in drafts_dir.iterdir():
                if path.is_dir() and self._canonicalize_chapter_id(path.name) == canonical:
                    shutil.rmtree(path)
                    deleted_any = True

        summaries_dir = project_path / "summaries"
        if summaries_dir.exists():
            for path in summaries_dir.glob("*_summary.yaml"):
                name = path.stem.replace("_summary", "")
                if self._canonicalize_chapter_id(name) == canonical:
                    path.unlink()
                    deleted_any = True

        return deleted_any

    async def get_context_for_writing(self, project_id: str, current_chapter: str) -> Dict[str, Any]:
        """Get structured context for writing."""
        return await self.context_retriever.retrieve_context(project_id, current_chapter)

    async def list_volume_summaries(self, project_id: str) -> List[VolumeSummary]:
        """List volume summaries."""
        summaries: List[VolumeSummary] = []
        volumes = await self.volume_storage.list_volumes(project_id)
        for volume in volumes:
            summary = await self.volume_storage.get_volume_summary(project_id, volume.id)
            if summary:
                summaries.append(summary)
        return summaries

    async def save_conflict_report(self, project_id: str, chapter: str, report: Dict[str, Any]) -> None:
        """Save a conflict report."""
        canonical = self._canonicalize_chapter_id(chapter)
        self._migrate_chapter_dir(project_id, chapter, canonical)
        file_path = self.get_project_path(project_id) / "drafts" / canonical / "conflicts.yaml"
        await self.write_yaml(file_path, report)

    def _ensure_volume_id(self, summary: ChapterSummary) -> ChapterSummary:
        """Ensure volume_id is set on a summary."""
        if not summary.volume_id:
            summary.volume_id = ChapterIDValidator.extract_volume_id(summary.chapter) or "V1"
        return summary
