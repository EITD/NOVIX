"""
Volumes Router / 分卷路由

提供分卷的 CRUD API 端点和相关操作。
"""

from fastapi import APIRouter, HTTPException
from typing import List
from app.storage.volumes import VolumeStorage
from app.schemas.volume import Volume, VolumeCreate, VolumeSummary, VolumeStats
from app.utils.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/projects/{project_id}/volumes", tags=["volumes"])
volume_storage = VolumeStorage()


@router.get("", response_model=List[Volume])
async def list_volumes(project_id: str):
    """
    列出项目的所有分卷

    Args:
        project_id: 项目ID

    Returns:
        分卷列表，按 order 排序
    """
    try:
        volumes = await volume_storage.list_volumes(project_id)
        return volumes
    except Exception as e:
        logger.error(f"Failed to list volumes for project {project_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("", response_model=Volume)
async def create_volume(project_id: str, volume_create: VolumeCreate):
    """
    创建新分卷

    Args:
        project_id: 项目ID
        volume_create: 分卷创建请求

    Returns:
        创建的分卷对象
    """
    try:
        volume = await volume_storage.create_volume(project_id, volume_create)
        logger.info(f"Created volume {volume.id} for project {project_id}")
        return volume
    except Exception as e:
        logger.error(f"Failed to create volume for project {project_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{volume_id}", response_model=Volume)
async def get_volume(project_id: str, volume_id: str):
    """
    获取分卷信息

    Args:
        project_id: 项目ID
        volume_id: 分卷ID

    Returns:
        分卷对象
    """
    try:
        volume = await volume_storage.get_volume(project_id, volume_id)
        if not volume:
            raise HTTPException(status_code=404, detail=f"Volume {volume_id} not found")
        return volume
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get volume {volume_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{volume_id}", response_model=Volume)
async def update_volume(project_id: str, volume_id: str, volume_update: VolumeCreate):
    """
    更新分卷信息

    Args:
        project_id: 项目ID
        volume_id: 分卷ID
        volume_update: 分卷更新请求

    Returns:
        更新后的分卷对象
    """
    try:
        volume = await volume_storage.get_volume(project_id, volume_id)
        if not volume:
            raise HTTPException(status_code=404, detail=f"Volume {volume_id} not found")

        # 更新字段
        volume.title = volume_update.title
        volume.summary = volume_update.summary
        if volume_update.order:
            volume.order = volume_update.order

        updated_volume = await volume_storage.update_volume(project_id, volume)
        logger.info(f"Updated volume {volume_id} for project {project_id}")
        return updated_volume
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update volume {volume_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{volume_id}")
async def delete_volume(project_id: str, volume_id: str):
    """
    删除分卷

    Args:
        project_id: 项目ID
        volume_id: 分卷ID

    Returns:
        删除结果
    """
    try:
        if volume_id == "V1":
            raise HTTPException(status_code=400, detail="Default volume V1 cannot be deleted")
        success = await volume_storage.delete_volume(project_id, volume_id)
        if not success:
            raise HTTPException(status_code=404, detail=f"Volume {volume_id} not found")

        logger.info(f"Deleted volume {volume_id} from project {project_id}")
        return {"success": True, "message": f"Volume {volume_id} deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete volume {volume_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{volume_id}/summary", response_model=VolumeSummary)
async def get_volume_summary(project_id: str, volume_id: str):
    """
    获取分卷摘要

    Args:
        project_id: 项目ID
        volume_id: 分卷ID

    Returns:
        分卷摘要对象
    """
    try:
        summary = await volume_storage.get_volume_summary(project_id, volume_id)
        if not summary:
            raise HTTPException(status_code=404, detail=f"Summary for volume {volume_id} not found")
        return summary
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get volume summary for {volume_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{volume_id}/summary", response_model=VolumeSummary)
async def save_volume_summary(project_id: str, volume_id: str, summary: VolumeSummary):
    """
    保存分卷摘要

    Args:
        project_id: 项目ID
        volume_id: 分卷ID
        summary: 分卷摘要对象

    Returns:
        保存后的分卷摘要
    """
    try:
        # 验证分卷存在
        volume = await volume_storage.get_volume(project_id, volume_id)
        if not volume:
            raise HTTPException(status_code=404, detail=f"Volume {volume_id} not found")

        # 确保 volume_id 匹配
        summary.volume_id = volume_id
        await volume_storage.save_volume_summary(project_id, summary)
        logger.info(f"Saved summary for volume {volume_id}")
        return summary
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to save volume summary for {volume_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{volume_id}/stats", response_model=VolumeStats)
async def get_volume_stats(project_id: str, volume_id: str):
    """
    获取分卷统计信息

    Args:
        project_id: 项目ID
        volume_id: 分卷ID

    Returns:
        分卷统计信息
    """
    try:
        stats = await volume_storage.get_volume_stats(project_id, volume_id)
        if not stats:
            raise HTTPException(status_code=404, detail=f"Volume {volume_id} not found")
        return stats
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get volume stats for {volume_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
