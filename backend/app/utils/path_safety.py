# -*- coding: utf-8 -*-
"""
文枢 WenShape - 深度上下文感知的智能体小说创作系统
WenShape - Deep Context-Aware Agent-Based Novel Writing System

Copyright © 2025-2026 WenShape Team
License: PolyForm Noncommercial License 1.0.0

模块说明 / Module Description:
  路径安全工具 - 在使用用户输入的标识符之前进行清理和验证
  Path Safety Utilities - Sanitize user-supplied identifiers before using them in file paths.
"""

import re
from pathlib import Path

# Allow: word characters (includes CJK via \w with re.UNICODE), hyphens, dots (not leading)
# 允许：单词字符（包括通过re.UNICODE的CJK）、连字符、点（不在开头）
_SAFE_ID_RE = re.compile(r"^[\w][\w\-\.]*$", re.UNICODE)

# Characters that are dangerous in file paths
# 文件路径中危险的字符
_UNSAFE_CHARS_RE = re.compile(r"[^\w\u4e00-\u9fff\-]", re.UNICODE)


def sanitize_id(raw: str, max_length: int = 64) -> str:
    """
    清理用户提供的标识符以安全用于文件路径

    Sanitize a user-supplied identifier for safe use in file paths.

    清理规则：
    - 用 '_' 替换不安全字符
    - 拒绝空值、点开头、目录遍历尝试
    - 截断到最大长度

    Sanitization rules:
    - Replace unsafe characters with '_'
    - Reject empty / dot-prefixed / traversal attempts
    - Truncate to max_length

    Args:
        raw: 原始输入 / Raw input
        max_length: 最大长度 / Maximum length

    Returns:
        清理后的标识符 / Sanitized identifier

    Raises:
        ValueError: 如果输入无法清理为有效ID / If input cannot be sanitized to valid ID

    Example:
        >>> sanitize_id("project-2024")
        "project-2024"
        >>> sanitize_id("../../../etc/passwd")
        "etc_passwd"
        >>> sanitize_id("user input@#$%")
        "user_input____"
    """
    if not raw or not isinstance(raw, str):
        raise ValueError("ID必须是非空字符串 / ID must be a non-empty string")

    text = raw.strip()
    if not text:
        raise ValueError("ID必须是非空字符串 / ID must be a non-empty string")

    # Replace spaces with underscores first
    # 首先用下划线替换空格
    text = text.replace(" ", "_")

    # Remove any path traversal attempts
    # 移除任何目录遍历尝试
    text = text.replace("..", "").replace("/", "").replace("\\", "")

    # Replace remaining unsafe characters
    # 替换剩余的不安全字符
    text = _UNSAFE_CHARS_RE.sub("_", text)

    # Strip leading dots/underscores
    # 移除开头的点/下划线
    text = text.lstrip("._")

    # Collapse multiple underscores
    # 合并多个下划线
    text = re.sub(r"_+", "_", text)

    # Truncate
    # 截断
    text = text[:max_length]

    # Strip trailing underscores/dots
    # 移除末尾的下划线/点
    text = text.rstrip("._")

    if not text:
        raise ValueError(f"无法从输入清理ID / Cannot sanitize ID from input: {raw!r}")

    return text


def validate_path_within(child: Path, parent: Path) -> Path:
    """
    验证child路径在parent目录内

    Validate that *child* resolves to a path inside *parent*.

    Returns the resolved child path.

    Args:
        child: 子路径 / Child path
        parent: 父路径 / Parent path

    Returns:
        解析后的子路径 / Resolved child path

    Raises:
        ValueError: 如果子路径逃逸出父目录 / If the child escapes the parent directory

    Example:
        >>> validate_path_within(Path("data/project1"), Path("data"))
        PosixPath('data/project1')
        >>> validate_path_within(Path("../etc"), Path("data"))
        # Raises ValueError
    """
    resolved_parent = parent.resolve()
    resolved_child = child.resolve()

    if not str(resolved_child).startswith(str(resolved_parent)):
        raise ValueError(f"路径逃逸数据目录 / Path escapes data directory: {child}")

    return resolved_child
