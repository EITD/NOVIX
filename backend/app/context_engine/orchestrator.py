"""
Context Orchestrator / 上下文编排器
Unified orchestrator that manages all three types of context
统一管理三类上下文的编排器
"""

from typing import Dict, Any, Optional
from .models import (
    ContextItem, ContextPriority, ContextType, AssembledContext,
    HealthCheckResult, estimate_tokens
)
from .guiding_context import GuidingContextBuilder
from .informational_context import InformationalContextManager
from .actionable_context import ActionableContextManager
from .write_engine import ContextWriteEngine
from .select_engine import ContextSelectEngine
from .compress_engine import ContextCompressEngine
from .isolate_engine import ContextIsolateEngine
from .degradation_guard import ContextDegradationGuard


class ContextOrchestrator:
    """
    上下文编排器
    
    核心职责：在 Agent 执行任务的每一步，智能组装最优上下文组合
    Core responsibility: Assemble optimal context for each Agent step
    """
    
    def __init__(
        self,
        storage,
        llm_gateway=None,
        max_tokens: int = 16000
    ):
        """
        初始化编排器
        
        Args:
            storage: 存储实例
            llm_gateway: LLM 网关
            max_tokens: 最大 token 限制
        """
        self.storage = storage
        self.llm_gateway = llm_gateway
        self.max_tokens = max_tokens
        
        # 初始化各个组件
        self.write = ContextWriteEngine(storage)
        self.select = ContextSelectEngine()
        self.compress = ContextCompressEngine(llm_gateway)
        self.isolate = ContextIsolateEngine(self.write)
        self.guard = ContextDegradationGuard(llm_gateway)
    
    async def assemble_context(
        self,
        agent_name: str,
        task: Dict[str, Any],
        project_id: str,
        session_id: str
    ) -> AssembledContext:
        """
        为 Agent 的下一步推理组装最优上下文
        
        这是上下文工程的核心方法
        
        Args:
            agent_name: Agent 名称
            task: 任务描述
            project_id: 项目 ID
            session_id: 会话 ID
        
        Returns:
            组装完成的上下文
        """
        
        # ===== Step 1: 构建指导性上下文 (Guiding Context) =====
        guiding_builder = GuidingContextBuilder(agent_name)
        guiding_context = guiding_builder.build(
            task_type=task.get("type", ""),
            style_card=task.get("style_card"),
        )
        guiding_tokens = estimate_tokens(guiding_context)
        
        # ===== Step 2: 加载行动性上下文 (Actionable Context) =====
        actionable_manager = ActionableContextManager()
        
        # 加载该 Agent 的工具定义
        tools = self._get_agent_tools(agent_name)
        for tool in tools:
            actionable_manager.add_tool(tool)
        
        actionable_context = actionable_manager.get_context_string()
        actionable_tokens = estimate_tokens(actionable_context)
        
        # ===== Step 3: 计算信息性上下文的 Token 预算 =====
        # 总预算 - 指导性 - 行动性 - 输出预留
        info_budget = self.max_tokens - guiding_tokens - actionable_tokens - 2000
        
        # ===== Step 4: 智能选取信息性上下文 (Informational Context) =====
        info_manager = InformationalContextManager(token_budget=info_budget)
        
        # 4.1 确定性选取（必选项）
        deterministic_items = await self.select.deterministic_select(
            project_id, agent_name, self.storage
        )
        for item in deterministic_items:
            info_manager.add(item)
        
        # 4.2 检索式选取（相关项）
        query = self._build_query(task)
        if query:
            retrieved_items = await self.select.retrieval_select(
                project_id,
                query,
                item_types=["character", "world", "fact"],
                storage=self.storage,
                top_k=10
            )
            for item in retrieved_items:
                info_manager.add(item)
        
        # 4.3 选取最优组合
        selected_items = info_manager.select_optimal(query)
        
        # ===== Step 5: 上下文健康检查 =====
        total_info_tokens = sum(item.token_count for item in selected_items)
        health = await self.guard.health_check(
            context_items=selected_items,
            total_tokens=total_info_tokens,
            max_tokens=info_budget,
            current_task=query,
            established_facts=task.get("established_facts", [])
        )
        
        # ===== Step 6: 必要时压缩 =====
        if not health.healthy or total_info_tokens > info_budget:
            selected_items = await self.compress.auto_compact(
                selected_items, 
                info_budget
            )
        
        # ===== Step 7: 格式化信息性上下文 =====
        informational_context = info_manager.format_items(selected_items)
        
        # ===== Step 8: 组装最终上下文 =====
        assembled = AssembledContext(
            system=guiding_context,
            informational=informational_context,
            actionable=actionable_context,
            health=health,
            items=selected_items
        )
        
        return assembled
    
    def _get_agent_tools(self, agent_name: str) -> list:
        """获取 Agent 的工具列表"""
        from .models import ToolDefinition
        
        # 每个 Agent 的专属工具
        tools_map = {
            "archivist": [
                ToolDefinition(
                    name="search_characters",
                    description="按关键词搜索角色卡片",
                    parameters={
                        "type": "object",
                        "properties": {
                            "query": {"type": "string", "description": "搜索关键词"},
                            "limit": {"type": "integer", "description": "返回数量", "default": 5}
                        },
                        "required": ["query"]
                    }
                ),
                ToolDefinition(
                    name="verify_consistency",
                    description="验证内容与已确立事实的一致性",
                    parameters={
                        "type": "object",
                        "properties": {
                            "content": {"type": "string", "description": "要验证的内容"}
                        },
                        "required": ["content"]
                    }
                )
            ],
            "writer": [
                ToolDefinition(
                    name="count_words",
                    description="统计文本字数",
                    parameters={
                        "type": "object",
                        "properties": {
                            "text": {"type": "string", "description": "要统计的文本"}
                        },
                        "required": ["text"]
                    }
                ),
                ToolDefinition(
                    name="check_character_voice",
                    description="检查对话是否符合角色说话风格",
                    parameters={
                        "type": "object",
                        "properties": {
                            "character_name": {"type": "string"},
                            "dialogue": {"type": "string"}
                        },
                        "required": ["character_name", "dialogue"]
                    }
                )
            ]
        }
        
        return tools_map.get(agent_name, [])
    
    def _build_query(self, task: Dict[str, Any]) -> str:
        """构建检索查询"""
        query_parts = []
        
        if "chapter_goal" in task:
            query_parts.append(task["chapter_goal"])
        
        if "description" in task:
            query_parts.append(task["description"])
        
        if "character_names" in task:
            query_parts.append(" ".join(task["character_names"]))
        
        return " ".join(query_parts)
    
    async def run_agent_with_context(
        self,
        agent,
        task: Dict[str, Any],
        project_id: str,
        session_id: str
    ) -> Dict[str, Any]:
        """
        使用上下文编排运行 Agent
        
        Args:
            agent: Agent 实例
            task: 任务描述
            project_id: 项目 ID
            session_id: 会话 ID
        
        Returns:
            Agent 执行结果
        """
        # 组装上下文
        context = await self.assemble_context(
            agent_name=agent.name if hasattr(agent, 'name') else 'unknown',
            task=task,
            project_id=project_id,
            session_id=session_id
        )
        
        # 检查健康状态
        if not context.health.healthy:
            print(f"Context health issues: {context.health.issues}")
            # 可以选择中止或继续
        
        # 执行 Agent
        result = await agent.execute(task, context)
        
        # 持久化有价值的结果
        if result.get("should_persist"):
            await self.write.write_to_memory(
                project_id,
                result.get("memory_type", "chapter_summary"),
                result
            )
        
        return result
    
    def get_stats(self) -> Dict[str, Any]:
        """获取编排器统计信息"""
        return {
            "max_tokens": self.max_tokens,
            "components": {
                "write_engine": "active",
                "select_engine": "active",
                "compress_engine": "active",
                "isolate_engine": "active",
                "degradation_guard": "active"
            }
        }
