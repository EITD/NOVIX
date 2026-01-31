"""
Select Engine / 选取引擎
Implements the Select practice of context engineering
实现上下文工程的 Select 实践
"""

from typing import List, Optional, Dict, Any
import numpy as np
from .models import ContextItem, ContextPriority, ContextType


class ContextSelectEngine:
    """
    上下文选取引擎
    Dynamically selects the most relevant context for the current task
    """
    
    def __init__(self, embeddings_service=None):
        """
        初始化选取引擎
        
        Args:
            embeddings_service: 可选的 embedding 服务（用于语义搜索）
        """
        self.embeddings = embeddings_service
    
    # ========== 确定性选取 (Deterministic Select) ==========
    
    async def deterministic_select(
        self, 
        project_id: str, 
        agent_name: str,
        storage: Any
    ) -> List[ContextItem]:
        """
        确定性选取 - 根据预设规则加载
        
        类似 Claude Code 启动时固定加载 CLAUDE.md
        每个 Agent 有固定的必选上下文项
        
        Args:
            project_id: 项目 ID
            agent_name: Agent 名称
            storage: 存储实例
        
        Returns:
            必选的上下文项列表
        """
        items = []
        
        # 每个 Agent 始终加载的项
        always_load_map = {
            "archivist": ["style_card", "rules_card"],
            "writer": ["style_card", "rules_card", "scene_brief"],
            "reviewer": ["style_card", "scene_brief"],
            "editor": ["style_card", "review_result"]
        }
        
        item_types = always_load_map.get(agent_name, [])
        
        for item_type in item_types:
            item = await self._load_item(project_id, item_type, storage)
            if item:
                item.priority = ContextPriority.CRITICAL
                items.append(item)
        
        return items
    
    async def _load_item(
        self, 
        project_id: str, 
        item_type: str,
        storage: Any
    ) -> Optional[ContextItem]:
        """从存储加载单个上下文项"""
        try:
            if item_type == "style_card":
                card = await storage.get_style_card(project_id)
                if card:
                    return ContextItem(
                        id="style_card",
                        type=ContextType.STYLE_CARD,
                        content=self._format_card(card),
                        priority=ContextPriority.CRITICAL
                    )
            
            elif item_type == "rules_card":
                card = await storage.get_rules_card(project_id)
                if card:
                    return ContextItem(
                        id="rules_card",
                        type=ContextType.RULES_CARD,
                        content=self._format_card(card),
                        priority=ContextPriority.CRITICAL
                    )
            
            # 其他类型可以后续扩展
            
        except Exception as e:
            print(f"Error loading {item_type}: {e}")
        
        return None
    
    def _format_card(self, card: Dict[str, Any]) -> str:
        """格式化卡片为字符串"""
        if isinstance(card, dict):
            return "\n".join(f"{k}: {v}" for k, v in card.items() if v)
        return str(card)
    
    # ========== 检索式选取 (Retrieval-based Select) ==========
    
    async def retrieval_select(
        self,
        project_id: str,
        query: str,
        item_types: List[str],
        storage: Any,
        top_k: int = 5
    ) -> List[ContextItem]:
        """
        检索式选取 - 基于语义相似度
        
        核心 RAG 能力，为当前任务选取最相关的信息
        
        Args:
            project_id: 项目 ID
            query: 查询文本（如章节目标）
            item_types: 要检索的项目类型列表
            storage: 存储实例
            top_k: 返回前 k 个最相关的项
        
        Returns:
            按相关性排序的上下文项列表
        """
        all_candidates = []
        
        # 从存储中加载候选项
        for item_type in item_types:
            candidates = await self._get_candidates(project_id, item_type, storage)
            all_candidates.extend(candidates)
        
        if not all_candidates:
            return []
        
        # 如果没有 embedding 服务，使用简单的文本匹配
        if not self.embeddings:
            return self._simple_text_match(query, all_candidates, top_k)
        
        # 使用语义相似度计算
        query_embedding = await self.embeddings.encode(query)
        
        for item in all_candidates:
            item_embedding = await self.embeddings.encode(item.content)
            item.relevance_score = self._cosine_similarity(
                query_embedding, 
                item_embedding
            )
        
        # 排序并返回 top_k
        all_candidates.sort(key=lambda x: x.relevance_score, reverse=True)
        return all_candidates[:top_k]
    
    async def _get_candidates(
        self, 
        project_id: str, 
        item_type: str,
        storage: Any
    ) -> List[ContextItem]:
        """获取指定类型的所有候选项"""
        candidates = []
        
        try:
            if item_type == "character":
                names = await storage.list_character_cards(project_id)
                for name in names:
                    card = await storage.get_character_card(project_id, name)
                    if card:
                        candidates.append(ContextItem(
                            id=f"char_{name}",
                            type=ContextType.CHARACTER_CARD,
                            content=self._format_card(card),
                            priority=ContextPriority.MEDIUM
                        ))
            
            elif item_type == "world":
                names = await storage.list_world_cards(project_id)
                for name in names:
                    card = await storage.get_world_card(project_id, name)
                    if card:
                        candidates.append(ContextItem(
                            id=f"world_{name}",
                            type=ContextType.WORLD_CARD,
                            content=self._format_card(card),
                            priority=ContextPriority.MEDIUM
                        ))
            
            elif item_type == "fact":
                facts = await storage.get_all_facts(project_id)
                for i, fact in enumerate(facts):
                    candidates.append(ContextItem(
                        id=f"fact_{i}",
                        type=ContextType.FACT,
                        content=str(fact),
                        priority=ContextPriority.LOW
                    ))
        
        except Exception as e:
            print(f"Error getting candidates for {item_type}: {e}")
        
        return candidates
    
    def _simple_text_match(
        self, 
        query: str, 
        candidates: List[ContextItem], 
        top_k: int
    ) -> List[ContextItem]:
        """简单的文本匹配（无 embedding 时的后备方案）"""
        query_lower = query.lower()
        
        for item in candidates:
            # 简单的关键词匹配
            content_lower = item.content.lower()
            overlap = sum(1 for word in query_lower.split() if word in content_lower)
            item.relevance_score = overlap / max(len(query_lower.split()), 1)
        
        candidates.sort(key=lambda x: x.relevance_score, reverse=True)
        return candidates[:top_k]
    
    def _cosine_similarity(
        self, 
        vec1: np.ndarray, 
        vec2: np.ndarray
    ) -> float:
        """计算余弦相似度"""
        dot_product = np.dot(vec1, vec2)
        norm1 = np.linalg.norm(vec1)
        norm2 = np.linalg.norm(vec2)
        
        if norm1 == 0 or norm2 == 0:
            return 0.0
        
        return float(dot_product / (norm1 * norm2))
    
    # ========== 模型驱动选取 (Model-driven Select) ==========
    
    async def model_driven_select(
        self,
        llm_gateway,
        task_description: str,
        available_items: List[ContextItem],
        max_select: int = 5
    ) -> List[ContextItem]:
        """
        模型驱动选取 - 让 LLM 自己决定需要什么
        
        当候选项太多时，让模型选择最相关的
        
        Args:
            llm_gateway: LLM 网关
            task_description: 任务描述
            available_items: 可用的上下文项列表
            max_select: 最多选择数量
        
        Returns:
            LLM 选中的上下文项列表
        """
        if not available_items:
            return []
        
        # 构建选择 prompt
        items_list = "\n".join([
            f"{i+1}. [{item.type.value}] {item.id}: {item.content[:100]}..."
            for i, item in enumerate(available_items)
        ])
        
        prompt = f"""任务描述：{task_description}

以下是可用的上下文项，请选择与任务最相关的项目编号（最多 {max_select} 个），用逗号分隔：

{items_list}

只输出编号，例如：1, 3, 5
"""
        
        try:
            response = await llm_gateway.chat([
                {"role": "user", "content": prompt}
            ])
            
            selected_indices = self._parse_indices(response["content"])
            
            return [
                available_items[i] 
                for i in selected_indices 
                if 0 <= i < len(available_items)
            ]
        
        except Exception as e:
            print(f"Model-driven select error: {e}")
            # 后备：返回前 max_select 个
            return available_items[:max_select]
    
    def _parse_indices(self, text: str) -> List[int]:
        """解析 LLM 返回的编号列表"""
        import re
        # 提取所有数字
        numbers = re.findall(r'\d+', text)
        # 转换为 0-based index
        return [int(n) - 1 for n in numbers if n.isdigit()]
