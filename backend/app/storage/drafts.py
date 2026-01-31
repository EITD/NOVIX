"""
Draft Storage
Manages scene briefs, drafts, reviews, and summaries.
"""

import shutil
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.context.retriever import DynamicContextRetriever
from app.schemas.draft import ChapterSummary, Draft, ReviewResult, SceneBrief
from app.schemas.volume import VolumeSummary
from app.storage.base import BaseStorage
from app.storage.volumes import VolumeStorage
from app.utils.chapter_id import ChapterIDValidator


class DraftStorage(BaseStorage):
    """File-based draft storage."""

    def __init__(self, data_dir: Optional[str] = None):
        super().__init__(data_dir)
        self.context_retriever = DynamicContextRetriever(self)
        self.volume_storage = VolumeStorage(data_dir)

    async def save_scene_brief(self, project_id: str, chapter: str, brief: SceneBrief) -> None:
        """Save a scene brief."""
        file_path = self.get_project_path(project_id) / "drafts" / chapter / "scene_brief.yaml"
        await self.write_yaml(file_path, brief.model_dump())

    async def get_scene_brief(self, project_id: str, chapter: str) -> Optional[SceneBrief]:
        """Get a scene brief."""
        file_path = self.get_project_path(project_id) / "drafts" / chapter / "scene_brief.yaml"
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
        draft = Draft(
            chapter=chapter,
            version=version,
            content=content,
            word_count=word_count,
            pending_confirmations=pending_confirmations or [],
            created_at=datetime.now(),
        )

        file_path = self.get_project_path(project_id) / "drafts" / chapter / f"draft_{version}.md"
        await self.write_text(file_path, content)

        meta_path = self.get_project_path(project_id) / "drafts" / chapter / f"draft_{version}.meta.yaml"
        await self.write_yaml(meta_path, draft.model_dump(mode="json"))

        return draft

    async def get_draft(self, project_id: str, chapter: str, version: str) -> Optional[Draft]:
        """Get a draft."""
        file_path = self.get_project_path(project_id) / "drafts" / chapter / f"draft_{version}.md"
        if not file_path.exists():
            return None

        content = await self.read_text(file_path)
        meta_path = self.get_project_path(project_id) / "drafts" / chapter / f"draft_{version}.meta.yaml"

        if meta_path.exists():
            meta = await self.read_yaml(meta_path)
            return Draft(**meta)

        return Draft(
            chapter=chapter,
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
        drafts_dir = self.get_project_path(project_id) / "drafts" / chapter
        if not drafts_dir.exists():
            return []

        versions = []
        for file_path in drafts_dir.glob("draft_*.md"):
            versions.append(file_path.stem.replace("draft_", ""))

        return sorted(versions)

    async def save_review(self, project_id: str, chapter: str, review: ReviewResult) -> None:
        """Save a review result."""
        file_path = self.get_project_path(project_id) / "drafts" / chapter / "review.yaml"
        await self.write_yaml(file_path, review.model_dump())

    async def get_review(self, project_id: str, chapter: str) -> Optional[ReviewResult]:
        """Get a review result."""
        file_path = self.get_project_path(project_id) / "drafts" / chapter / "review.yaml"
        if not file_path.exists():
            return None
        data = await self.read_yaml(file_path)
        return ReviewResult(**data)

    async def save_final_draft(self, project_id: str, chapter: str, content: str) -> None:
        """Save a final draft."""
        file_path = self.get_project_path(project_id) / "drafts" / chapter / "final.md"
        await self.write_text(file_path, content)

    async def get_final_draft(self, project_id: str, chapter: str) -> Optional[str]:
        """Get a final draft."""
        file_path = self.get_project_path(project_id) / "drafts" / chapter / "final.md"
        if not file_path.exists():
            return None
        return await self.read_text(file_path)

    async def save_chapter_summary(self, project_id: str, summary: ChapterSummary) -> None:
        """Save a chapter summary."""
        summary = self._ensure_volume_id(summary)
        file_path = self.get_project_path(project_id) / "summaries" / f"{summary.chapter}_summary.yaml"
        await self.write_yaml(file_path, summary.model_dump())

    async def get_chapter_summary(self, project_id: str, chapter: str) -> Optional[ChapterSummary]:
        """Get a chapter summary."""
        file_path = self.get_project_path(project_id) / "summaries" / f"{chapter}_summary.yaml"
        if not file_path.exists():
            return None
        data = await self.read_yaml(file_path)
        summary = ChapterSummary(**data)
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

        summaries: List[ChapterSummary] = []
        for file_path in summaries_dir.glob("*_summary.yaml"):
            try:
                data = await self.read_yaml(file_path)
                summary = ChapterSummary(**data)
                summary = self._ensure_volume_id(summary)
                if volume_id and summary.volume_id != volume_id:
                    continue
                summaries.append(summary)
            except Exception:
                continue

        summaries.sort(key=lambda summary: ChapterIDValidator.calculate_weight(summary.chapter))
        return summaries

    async def list_chapters(self, project_id: str) -> List[str]:
        """List chapters for a project."""
        drafts_dir = self.get_project_path(project_id) / "drafts"
        if not drafts_dir.exists():
            return []

        chapters = [path.name for path in drafts_dir.iterdir() if path.is_dir()]
        return ChapterIDValidator.sort_chapters(chapters)

    async def delete_chapter(self, project_id: str, chapter: str) -> bool:
        """Delete all draft artifacts for a chapter."""
        project_path = self.get_project_path(project_id)
        chapter_dir = project_path / "drafts" / chapter
        summary_path = project_path / "summaries" / f"{chapter}_summary.yaml"

        deleted_any = False
        if chapter_dir.exists() and chapter_dir.is_dir():
            shutil.rmtree(chapter_dir)
            deleted_any = True

        if summary_path.exists() and summary_path.is_file():
            summary_path.unlink()
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
        file_path = self.get_project_path(project_id) / "drafts" / chapter / "conflicts.yaml"
        await self.write_yaml(file_path, report)

    def _ensure_volume_id(self, summary: ChapterSummary) -> ChapterSummary:
        """Ensure volume_id is set on a summary."""
        if not summary.volume_id:
            summary.volume_id = ChapterIDValidator.extract_volume_id(summary.chapter) or "V1"
        return summary
