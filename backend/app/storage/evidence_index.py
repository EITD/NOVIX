"""
Evidence index storage.
"""

from typing import Any, Dict, List, Optional

from app.schemas.evidence import EvidenceItem, EvidenceIndexMeta
from app.storage.base import BaseStorage


class EvidenceIndexStorage(BaseStorage):
    """File-based storage for evidence indices."""

    def get_index_dir(self, project_id: str):
        """Return the index directory for a project."""
        return self.get_project_path(project_id) / "index"

    def get_index_path(self, project_id: str, index_name: str):
        """Return the JSONL path for an index."""
        return self.get_index_dir(project_id) / f"{index_name}.jsonl"

    def get_meta_path(self, project_id: str, index_name: str):
        """Return the metadata path for an index."""
        return self.get_index_dir(project_id) / f"{index_name}.meta.json"

    async def write_items(self, project_id: str, index_name: str, items: List[EvidenceItem]) -> None:
        """Write evidence items to index storage."""
        path = self.get_index_path(project_id, index_name)
        payload = [item.model_dump(mode="json") for item in items]
        await self.write_jsonl(path, payload)

    async def append_items(self, project_id: str, index_name: str, items: List[EvidenceItem]) -> None:
        """Append evidence items to index storage."""
        path = self.get_index_path(project_id, index_name)
        for item in items:
            await self.append_jsonl(path, item.model_dump(mode="json"))

    async def read_items(self, project_id: str, index_name: str) -> List[EvidenceItem]:
        """Read evidence items from index storage."""
        path = self.get_index_path(project_id, index_name)
        rows = await self.read_jsonl(path)
        return [EvidenceItem(**row) for row in rows]

    async def write_meta(self, project_id: str, index_name: str, meta: EvidenceIndexMeta) -> None:
        """Write index metadata."""
        path = self.get_meta_path(project_id, index_name)
        await self.write_json(path, meta.model_dump(mode="json"))

    async def read_meta(self, project_id: str, index_name: str) -> Optional[EvidenceIndexMeta]:
        """Read index metadata."""
        path = self.get_meta_path(project_id, index_name)
        if not path.exists():
            return None
        data = await self.read_json(path)
        return EvidenceIndexMeta(**data)

    async def read_json(self, file_path):
        """Read a JSON file."""
        if not file_path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")
        import json
        import aiofiles
        async with aiofiles.open(file_path, "r", encoding=self.encoding) as f:
            raw = await f.read()
            return json.loads(raw)

    async def write_json(self, file_path, data: Dict[str, Any]) -> None:
        """Write a JSON file."""
        import json
        import aiofiles
        self.ensure_dir(file_path.parent)
        async with aiofiles.open(file_path, "w", encoding=self.encoding) as f:
            await f.write(json.dumps(data, ensure_ascii=False, indent=2))
