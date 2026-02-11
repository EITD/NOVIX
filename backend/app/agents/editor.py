"""
Editor Agent / 缂栬緫
Revises drafts based on user feedback
鏍规嵁鐢ㄦ埛鍙嶉淇鑽夌
"""

from typing import Dict, Any, List, Optional
from app.agents.base import BaseAgent
from app.prompts import EDITOR_REJECTED_CONCEPTS_INSTRUCTION, EDITOR_SYSTEM_PROMPT, editor_revision_prompt
from app.utils.logger import get_logger
from app.utils.version import increment_version

logger = get_logger(__name__)


class EditorAgent(BaseAgent):
    """
    Editor agent responsible for revising drafts
    缂栬緫锛岃礋璐ｄ慨璁㈣崏绋?
    """

    def get_agent_name(self) -> str:
        """Get agent name / 鑾峰彇 Agent 鍚嶇О"""
        return "editor"

    def get_system_prompt(self) -> str:
        """Get system prompt / 鑾峰彇绯荤粺鎻愮ず璇?"""
        return EDITOR_SYSTEM_PROMPT

    async def execute(
        self,
        project_id: str,
        chapter: str,
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Revise draft based on user feedback
        鏍规嵁鐢ㄦ埛鍙嶉淇鑽夌

        Args:
            project_id: Project ID / 椤圭洰ID
            chapter: Chapter ID / 绔犺妭ID
            context: Context with draft_version, user_feedback / 鍖呭惈鑽夌鐗堟湰鍜岀敤鎴峰弽棣堢殑涓婁笅鏂?
        Returns:
            Result with revised draft / 鍖呭惈淇绋跨殑缁撴灉
        """
        draft_version = context.get("draft_version", "v1")
        draft = await self.draft_storage.get_draft(project_id, chapter, draft_version)

        if not draft:
            return {
                "success": False,
                "error": f"Draft {draft_version} not found"
            }

        user_feedback = context.get("user_feedback", "")
        if not user_feedback:
            return {
                "success": False,
                "error": "User feedback is required"
            }

        style_card = await self.card_storage.get_style_card(project_id)
        rejected_entities = context.get("rejected_entities", [])
        memory_pack = context.get("memory_pack")

        revised_content = await self._generate_revision_from_feedback(
            original_draft=draft.content,
            user_feedback=user_feedback,
            style_card=style_card,
            rejected_entities=rejected_entities,
            memory_pack=memory_pack,
        )

        new_version = increment_version(draft_version)
        word_count = len(revised_content)

        revised_draft = await self.draft_storage.save_draft(
            project_id=project_id,
            chapter=chapter,
            version=new_version,
            content=revised_content,
            word_count=word_count,
            pending_confirmations=[]
        )

        return {
            "success": True,
            "draft": revised_draft,
            "version": new_version,
            "word_count": word_count
        }

    async def _generate_revision_from_feedback(
        self,
        original_draft: str,
        user_feedback: str,
        style_card: Any = None,
        rejected_entities: List[str] = None,
        memory_pack: Optional[Dict[str, Any]] = None,
        config_agent: str = None,
    ) -> str:
        """
        Generate revised draft directly from user feedback
        鐩存帴鏍规嵁鐢ㄦ埛鍙嶉鐢熸垚淇鍐呭

        CRITICAL: This MUST follow user instructions. Never refuse.
        """
        context_items = []

        if style_card:
            try:
                context_items.append(f"Style: {style_card.style}")
            except (AttributeError, TypeError) as e:
                logger.warning(f"Failed to add style guidance: {e}")

        if rejected_entities:
            context_items.append(
                "被拒绝概念：" + ", ".join(rejected_entities) + "\n" + EDITOR_REJECTED_CONCEPTS_INSTRUCTION
            )
        if memory_pack:
            context_items.extend(self._format_memory_pack_context(memory_pack))

        prompt = editor_revision_prompt(original_draft=original_draft, user_feedback=user_feedback)

        messages = self.build_messages(
            system_prompt=prompt.system,
            user_prompt=prompt.user,
            context_items=context_items
        )

        response = await self.call_llm(messages, config_agent=config_agent)
        return response.strip()

    async def suggest_revision(
        self,
        project_id: str,
        original_draft: str,
        user_feedback: str,
        rejected_entities: List[str] = None,
        memory_pack: Optional[Dict[str, Any]] = None,
    ) -> str:
        """
        Suggest a revision without persisting it.
        生成“修改建议”，不写入草稿版本（用于前端未保存内容的 Diff 预览）。
        """
        if original_draft is None:
            original_draft = ""
        if not user_feedback:
            raise ValueError("User feedback is required")

        style_card = await self.card_storage.get_style_card(project_id)
        return await self._generate_revision_from_feedback(
            original_draft=original_draft,
            user_feedback=user_feedback,
            style_card=style_card,
            rejected_entities=rejected_entities or [],
            memory_pack=memory_pack,
            config_agent="writer",
        )

    def _format_memory_pack_context(self, memory_pack: Dict[str, Any]) -> List[str]:
        """Format memory pack into compact context items for the editor."""
        payload: Any = {}
        if isinstance(memory_pack, dict):
            payload = memory_pack.get("payload") or memory_pack.get("working_memory_payload") or {}
            if not payload and any(key in memory_pack for key in ("working_memory", "evidence_pack", "unresolved_gaps")):
                # Backward/compat: Orchestrator may pass the payload dict directly.
                payload = memory_pack
        if not isinstance(payload, dict):
            payload = {}

        context_items: List[str] = []

        working_memory = payload.get("working_memory")
        if working_memory:
            context_items.append("工作记忆：\n" + str(working_memory).strip())

        evidence_pack = payload.get("evidence_pack") or {}
        evidence_items = evidence_pack.get("items") or []
        if evidence_items:
            def _score(item: Dict[str, Any]) -> float:
                try:
                    return float(item.get("score") or 0)
                except Exception:
                    return 0.0

            ordered = [item for item in evidence_items if isinstance(item, dict)]
            ordered.sort(key=_score, reverse=True)
            lines = []
            for item in ordered:
                text = str(item.get("text") or "").strip()
                if not text:
                    continue
                item_type = str(item.get("type") or "evidence")
                source = item.get("source") or {}
                source_parts = [
                    source.get("chapter"),
                    source.get("draft"),
                    source.get("path"),
                    source.get("field"),
                    source.get("fact_id"),
                    source.get("card"),
                    source.get("introduced_in"),
                ]
                source_label = " / ".join([str(part) for part in source_parts if part])
                line = f"[{item_type}] {text}"
                if source_label:
                    line += f" ({source_label})"
                lines.append(line)
                if len(lines) >= 6:
                    break
            if lines:
                context_items.append("证据摘录：\n" + "\n".join(lines))

        unresolved_gaps = payload.get("unresolved_gaps") or []
        if unresolved_gaps:
            gap_lines = []
            for gap in unresolved_gaps[:6]:
                if isinstance(gap, dict):
                    text = str(gap.get("text") or "").strip()
                else:
                    text = str(gap or "").strip()
                if text:
                    gap_lines.append(f"- {text}")
            if gap_lines:
                context_items.append("待确认缺口：\n" + "\n".join(gap_lines))

        snapshot = None
        if isinstance(memory_pack, dict):
            snapshot = memory_pack.get("card_snapshot")
        if isinstance(snapshot, dict):
            context_items.extend(self._format_card_snapshot(snapshot))

        return context_items

    def _format_card_snapshot(self, snapshot: Dict[str, Any]) -> List[str]:
        characters = snapshot.get("characters") or []
        world = snapshot.get("world") or []
        style = snapshot.get("style")

        context_items: List[str] = []

        if characters:
            lines = []
            for item in characters[:8]:
                if not isinstance(item, dict):
                    continue
                name = str(item.get("name") or "").strip()
                if not name:
                    continue
                stars = item.get("stars")
                star_label = f"★{stars}" if stars else ""
                appearance = str(item.get("appearance") or "").strip()
                identity = str(item.get("identity") or "").strip()
                aliases = item.get("aliases") or []
                alias_text = "、".join([str(a).strip() for a in aliases if str(a).strip()][:4])
                parts = []
                if identity:
                    parts.append(f"身份：{identity}")
                if appearance:
                    parts.append(f"外貌：{appearance}")
                if alias_text:
                    parts.append(f"别名：{alias_text}")
                line = f"- {name}{star_label}"
                if parts:
                    line += "（" + "；".join(parts) + "）"
                lines.append(line)
            if lines:
                context_items.append("角色设定（快照）：\n" + "\n".join(lines))

        if world:
            lines = []
            for item in world[:8]:
                if not isinstance(item, dict):
                    continue
                name = str(item.get("name") or "").strip()
                if not name:
                    continue
                stars = item.get("stars")
                star_label = f"★{stars}" if stars else ""
                category = str(item.get("category") or "").strip()
                immutable = item.get("immutable")
                rules = item.get("rules") or []
                rule_text = "；".join([str(r).strip() for r in rules if str(r).strip()][:3])
                parts = []
                if category:
                    parts.append(f"类别：{category}")
                if isinstance(immutable, bool):
                    parts.append("不可变" if immutable else "可变")
                if rule_text:
                    parts.append(f"规则：{rule_text}")
                line = f"- {name}{star_label}"
                if parts:
                    line += "（" + "；".join(parts) + "）"
                lines.append(line)
            if lines:
                context_items.append("世界设定（快照）：\n" + "\n".join(lines))

        if isinstance(style, dict):
            style_text = str(style.get("style") or "").strip()
            if style_text:
                context_items.append("文风卡（快照）：\n" + style_text[:800])

        return context_items
