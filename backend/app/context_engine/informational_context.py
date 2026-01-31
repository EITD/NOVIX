"""
Informational Context Manager / 信息性上下文管理器
Manages informational context (facts, knowledge, data)
管理信息性上下文（事实、知识、数据）
"""

from typing import List, Optional
from .models import ContextItem, ContextPriority, ContextType, estimate_tokens


class InformationalContextManager:
    """
    信息性上下文管理器
    Manages informational context items with priority and budget constraints
    """
    
    def __init__(self, token_budget: int = 8000):
        """
        初始化管理器
        
        Args:
            token_budget: Token 预算限制
        """
        self.token_budget = token_budget
        self.items: List[ContextItem] = []
    
    def add(self, item: ContextItem):
        """添加上下文项"""
        self.items.append(item)
    
    def add_from_dict(
        self,
        id: str,
        type: ContextType,
        content: str,
        priority: ContextPriority = ContextPriority.MEDIUM,
        relevance_score: float = 1.0,
        metadata: dict = None
    ):
        """从字典参数添加上下文项"""
        item = ContextItem(
            id=id,
            type=type,
            content=content,
            priority=priority,
            relevance_score=relevance_score,
            metadata=metadata or {}
        )
        self.add(item)
    
    def clear(self):
        """清空所有上下文项"""
        self.items = []
    
    def select_optimal(self, query: Optional[str] = None) -> List[ContextItem]:
        """
        智能选取最优上下文组合
        
        策略：
        1. CRITICAL 优先级必须包含
        2. 按 priority 和 relevance_score 排序其余项
        3. 贪心填充直到 token_budget
        
        Args:
            query: 可选的查询文本，用于调整相关性
        
        Returns:
            选中的上下文项列表
        """
        selected = []
        used_tokens = 0
        
        # Step 1: 必选项（CRITICAL 优先级）
        critical = [i for i in self.items if i.priority == ContextPriority.CRITICAL]
        for item in critical:
            selected.append(item)
            used_tokens += item.token_count
        
        # Step 2: 剩余项按优先级和相关性排序
        remaining = [i for i in self.items if i.priority != ContextPriority.CRITICAL]
        remaining.sort(key=lambda x: (x.priority.value, -x.relevance_score))
        
        # Step 3: 贪心填充
        for item in remaining:
            if used_tokens + item.token_count <= self.token_budget:
                selected.append(item)
                used_tokens += item.token_count
            elif item.priority == ContextPriority.HIGH:
                # 高优先级尝试压缩后加入
                compressed = item.compressed(0.5)
                if used_tokens + compressed.token_count <= self.token_budget:
                    selected.append(compressed)
                    used_tokens += compressed.token_count
        
        return selected
    
    def get_by_type(self, type: ContextType) -> List[ContextItem]:
        """按类型获取上下文项"""
        return [item for item in self.items if item.type == type]
    
    def get_by_priority(self, priority: ContextPriority) -> List[ContextItem]:
        """按优先级获取上下文项"""
        return [item for item in self.items if item.priority == priority]
    
    def total_tokens(self) -> int:
        """计算当前所有项的总 Token 数"""
        return sum(item.token_count for item in self.items)
    
    def format_items(self, items: List[ContextItem]) -> str:
        """
        将上下文项格式化为字符串
        
        Args:
            items: 要格式化的上下文项列表
        
        Returns:
            格式化后的字符串
        """
        if not items:
            return ""
        
        sections = {}
        for item in items:
            section_name = self._get_section_name(item.type)
            if section_name not in sections:
                sections[section_name] = []
            sections[section_name].append(item)
        
        output_parts = []
        for section_name, section_items in sections.items():
            output_parts.append(f"\n### {section_name}\n")
            for item in section_items:
                output_parts.append(self._format_single_item(item))
        
        return "\n".join(output_parts)
    
    def _get_section_name(self, type: ContextType) -> str:
        """获取上下文类型对应的章节名"""
        section_map = {
            ContextType.CHARACTER_CARD: "角色设定",
            ContextType.WORLD_CARD: "世界观设定",
            ContextType.FACT: "已确立事实",
            ContextType.TIMELINE_EVENT: "时间线",
            ContextType.CHAPTER_SUMMARY: "前文摘要",
            ContextType.SCENE_BRIEF: "场景简报",
            ContextType.DRAFT: "草稿"
        }
        return section_map.get(type, type.value)
    
    def _format_single_item(self, item: ContextItem) -> str:
        """格式化单个上下文项"""
        if item.type == ContextType.CHARACTER_CARD:
            return f"\n**{item.id}**\n{item.content}\n"
        elif item.type == ContextType.FACT:
            return f"- {item.content}"
        elif item.type == ContextType.TIMELINE_EVENT:
            return f"- {item.id}: {item.content}"
        else:
            return f"\n{item.content}\n"
    
    def get_stats(self) -> dict:
        """获取统计信息"""
        return {
            "total_items": len(self.items),
            "total_tokens": self.total_tokens(),
            "token_budget": self.token_budget,
            "usage_ratio": self.total_tokens() / self.token_budget if self.token_budget > 0 else 0,
            "by_priority": {
                "critical": len(self.get_by_priority(ContextPriority.CRITICAL)),
                "high": len(self.get_by_priority(ContextPriority.HIGH)),
                "medium": len(self.get_by_priority(ContextPriority.MEDIUM)),
                "low": len(self.get_by_priority(ContextPriority.LOW))
            },
            "by_type": {
                type.value: len(self.get_by_type(type))
                for type in ContextType
                if len(self.get_by_type(type)) > 0
            }
        }
