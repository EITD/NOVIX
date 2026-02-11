"""
Chapter bindings storage.
"""

from typing import Any, Dict, Optional
from pathlib import Path

from app.storage.base import BaseStorage
from app.utils.chapter_id import normalize_chapter_id


class ChapterBindingStorage(BaseStorage):
    """Storage for chapter entity bindings."""

    def get_bindings_path(self, project_id: str, chapter: str) -> Path:
        """Return the bindings path for a chapter.

        Args:
            project_id: Target project id.
            chapter: Chapter id.

        Returns:
            Path to bindings file.
        """
        canonical = normalize_chapter_id(chapter) or str(chapter).strip()
        return self.get_project_path(project_id) / "index" / "chapters" / canonical / "bindings.yaml"

    async def read_bindings(self, project_id: str, chapter: str) -> Optional[Dict[str, Any]]:
        """Read bindings for a chapter.

        Args:
            project_id: Target project id.
            chapter: Chapter id.

        Returns:
            Binding payload if present.
        """
        path = self.get_bindings_path(project_id, chapter)
        if not path.exists():
            return None
        return await self.read_yaml(path)

    async def write_bindings(self, project_id: str, chapter: str, data: Dict[str, Any]) -> None:
        """Write bindings for a chapter.

        Args:
            project_id: Target project id.
            chapter: Chapter id.
            data: Binding payload.
        """
        path = self.get_bindings_path(project_id, chapter)
        await self.write_yaml(path, data)
