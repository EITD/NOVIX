"""
Write Engine / 写入引擎
Implements the Write practice of context engineering
实现上下文工程的 Write 实践
"""

from typing import Any, Dict, Optional
import yaml
import os


class ContextWriteEngine:
    """
    上下文写入引擎
    Responsible for persisting valuable context across sessions
    """
    
    def __init__(self, storage):
        """
        初始化写入引擎
        
        Args:
            storage: Storage instance (CardStorage/CanonStorage/DraftStorage)
        """
        self.storage = storage
    
    # ========== 会话内写入 (Scratchpad) ==========
    # 注：Scratchpad 功能已弃用，改用 Agent 内部状态管理

    # ========== 持久化写入 (Memory) ==========
    
    async def write_to_memory(
        self,
        project_id: str,
        memory_type: str,
        content: Dict[str, Any]
    ):
        """
        写入长期记忆

        用途：章节摘要、已确认事实
        生命周期：跨会话持久化

        Args:
            project_id: 项目 ID
            memory_type: 记忆类型 ("chapter_summary", "confirmed_fact")
            content: 内容字典
        """
        if memory_type == "chapter_summary":
            await self._write_chapter_summary(project_id, content)
        elif memory_type == "confirmed_fact":
            await self._write_confirmed_fact(project_id, content)
    
    async def _write_chapter_summary(
        self, 
        project_id: str, 
        summary: Dict[str, Any]
    ):
        """
        章节摘要写入 - 关键的压缩持久化
        
        每章完成后，提取核心信息写入，后续章节无需加载全文
        """
        # 压缩摘要：只保留核心信息
        compressed_summary = {
            "chapter": summary["chapter"],
            "title": summary.get("title", ""),
            "brief": summary.get("brief", "")[:500],  # 最多500字
            "key_events": summary.get("key_events", [])[:5],  # 最多5个关键事件
            "character_changes": summary.get("character_changes", {}),
            "new_facts": summary.get("new_facts", [])[:10]  # 最多10个新事实
        }
        
        # 保存到 draft storage
        if hasattr(self.storage, 'save_chapter_summary'):
            await self.storage.save_chapter_summary(project_id, compressed_summary)

    async def _write_confirmed_fact(
        self, 
        project_id: str, 
        fact: Dict[str, Any]
    ):
        """写入已确认事实"""
        # 添加到canon存储
        if hasattr(self.storage, 'add_fact'):
            await self.storage.add_fact(project_id, fact)
    
    # ========== 文件系统写入 (Isolate 子 Agent 输出) ==========
    
    async def write_subagent_output(
        self, 
        session_id: str, 
        agent_name: str, 
        output: Dict[str, Any]
    ) -> Dict[str, str]:
        """
        子 Agent 输出写入文件系统
        
        参考 Anthropic: "Subagent output to filesystem to minimize game of telephone"
        避免在上下文中层层传递完整输出
        
        Args:
            session_id: 会话 ID
            agent_name: Agent 名称
            output: 完整输出
        
        Returns:
            包含文件引用和摘要的字典
        """
        # 确保sessions目录存在
        sessions_dir = f"sessions/{session_id}"
        os.makedirs(sessions_dir, exist_ok=True)
        
        # 写入文件
        file_path = f"{sessions_dir}/{agent_name}_output.yaml"
        with open(file_path, 'w', encoding='utf-8') as f:
            yaml.dump(output, f, allow_unicode=True)
        
        # 返回引用而非完整内容
        return {
            "ref": file_path,
            "summary": str(output.get("summary", ""))[:500]
        }
    
    async def read_subagent_output(
        self, 
        session_id: str, 
        agent_name: str
    ) -> Optional[Dict[str, Any]]:
        """读取子 Agent 的完整输出"""
        file_path = f"sessions/{session_id}/{agent_name}_output.yaml"
        
        if not os.path.exists(file_path):
            return None
        
        with open(file_path, 'r', encoding='utf-8') as f:
            return yaml.safe_load(f)
