"""
Chapter ID utilities / 章节ID工具

支持的格式:
- C1, C01
- ch1, ch01 (legacy)
- V1C1, V2C5
- C3E1, C2I1 (extra/interlude)
"""

from typing import Dict, List, Optional
import re


def _normalize_chapter_id(chapter_id: str) -> str:
    """Normalize chapter id to a standard uppercase form / 规范化章节ID"""
    if not chapter_id:
        return ""
    normalized = chapter_id.strip()
    if not normalized:
        return ""
    if normalized.lower().startswith("ch"):
        normalized = "C" + normalized[2:]
    return normalized.upper()


def parse_chapter_number(chapter: str) -> Optional[int]:
    """
    Extract chapter number from chapter ID / 提取章节号

    Examples:
    - C1, C01 -> 1
    - ch1, ch01 -> 1
    - V2C5 -> 5
    - C3E1 -> 3
    """
    normalized = _normalize_chapter_id(chapter)
    if not normalized:
        return None
    match = re.match(r"^(?:V\d+)?C(\d+)", normalized)
    if match:
        return int(match.group(1))
    fallback = re.search(r"(\d+)", normalized)
    if fallback:
        return int(fallback.group(1))
    return None


class ChapterIDValidator:
    """Chapter ID validator / 章节ID校验器"""

    PATTERN = re.compile(r"^(?:V(\d+))?C(\d+)(?:([EI])(\d+))?$", re.IGNORECASE)

    @staticmethod
    def validate(chapter_id: str) -> bool:
        """Validate chapter ID format / 校验章节ID格式"""
        normalized = _normalize_chapter_id(chapter_id)
        return bool(normalized and ChapterIDValidator.PATTERN.match(normalized))

    @staticmethod
    def parse(chapter_id: str) -> Optional[Dict[str, int]]:
        """
        Parse chapter ID into components / 解析章节ID

        Returns:
            {"volume": int, "chapter": int, "type": str|None, "seq": int}
        """
        normalized = _normalize_chapter_id(chapter_id)
        if not normalized:
            return None
        match = ChapterIDValidator.PATTERN.match(normalized)
        if not match:
            return None
        volume = int(match.group(1)) if match.group(1) else 0
        chapter = int(match.group(2))
        chapter_type = match.group(3)
        seq = int(match.group(4)) if match.group(4) else 0
        return {
            "volume": volume,
            "chapter": chapter,
            "type": chapter_type,
            "seq": seq,
        }

    @staticmethod
    def calculate_weight(chapter_id: str) -> float:
        """
        Calculate ordering weight / 计算排序权重

        Weight rules:
        - base = volume * 1000 + chapter
        - extra/interlude adds 0.1 * seq
        """
        parsed = ChapterIDValidator.parse(chapter_id)
        if not parsed:
            return 0.0
        base = parsed["volume"] * 1000 + parsed["chapter"]
        if parsed["type"] and parsed["seq"] > 0:
            base += 0.1 * parsed["seq"]
        return float(base)

    @staticmethod
    def sort_chapters(chapter_ids: List[str]) -> List[str]:
        """Sort chapter IDs by weight / 按权重排序章节ID"""
        return sorted(chapter_ids, key=ChapterIDValidator.calculate_weight)

    @staticmethod
    def suggest_next_id(
        existing_ids: List[str],
        chapter_type: str = "normal",
        insert_after: Optional[str] = None,
    ) -> str:
        """
        Suggest next chapter ID / 建议下一章节ID

        chapter_type: normal | extra | interlude
        """
        if chapter_type == "normal":
            max_chapter = 0
            for cid in existing_ids:
                parsed = ChapterIDValidator.parse(cid)
                if parsed and not parsed["type"]:
                    max_chapter = max(max_chapter, parsed["chapter"])
            return f"C{max_chapter + 1}"

        if chapter_type in {"extra", "interlude"}:
            if not insert_after:
                return ""
            type_code = "E" if chapter_type == "extra" else "I"
            count = 0
            for cid in existing_ids:
                parsed = ChapterIDValidator.parse(cid)
                if parsed and parsed["type"] == type_code and cid.startswith(insert_after):
                    count = max(count, parsed["seq"])
            return f"{_normalize_chapter_id(insert_after)}{type_code}{count + 1}"

        return ""

    @staticmethod
    def get_type_label(chapter_id: str) -> str:
        """Get chapter type label / 获取章节类型标签"""
        parsed = ChapterIDValidator.parse(chapter_id)
        if not parsed:
            return "未知"
        if not parsed["type"]:
            if parsed["chapter"] == 0:
                return "序章"
            if parsed["chapter"] == 999:
                return "尾声"
            return "正文"
        if parsed["type"] == "E":
            return "番外"
        if parsed["type"] == "I":
            return "幕间"
        return "未知"

    @staticmethod
    def calculate_distance(
        current_chapter: str,
        target_chapter: str,
        avg_chapters_per_volume: int = 15,
    ) -> int:
        """
        Calculate distance between two chapters / 计算章节距离
        """
        current = ChapterIDValidator.parse(current_chapter)
        target = ChapterIDValidator.parse(target_chapter)
        if not current or not target:
            return 10**9

        current_vol = current["volume"]
        target_vol = target["volume"]
        current_ch = current["chapter"]
        target_ch = target["chapter"]

        if current_vol == target_vol:
            return abs(current_ch - target_ch)

        volume_distance = abs(current_vol - target_vol)
        chapter_offset = min(current_ch, target_ch)
        return volume_distance * avg_chapters_per_volume + chapter_offset

    @staticmethod
    def extract_volume_id(chapter_id: str) -> Optional[str]:
        """Extract volume ID from chapter ID / 提取分卷ID"""
        parsed = ChapterIDValidator.parse(chapter_id)
        if parsed and parsed["volume"] > 0:
            return f"V{parsed['volume']}"
        return None
