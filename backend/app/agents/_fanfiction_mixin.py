# -*- coding: utf-8 -*-
"""
文枢 WenShape - 深度上下文感知的智能体小说创作系统
WenShape - Deep Context-Aware Agent-Based Novel Writing System

Copyright © 2025-2026 WenShape Team
License: PolyForm Noncommercial License 1.0.0

模块说明 / Module Description:
  同人创作 Mixin - 从档案员智能体中提取的同人卡片提取、验证和修复方法。
  Fanfiction extraction mixin - Methods for fanfiction Wiki card extraction, validation, sanitization, and LLM repair fallbacks.
"""

import re
from typing import Any, Dict

from app.prompts import (
    FANFICTION_CARD_REPAIR_HINT_ENRICH_DESCRIPTION,
    FANFICTION_CARD_REPAIR_HINT_STRICT_JSON,
    archivist_fanfiction_card_prompt,
    archivist_fanfiction_card_repair_prompt,
)
from app.services.llm_config_service import llm_config_service
from app.utils.llm_output import parse_json_payload
from app.utils.logger import get_logger
from app.utils.text import normalize_newlines

logger = get_logger(__name__)


class FanfictionMixin:
    """
    同人创作卡片提取 Mixin。

    Methods for fanfiction Wiki card extraction and processing.
    Handles JSON parsing, validation, repair, and type inference.
    """

    async def extract_fanfiction_card(self, title: str, content: str) -> Dict[str, str]:
        """Extract a single card summary for fanfiction import."""
        clean_title = str(title or "").strip()
        clean_content = str(content or "").strip()
        if not clean_content:
            return {
                "name": clean_title or "Unknown",
                "type": self._infer_card_type_from_title(clean_title),
                "description": "",
            }

        prompt = archivist_fanfiction_card_prompt(title=clean_title, content=clean_content)

        provider_id = self.gateway.get_provider_for_agent(self.get_agent_name())
        profile = llm_config_service.get_profile_by_id(provider_id) or {}
        logger.info(
            "Fanfiction extraction using provider=%s model=%s content_chars=%s",
            provider_id,
            profile.get("model"),
            len(clean_content),
        )

        messages = self.build_messages(
            system_prompt=prompt.system,
            user_prompt=prompt.user,
            context_items=None,
        )

        max_attempts = 5
        last_description = ""
        last_length = 0
        for attempt in range(1, max_attempts + 1):
            response = await self.call_llm(messages, max_tokens=2600)
            logger.info("Fanfiction extraction response_chars=%s", len(response or ""))
            parsed = self._parse_json_object(response)
            if not self._is_valid_fanfiction_payload(parsed, clean_content):
                logger.warning("Fanfiction extraction JSON parse failed, retrying with strict prompt")
                parsed = await self._extract_fanfiction_json_from_content(
                    clean_title,
                    clean_content,
                    hint=FANFICTION_CARD_REPAIR_HINT_STRICT_JSON,
                )

            if not self._is_valid_fanfiction_payload(parsed, clean_content):
                continue

            name = str(parsed.get("name") or clean_title or "Unknown").strip()
            card_type = self._normalize_fanfiction_card_type(parsed.get("type")) or self._infer_card_type_from_title(name)
            description = self._sanitize_fanfiction_description(str(parsed.get("description") or "").strip())
            last_description = description
            last_length = len(description)

            if not description or self._is_copied_from_source(description, clean_content):
                parsed = await self._extract_fanfiction_json_from_content(
                    name,
                    clean_content,
                    hint=FANFICTION_CARD_REPAIR_HINT_ENRICH_DESCRIPTION,
                )
                if self._is_valid_fanfiction_payload(parsed, clean_content):
                    description = self._sanitize_fanfiction_description(str(parsed.get("description") or "").strip())
                    last_description = description
                    last_length = len(description)
                if not description or self._is_copied_from_source(description, clean_content):
                    continue

            if card_type not in {"Character", "World"}:
                card_type = self._infer_card_type_from_title(name)

            return {
                "name": name,
                "type": card_type,
                "description": description,
            }

        # 兜底：尝试从原文提取基础摘要
        fallback_desc = self._build_fanfiction_fallback(clean_title, clean_content)
        fallback_desc = self._sanitize_fanfiction_description(fallback_desc)
        if fallback_desc:
            return {
                "name": clean_title or "Unknown",
                "type": self._infer_card_type_from_title(clean_title),
                "description": fallback_desc,
            }
        raise ValueError(f"Fanfiction extraction failed: empty description (len={last_length})")

    async def _extract_fanfiction_json_from_content(
        self,
        title: str,
        content: str,
        hint: str = "",
    ) -> Dict[str, Any]:
        if not content:
            return {}
        prompt = archivist_fanfiction_card_repair_prompt(title=title, content=content, hint=hint)
        messages = self.build_messages(
            system_prompt=prompt.system,
            user_prompt=prompt.user,
            context_items=None,
        )
        response = await self.call_llm(messages, max_tokens=2200)
        return self._parse_json_object(response)

    def _normalize_fanfiction_card_type(self, raw_type: Any) -> str:
        """
        Normalize fanfiction card type to backend schema (`Character|World`).

        说明：
        - LLM 可能输出中文（如"角色/设定/世界观"），这里统一映射。
        - 返回空字符串表示无法识别，由上层兜底推断。
        """
        t = str(raw_type or "").strip()
        if not t:
            return ""
        if t in {"Character", "World"}:
            return t
        lowered = t.lower()
        if lowered in {"character", "world"}:
            return lowered.capitalize()
        if any(x in t for x in {"角色", "人物", "主角", "配角"}):
            return "Character"
        if any(x in t for x in {"设定", "世界观", "世界", "地点", "组织", "体系", "规则"}):
            return "World"
        return ""

    def _is_valid_fanfiction_payload(self, payload: Dict[str, Any], source: str = "") -> bool:
        if not isinstance(payload, dict):
            return False
        name = str(payload.get("name") or "").strip()
        card_type = self._normalize_fanfiction_card_type(payload.get("type"))
        description = str(payload.get("description") or "").strip()
        if not name or not description:
            return False
        if card_type not in {"Character", "World"}:
            return False
        if source and self._is_copied_from_source(description, source):
            return False
        return True

    def _is_copied_from_source(self, description: str, source: str = "") -> bool:
        if not description or not source:
            return False
        text = description.strip()
        if len(text) < 20:
            return False
        if text in source:
            return True
        # 长文更容易出现零散的常见短语重合；优先用"较长片段命中"判断抄袭。
        long_window = 80
        if len(text) >= 160:
            for i in range(0, len(text) - long_window + 1, 25):
                frag = text[i : i + long_window]
                if frag and frag in source:
                    return True

        window = 18
        hits = 0
        for i in range(0, len(text) - window + 1, 8):
            frag = text[i : i + window]
            if frag and frag in source:
                hits += 1
                if hits >= 3:
                    return True
        return False

    def _parse_json_object(self, text: str) -> Dict[str, Any]:
        """
        Parse JSON object from LLM response using robust parser.
        使用稳健的解析器从 LLM 响应中提取 JSON 对象。
        """
        if not text:
            return {}
        data, err = parse_json_payload(text, expected_type=dict)
        if err:
            logger.debug("JSON parse failed: %s, response preview: %s", err, text[:200])
            return {}
        return data or {}

    def _truncate_description(self, text: str, limit: int = 800) -> str:
        if not text:
            return ""
        clean = re.sub(r"\s+", " ", text).strip()
        if len(clean) <= limit:
            return clean
        return clean[:limit].rstrip()

    def _fallback_fanfiction_description(self, content: str) -> str:
        summary = ""
        summary_match = re.search(r"Summary:\s*(.+?)(?:\n\n|$)", content, re.IGNORECASE | re.DOTALL)
        if summary_match:
            summary = summary_match.group(1).strip()
        if not summary:
            summary = self._extract_bracket_section(content, "简介")
        summary = self._sanitize_fanfiction_description(summary)
        if summary:
            return self._truncate_description(summary, limit=800)
        clean = re.sub(r"\s+", " ", content).strip()
        clean = self._sanitize_fanfiction_description(clean)
        return self._truncate_description(clean, limit=800)

    def _sanitize_fanfiction_description(self, text: str) -> str:
        if not text:
            return ""
        cleaned = normalize_newlines(str(text or ""))
        cleaned = re.sub(r"【[^】]{1,12}】\s*", "", cleaned)
        cleaned = re.sub(r"\bTitle:\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\bSummary:\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\bTable\s*\d*:\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\bRawText:\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*\|\s*", " ", cleaned)

        # 若模型把所有字段堆在同一段，用字段名做"仅排版"的自动分段（不改变内容语义）
        if "\n" not in cleaned:
            labels = ["身份定位：", "别名称呼：", "外貌特征：", "性格动机：", "能力限制：", "关键关系：", "写作注意："]
            first = True
            for lab in labels:
                idx = cleaned.find(lab)
                if idx <= 0:
                    continue
                if first:
                    first = False
                    continue
                cleaned = cleaned.replace(lab, "\n\n" + lab)

        lines = []
        for raw_line in cleaned.split("\n"):
            line = re.sub(r"[ \t]{2,}", " ", str(raw_line or "")).strip()
            lines.append(line)

        # 折叠多余空行：最多保留 1 个空行用于分段
        out_lines = []
        blank = 0
        for line in lines:
            if not line:
                blank += 1
                if blank <= 1:
                    out_lines.append("")
                continue
            blank = 0
            out_lines.append(line)

        cleaned = "\n".join(out_lines).strip()

        # 去重相邻句子（按段落处理），减少"绕圈子"
        paragraphs = [p.strip() for p in re.split(r"\n{2,}", cleaned) if p.strip()]
        new_paras = []
        for p in paragraphs:
            sentences = re.split(r"(?<=[。！？!?.])", p)
            deduped = []
            seen = set()
            for s in sentences:
                s = s.strip()
                if not s:
                    continue
                key = s[:20]
                if key in seen:
                    continue
                seen.add(key)
                deduped.append(s)
            new_paras.append("".join(deduped).strip())

        return "\n\n".join([p for p in new_paras if p]).strip()

    def _extract_bracket_section(self, content: str, label: str) -> str:
        """
        Extract sections formatted like `【标签】...`.

        用于兼容 crawler_service 对萌娘百科（Moegirlpedia）的结构化输出：
        - `【简介】`
        - `【基础资料】`
        - `【关键段落】`
        """
        if not content or not label:
            return ""
        pattern = re.compile(rf"【{re.escape(label)}】\s*(.+?)(?:\n\n【|\Z)", re.DOTALL)
        match = pattern.search(content)
        return match.group(1).strip() if match else ""

    def _extract_llm_section(self, content: str, label: str) -> str:
        if not content or not label:
            return ""
        pattern = re.compile(rf"{re.escape(label)}:\s*(.+?)(?:\n\n[A-Z][A-Za-z ]+:\s*|\Z)", re.DOTALL)
        match = pattern.search(content)
        return match.group(1).strip() if match else ""

    def _build_fanfiction_fallback(self, title: str, content: str) -> str:
        summary = self._extract_bracket_section(content, "简介") or self._extract_llm_section(content, "Summary")
        summary = self._sanitize_fanfiction_description(summary)
        if summary and len(summary) >= 60:
            return self._truncate_description(summary, limit=800)

        infobox = self._extract_bracket_section(content, "基础资料") or self._extract_llm_section(content, "Infobox")
        infobox = self._sanitize_fanfiction_description(infobox)
        info_lines = []
        if infobox:
            for line in infobox.split("\n"):
                line = line.strip("- ").strip()
                if not line:
                    continue
                key_lower = line.split(":")[0].lower() if ":" in line else line.lower()
                if any(k in key_lower for k in ["姓名", "本名", "别名", "身份", "职业", "性别", "所属", "阵营", "种族", "配音"]):
                    info_lines.append(line)
        if info_lines:
            combined = f"{title}，" + "，".join(info_lines)
            return self._truncate_description(self._sanitize_fanfiction_description(combined), limit=800)

        key_para = self._extract_bracket_section(content, "关键段落")
        key_para = self._sanitize_fanfiction_description(key_para)
        if key_para and len(key_para) >= 60:
            combined = f"{title}，{key_para}"
            return self._truncate_description(self._sanitize_fanfiction_description(combined), limit=800)

        return self._fallback_fanfiction_description(content)

    def _infer_card_type_from_title(self, title: str) -> str:
        text = title or ""
        world_suffixes = (
            "城",
            "国",
            "派",
            "门",
            "宗",
            "山",
            "谷",
            "镇",
            "村",
            "府",
            "馆",
            "寺",
            "宫",
            "湖",
            "河",
            "岛",
            "大陆",
            "组织",
            "学院",
        )
        if any(text.endswith(suffix) for suffix in world_suffixes):
            return "World"
        return "Character"
