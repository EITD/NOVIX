# -*- coding: utf-8 -*-
"""
文枢 WenShape - 深度上下文感知的智能体小说创作系统
WenShape - Deep Context-Aware Agent-Based Novel Writing System

Copyright © 2025-2026 WenShape Team
License: PolyForm Noncommercial License 1.0.0

模块说明 / Module Description:
  版本工具 - 提供版本号的解析、验证和递增功能
  Version Utilities - Unified version number management functions.
"""

from app.utils.logger import get_logger

logger = get_logger(__name__)


def increment_version(current_version: str) -> str:
    """
    递增版本号

    Increment version number.

    支持格式：v1, v2, v10 等。如果无法解析，默认返回 "v2"。
    Supported formats: v1, v2, v10, etc. Defaults to "v2" on parse failure.

    Args:
        current_version: 当前版本号，如 "v1" / Current version (e.g., "v1")

    Returns:
        新版本号，如 "v2" / New version (e.g., "v2")

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
        logger.warning("Failed to parse version '%s': %s, defaulting to v2", current_version, e)
        return "v2"


def parse_version_number(version_str: str) -> int:
    """
    解析版本号中的数字部分

    Parse version number from version string.

    Args:
        version_str: 版本字符串，如 "v1" / Version string (e.g., "v1")

    Returns:
        版本号数字，如 1 / Version number (e.g., 1)

    Raises:
        ValueError: 如果无法解析版本号 / If version format is invalid

    Example:
        >>> parse_version_number("v5")
        5
    """
    try:
        return int(version_str.replace("v", "").strip())
    except (ValueError, AttributeError) as e:
        logger.error("Failed to parse version number from '%s': %s", version_str, e)
        raise ValueError(f"Invalid version format: {version_str}") from e


def is_valid_version(version_str: str) -> bool:
    """
    检查版本号格式是否有效

    Check if version format is valid.

    Args:
        version_str: 版本字符串 / Version string

    Returns:
        True 如果格式有效 / True if format is valid
    """
    try:
        parse_version_number(version_str)
        return True
    except ValueError:
        return False
