"""
Memory Pack Router / 章节记忆包接口
"""

from fastapi import APIRouter, HTTPException

from app.storage.memory_pack import MemoryPackStorage

router = APIRouter(tags=["memory_pack"])
_storage = MemoryPackStorage()


@router.get("/projects/{project_id}/memory-pack/{chapter}")
async def get_memory_pack_status(project_id: str, chapter: str):
    """Get memory pack status for a chapter."""
    try:
        pack = await _storage.read_pack(project_id, chapter)
        return _storage.build_status(chapter, pack)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
