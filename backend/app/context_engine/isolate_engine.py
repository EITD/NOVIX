"""
Isolate Engine / 隔离引擎
Implements the Isolate practice of context engineering
实现上下文工程的 Isolate 实践
"""

from typing import Dict, Any
from .write_engine import ContextWriteEngine
from .models import ContextItem, ContextPriority
from .informational_context import InformationalContextManager


class ContextIsolateEngine:
    """
    上下文隔离引擎
    Isolates sub-agent execution to prevent context bloat
    """
    
    def __init__(self, write_engine: ContextWriteEngine):
        """
        初始化隔离引擎
        
        Args:
            write_engine: 写入引擎实例
        """
        self.write_engine = write_engine
    
    async def run_isolated_agent(
        self,
        agent,
        task: Dict[str, Any],
        parent_context: Dict[str, Any],
        session_id: str
    ) -> Dict[str, Any]:
        """
        隔离执行 Agent
        
        核心思想：
        - 子 Agent 在独立上下文中工作
        - 只返回压缩后的核心结果给父 Agent
        - 完整输出写入文件系统
        - 避免"电话游戏"式的信息传递失真
        
        Args:
            agent: Agent 实例
            task: 任务描述
            parent_context: 父 Agent 的上下文
            session_id: 会话 ID
        
        Returns:
            压缩后的结果摘要
        """
        
        # Step 1: 为子 Agent 构建精简的输入上下文
        isolated_context = self._build_minimal_context(task, parent_context)
        
        # Step 2: 子 Agent 独立执行
        result = await agent.execute(task, isolated_context)
        
        # Step 3: 完整输出写入文件系统（非上下文窗口）
        await self.write_engine.write_subagent_output(
            session_id, 
            agent.name, 
            result
        )
        
        # Step 4: 只返回压缩后的摘要给父 Agent
        return self._extract_handoff_summary(result)
    
    def _build_minimal_context(
        self, 
        task: Dict[str, Any], 
        parent_context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        构建最小化的子 Agent 上下文
        
        只传递完成当前子任务必需的信息
        
        原则：
        - 不传递父 Agent 的完整上下文
        - 只选择与子任务直接相关的部分
        - 减少上下文窗口占用
        
        Args:
            task: 子任务描述
            parent_context: 父 Agent 的完整上下文
        
        Returns:
            精简的子 Agent 上下文
        """
        minimal = {}
        
        # 必传：任务本身
        minimal["task"] = task
        
        # 必传：文风卡（如果存在）
        if "style_card" in parent_context:
            minimal["style_card"] = parent_context["style_card"]
        
        # 按需：只传递当前任务涉及的角色
        if "character_names" in task and "character_cards" in parent_context:
            minimal["relevant_characters"] = self._filter_relevant_characters(
                task["character_names"],
                parent_context["character_cards"]
            )
        
        # 按需：当前章节的核心信息
        if "chapter_goal" in task:
            minimal["chapter_goal"] = task["chapter_goal"]
        
        # 不传递：完整的前文摘要、全部角色卡、全部世界观等
        # 这些由子 Agent 根据需要主动检索
        
        return minimal
    
    def _filter_relevant_characters(
        self,
        character_names: list,
        all_characters: list
    ) -> list:
        """筛选相关角色"""
        if not character_names:
            return []
        
        relevant = []
        for char in all_characters:
            if isinstance(char, dict) and char.get("name") in character_names:
                relevant.append(char)
        
        return relevant
    
    def _extract_handoff_summary(self, result: Dict[str, Any]) -> Dict[str, Any]:
        """
        提取交接摘要
        
        子 Agent 返回给父 Agent 的精简信息
        
        "搜索即压缩，从庞大的语料库中提取洞见"
        
        Args:
            result: 子 Agent 的完整结果
        
        Returns:
            压缩后的摘要
        """
        summary = {
            "status": result.get("status", "completed"),
            "agent": result.get("agent_name", "unknown")
        }
        
        # 核心摘要（最多500字）
        if "summary" in result:
            summary["summary"] = str(result["summary"])[:500]
        
        # 关键输出（最多5个）
        if "key_outputs" in result:
            summary["key_outputs"] = result["key_outputs"][:5]
        
        # 需要注意的事项
        if "requires_attention" in result:
            summary["requires_attention"] = result["requires_attention"]
        
        # 文件引用（完整输出的位置）
        if "file_ref" in result:
            summary["file_ref"] = result["file_ref"]
        
        # 如果是场景简报，包含简报本身
        if "scene_brief" in result:
            summary["scene_brief"] = result["scene_brief"]
        
        # 如果是审稿结果，包含核心反馈
        if "review" in result:
            review = result["review"]
            summary["review_summary"] = {
                "overall_score": review.get("overall_score"),
                "recommendation": review.get("recommendation"),
                "issue_count": len(review.get("issues", []))
            }
        
        return summary
    
    async def run_parallel_isolated_agents(
        self,
        agents: list,
        tasks: list,
        parent_context: Dict[str, Any],
        session_id: str
    ) -> list:
        """
        并行运行多个隔离的 Agent
        
        适用于可以并行处理的子任务
        
        Args:
            agents: Agent 实例列表
            tasks: 任务列表
            parent_context: 父上下文
            session_id: 会话 ID
        
        Returns:
            所有 Agent 的摘要列表
        """
        import asyncio
        
        # 创建并行任务
        coroutines = [
            self.run_isolated_agent(agent, task, parent_context, session_id)
            for agent, task in zip(agents, tasks)
        ]
        
        # 并行执行
        results = await asyncio.gather(*coroutines, return_exceptions=True)
        
        # 处理异常
        summaries = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                summaries.append({
                    "status": "error",
                    "agent": agents[i].name if hasattr(agents[i], 'name') else f"agent_{i}",
                    "error": str(result)
                })
            else:
                summaries.append(result)
        
        return summaries
