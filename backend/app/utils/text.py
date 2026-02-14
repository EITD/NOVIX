# -*- coding: utf-8 -*-
"""
文枢 WenShape - 深度上下文感知的智能体小说创作系统
WenShape - Deep Context-Aware Agent-Based Novel Writing System

Copyright © 2025-2026 WenShape Team
License: PolyForm Noncommercial License 1.0.0

模块说明 / Module Description:
  文本规范化工具 - 提供文本规范化函数用于处理不同的换行符格式
  Text Normalization Utilities - Normalize newlines and whitespace for consistent text processing.
"""


def normalize_newlines(text: str | None) -> str:
    """
    规范化换行符（\\r\\n 和 \\r 转换为 \\n）

    Normalize \\\\r\\\\n and \\\\r to \\\\n.

    安全处理None值，返回空字符串。
    Accepts *None* safely (returns empty string).

    Args:
        text: 输入文本 / Input text

    Returns:
        规范化后的文本 / Normalized text

    Example:
        >>> normalize_newlines("line1\\r\\nline2\\r\\nline3")
        "line1\\nline2\\nline3"
        >>> normalize_newlines(None)
        ""
    """
    return (text or "").replace("\r\n", "\n").replace("\r", "\n")


def normalize_for_compare(text: str | None) -> str:
    """
    规范化换行符并去除尾部空白用于比较

    Normalize newlines **and** strip trailing whitespace for comparison.

    Args:
        text: 输入文本 / Input text

    Returns:
        规范化并去除尾部空白的文本 / Normalized text with trailing whitespace removed

    Example:
        >>> normalize_for_compare("line1\\r\\nline2  ")
        "line1\\nline2"
    """
    return normalize_newlines(text).rstrip()
