"""
Guiding Context Builder / 指导性上下文构建器
Builds guiding context (system prompts, task instructions, output schemas)
构建指导性上下文（系统提示、任务指令、输出格式）
"""

from typing import Optional, Dict, Any


class GuidingContextBuilder:
    """
    指导性上下文构建器
    Builds guiding context that tells the Agent "who you are" and "what to do"
    """
    
    def __init__(self, agent_name: str):
        self.agent_name = agent_name
    
    def build(
        self, 
        task_type: str,
        style_card: Optional[Dict[str, Any]] = None,
        rules_card: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        构建完整的指导性上下文
        Build complete guiding context
        
        Args:
            task_type: 任务类型 (e.g., "write", "review", "edit")
            style_card: 文风卡片
            rules_card: 规则卡片
        
        Returns:
            完整的系统提示词
        """
        components = []
        
        # 1. Agent 身份定义
        identity = self._get_agent_identity()
        components.append(identity)
        
        # 2. 任务指令
        task_instruction = self._get_task_instruction(task_type)
        if task_instruction:
            components.append(f"\n## 任务指令\n{task_instruction}")
        
        # 3. 输出格式约束
        output_schema = self._get_output_schema(task_type)
        if output_schema:
            components.append(f"\n## 输出格式\n{output_schema}")
        
        # 4. 文风规范（仅写作相关任务）
        if style_card and task_type in ["write", "edit", "review"]:
            style_guidance = self._format_style_card(style_card)
            if style_guidance:
                components.append(f"\n## 文风规范\n{style_guidance}")
        
        # 5. 规则约束
        if rules_card:
            rules = self._format_rules_card(rules_card)
            if rules:
                components.append(f"\n## 写作规则\n{rules}")
        
        return "\n".join(components)
    
    def _get_agent_identity(self) -> str:
        """获取 Agent 身份定义"""
        identities = {
            "archivist": """你是 **Archivist**（资料管理员），专业的资料检索与场景规划专家。

**核心职责**：
- 分析章节目标，识别所需的角色、设定、事实
- 从知识库中检索最相关的上下文
- 生成精准、完整的场景简报（Scene Brief）
- 验证信息一致性，避免矛盾

**工作原则**：
- 优先级：关键信息 > 补充细节
- 相关性：与当前章节强相关 > 背景信息
- 完整性：必须包含所有关键角色和设定
- 一致性：对比已确立事实，标记潜在冲突""",
            
            "writer": """你是 **Writer**（撰稿人），专业的创意写作专家。

**核心职责**：
- 基于场景简报生成高质量初稿
- 严格遵循角色性格、世界观设定
- 保持文风一致性
- 达到目标字数要求

**工作原则**：
- 角色真实感：对话和行为必须符合角色设定
- 细节丰富：使用感官细节增强沉浸感
- 节奏把控：根据场景类型调整叙述节奏
- 连贯性：与前文自然衔接""",
            
            "reviewer": """你是 **Reviewer**（审稿人），严格的质量把关专家。

**核心职责**：
- 从多维度审核草稿质量
- 识别一致性问题、逻辑漏洞、文风偏差
- 提供可操作的修改建议
- 评估整体完成度

**审稿维度**：
1. **情节一致性**：是否与场景简报、前文一致？
2. **角色真实性**：对话、行为是否符合人设？
3. **节奏把控**：叙述节奏是否恰当？
4. **文风契合**：是否符合文风规范？
5. **世界观符合**：是否违背设定？

**输出要求**：具体指出问题位置，提供修改方向""",
            
            "editor": """你是 **Editor**（编辑），精准的修改润色专家。

**核心职责**：
- 根据审稿意见进行精准修改
- 保持原文风格和核心内容
- 最小化改动、最大化效果
- 生成清晰的修改对比

**修改原则**：
- 精准定位：只修改有问题的部分
- 保留优点：不改动质量好的段落
- 风格统一：修改后仍符合原文风格
- 可追溯性：记录所有修改点"""
        }
        
        return identities.get(self.agent_name, f"你是 {self.agent_name} Agent。")
    
    def _get_task_instruction(self, task_type: str) -> str:
        """获取任务指令"""
        instructions = {
            "generate_brief": """分析用户提供的章节目标和涉及角色，执行以下步骤：

1. **需求分析**：识别关键角色、关键设定、关键事实
2. **上下文检索**：使用工具检索相关的角色卡、世界观、时间线
3. **简报生成**：整合信息，生成场景简报
4. **一致性验证**：对比已确立事实，标记冲突""",
            
            "write": """基于场景简报生成初稿，遵循以下步骤：

1. **理解场景简报**：明确场景目标、角色、关键事件
2. **规划结构**：确定开头、发展、高潮、结尾
3. **分段生成**：逐段生成，每段后验证角色一致性
4. **字数控制**：达到目标字数，使用工具 `count_words` 检查""",
            
            "review": """审核初稿，从多个维度检查质量：

1. **情节一致性检查**：对比场景简报和前文
2. **角色真实性检查**：验证对话和行为
3. **文风检查**：对比文风规范
4. **问题标注**：具体指出问题位置和建议""",
            
            "edit": """根据审稿意见修改初稿：

1. **分析审稿意见**：理解每个问题点
2. **生成修改计划**：确定 replace/insert/delete 操作
3. **逐条应用修改**：精准修改问题部分
4. **验证修改效果**：确保修改后仍一致"""
        }
        
        return instructions.get(task_type, "")
    
    def _get_output_schema(self, task_type: str) -> str:
        """获取输出格式约束"""
        schemas = {
            "generate_brief": """以 YAML 格式输出场景简报：

```yaml
scene_brief:
  chapter: ch01
  title: "章节标题"
  goal: "章节核心目标"
  characters:
    - name: "角色名"
      role: "在本章中的作用"
  key_events:
    - "关键事件1"
    - "关键事件2"
  setting: "场景设定"
  mood: "氛围/基调"
```""",
            
            "write": """直接输出草稿正文，无需其他格式。

要求：
- 使用 Markdown 格式
- 段落之间空一行
- 对话使用引号""",
            
            "review": """以 YAML 格式输出审稿结果：

```yaml
review:
  overall_score: 0.85  # 0-1，整体评分
  issues:
    - dimension: "角色真实性"
      severity: "high"  # high/medium/low
      location: "第3段，张三的对话"
      problem: "张三说话过于正式，不符合设定"
      suggestion: "改为更口语化的表达"
  strengths:
    - "节奏把控很好"
  recommendation: "建议修改"  # 或 "通过"
```""",
            
            "edit": """输出修订稿正文 + 修改说明：

```yaml
revised_draft: |
  修订后的完整正文...
  
edit_log:
  - type: replace
    location: "第3段"
    original: "原文内容"
    revised: "修改后内容"
    reason: "根据审稿意见修改角色对话"
```"""
        }
        
        return schemas.get(task_type, "")
    
    def _format_style_card(self, style_card: Dict[str, Any]) -> str:
        """格式化文风卡片"""
        parts = []
        
        if "narrative_distance" in style_card:
            parts.append(f"**叙述距离**：{style_card['narrative_distance']}")
        
        if "pacing" in style_card:
            parts.append(f"**节奏**：{style_card['pacing']}")
        
        if "sentence_structure" in style_card:
            parts.append(f"**句式**：{style_card['sentence_structure']}")
        
        if "vocabulary_constraints" in style_card:
            parts.append(f"**用词限制**：{style_card['vocabulary_constraints']}")
        
        if "example_passages" in style_card:
            parts.append(f"\n**参考示例**：\n{style_card['example_passages']}")
        
        return "\n".join(parts) if parts else ""
    
    def _format_rules_card(self, rules_card: Dict[str, Any]) -> str:
        """格式化规则卡片"""
        if isinstance(rules_card, dict):
            rules = rules_card.get("rules", [])
            if isinstance(rules, list):
                return "\n".join(f"- {rule}" for rule in rules)
            elif isinstance(rules, str):
                return rules
        
        return str(rules_card) if rules_card else ""
