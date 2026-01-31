"""
Guiding context builder.
"""

from typing import Optional, Dict, Any


class GuidingContextBuilder:
    """Builds guiding context for agents."""

    def __init__(self, agent_name: str):
        self.agent_name = agent_name

    def build(
        self,
        task_type: str,
        style_card: Optional[Dict[str, Any]] = None,
    ) -> str:
        components = []

        identity = self._get_agent_identity()
        components.append(identity)

        task_instruction = self._get_task_instruction(task_type)
        if task_instruction:
            components.append(f"\n## 任务指令\n{task_instruction}")

        output_schema = self._get_output_schema(task_type)
        if output_schema:
            components.append(f"\n## 输出格式\n{output_schema}")

        if style_card and task_type in ["write", "edit"]:
            style_guidance = self._format_style_card(style_card)
            if style_guidance:
                components.append(f"\n## 文风规范\n{style_guidance}")

        return "\n".join(components)

    def _get_agent_identity(self) -> str:
        identities = {
            "archivist": "你是 Archivist（资料管理员）。",
            "writer": "你是 Writer（主笔）。",
            "editor": "你是 Editor（编辑）。",
        }
        return identities.get(self.agent_name, f"你是 {self.agent_name} Agent。")

    def _get_task_instruction(self, task_type: str) -> str:
        instructions = {
            "generate_brief": "生成场景简报并标注关键约束。",
            "write": "根据场景简报撰写正文。",
            "edit": "根据反馈进行最小改动的润色。",
        }
        return instructions.get(task_type, "")

    def _get_output_schema(self, task_type: str) -> str:
        schemas = {
            "generate_brief": "输出 YAML 格式的 scene_brief。",
            "write": "直接输出正文，不要附加解释。",
            "edit": "输出修改后的正文与简要说明。",
        }
        return schemas.get(task_type, "")

    def _format_style_card(self, style_card: Dict[str, Any]) -> str:
        if isinstance(style_card, dict):
            style = str(style_card.get("style", "")).strip()
            if style:
                return style
        return str(style_card).strip() if style_card else ""
