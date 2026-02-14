# -*- coding: utf-8 -*-
"""
文枢 WenShape - 深度上下文感知的智能体小说创作系统
WenShape - Deep Context-Aware Agent-Based Novel Writing System

Copyright © 2025-2026 WenShape Team
License: PolyForm Noncommercial License 1.0.0

模块说明 / Module Description:
  动态范围计算器 - 根据总章节数计算章节检索范围的共享工具
  Dynamic Range Calculator - Shared utility for calculating chapter retrieval ranges
  based on total chapters.
"""

from typing import Dict
from app.config import config


def _get_archivist_config() -> dict:
    """
    获取档案员配置（带默认值）

    Get archivist config with defaults.

    Returns:
        配置字典 / Configuration dictionary
    """
    return config.get("archivist", {})


def calculate_dynamic_ranges(total_chapters: int) -> Dict[str, int]:
    """
    根据总章节数计算动态检索范围

    Calculate dynamic retrieval ranges based on total chapter count.

    This provides a unified calculation used by both DynamicContextRetriever
    and ArchivistAgent to ensure consistent behavior across the system.

    Args:
        total_chapters: 项目中的总章节数 / Total number of chapters in the project

    Returns:
        包含范围值的字典 / Dictionary with range values:
        - full_facts (int): 检索完整事实的章数 / Chapters to retrieve with full facts
        - summary_events (int): 检索摘要+事件的章数 / Chapters to retrieve with summary + events
        - summary_only (int): 仅检索摘要的章数 / Chapters to retrieve with summary only
        - title_only (int): 仅检索标题的章数 / Chapters to retrieve with title only

    Example:
        >>> calculate_dynamic_ranges(100)
        {'full_facts': 3, 'summary_events': 8, 'summary_only': 25, 'title_only': 100}
    """
    if total_chapters <= 20:
        return {"full_facts": 2, "summary_events": 5, "summary_only": 10, "title_only": 20}
    if total_chapters <= 50:
        return {"full_facts": 2, "summary_events": 5, "summary_only": 15, "title_only": 50}
    if total_chapters <= 100:
        return {"full_facts": 3, "summary_events": 8, "summary_only": 25, "title_only": 100}
    if total_chapters <= 300:
        return {"full_facts": 3, "summary_events": 10, "summary_only": 40, "title_only": 300}
    return {"full_facts": 5, "summary_events": 15, "summary_only": 60, "title_only": total_chapters}


def get_chapter_window(window_type: str, total_chapters: int = 0) -> int:
    """
    获取带动态调整的章节窗口大小

    Get chapter window size with dynamic adjustment.

    Combines config-based settings with dynamic range calculation to ensure
    optimal context window sizing based on project size.

    Args:
        window_type: 窗口类型 / Window type
            - 'fact': 完整事实窗口 / Full facts window
            - 'summary': 摘要窗口 / Summary window
        total_chapters: 总章数（用于动态调整） / Total available chapters for dynamic adjustment

    Returns:
        窗口大小（章节数） / Window size (number of chapters)

    Example:
        >>> get_chapter_window("fact", 100)
        5
        >>> get_chapter_window("summary", 200)
        8
    """
    cfg = _get_archivist_config()
    min_window = cfg.get("min_chapter_window", 2)
    max_window = cfg.get("max_chapter_window", 10)

    # Get base value from config
    if window_type == "fact":
        base = cfg.get("fact_chapter_window", 3)
    else:
        base = cfg.get("summary_chapter_window", 3)

    # Apply dynamic adjustment based on total chapters
    if total_chapters > 0:
        ranges = calculate_dynamic_ranges(total_chapters)
        # Use full_facts range for fact window, summary_events for summary window
        if window_type == "fact":
            dynamic_value = ranges.get("full_facts", base)
        else:
            dynamic_value = ranges.get("summary_events", base)
        # Take the larger of config base and dynamic value
        base = max(base, dynamic_value)

    return max(min_window, min(base, max_window))


def get_previous_chapters_limit(total_chapters: int) -> int:
    """
    计算需要检索的前置章节数量

    Calculate how many previous chapters to retrieve.

    Args:
        total_chapters: 总章节数 / Total number of chapters

    Returns:
        需要检索的前置章节数 / Number of previous chapters to retrieve

    Example:
        >>> get_previous_chapters_limit(100)
        8
    """
    ranges = calculate_dynamic_ranges(total_chapters)
    # Return summary_events range as the limit for previous chapters
    # This ensures we get enough context without overloading
    return ranges.get("summary_events", 5)
