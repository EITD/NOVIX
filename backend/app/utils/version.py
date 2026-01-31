"""
Version Utilities / 版本工具

提供统一的版本号管理函数
"""

from app.utils.logger import get_logger

logger = get_logger(__name__)


def increment_version(current_version: str) -> str:
    """
    递增版本号

    支持格式：v1, v2, v10 等

    Args:
        current_version: 当前版本号，如 "v1"

    Returns:
        新版本号，如 "v2"

    Examples:
        >>> increment_version("v1")
        "v2"
        >>> increment_version("v10")
        "v11"
        >>> increment_version("invalid")
        "v2"
    """
    try:
        # 移除 'v' 前缀并转换为整数
        num = int(current_version.replace("v", "").strip())
        return f"v{num + 1}"
    except (ValueError, AttributeError) as e:
        logger.warning(f"Failed to parse version '{current_version}': {e}, defaulting to v2")
        return "v2"


def parse_version_number(version_str: str) -> int:
    """
    解析版本号中的数字部分

    Args:
        version_str: 版本字符串，如 "v1"

    Returns:
        版本号数字，如 1

    Raises:
        ValueError: 如果无法解析版本号
    """
    try:
        return int(version_str.replace("v", "").strip())
    except (ValueError, AttributeError) as e:
        logger.error(f"Failed to parse version number from '{version_str}': {e}")
        raise ValueError(f"Invalid version format: {version_str}") from e


def is_valid_version(version_str: str) -> bool:
    """
    检查版本号格式是否有效

    Args:
        version_str: 版本字符串

    Returns:
        True 如果格式有效，False 否则
    """
    try:
        parse_version_number(version_str)
        return True
    except ValueError:
        return False
