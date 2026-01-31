"""
Compress Engine / 压缩引擎
Implements the Compress practice of context engineering
实现上下文工程的 Compress 实践
"""

from typing import List, Dict, Any
from .models import ContextItem, ContextPriority, estimate_tokens


class ContextCompressEngine:
    """
    上下文压缩引擎
    Compresses context to fit within token budget
    """
    
    def __init__(self, llm_gateway=None):
        """
        初始化压缩引擎
        
        Args:
            llm_gateway: LLM 网关（用于智能压缩）
        """
        self.llm = llm_gateway
    
    # ========== 规则压缩 (Rule-based Compression) ==========
    
    def rule_based_compress(self, text: str, ratio: float = 0.5) -> str:
        """
        规则压缩 - 快速、低成本
        
        适用于结构化内容的简单压缩
        
        Args:
            text: 要压缩的文本
            ratio: 保留比例 (0-1)
        
        Returns:
            压缩后的文本
        """
        if ratio >= 1.0:
            return text
        
        lines = text.split('\n')
        
        # 策略1: 移除空行
        lines = [l for l in lines if l.strip()]
        
        # 策略2: 截断过长的行
        max_line_length = 200
        lines = [
            l[:max_line_length] + "..." if len(l) > max_line_length else l 
            for l in lines
        ]
        
        # 策略3: 保留前 N 行（按比例）
        keep_count = max(int(len(lines) * ratio), 3)
        lines = lines[:keep_count]
        
        return '\n'.join(lines)
    
    # ========== LLM 压缩 (LLM-based Compression) ==========
    
    async def llm_compress(
        self,
        text: str,
        target_tokens: int,
        preserve_type: str = "facts"
    ) -> str:
        """
        LLM 压缩 - 智能保留核心信息
        
        参考 Cognition AI 的压缩 LLM 思路
        
        Args:
            text: 要压缩的文本
            target_tokens: 目标 token 数
            preserve_type: 保留类型 ("facts", "narrative", "mixed")
        
        Returns:
            压缩后的文本
        """
        if not self.llm:
            # 后备：使用规则压缩
            current_tokens = estimate_tokens(text)
            ratio = target_tokens / max(current_tokens, 1)
            return self.rule_based_compress(text, min(ratio, 1.0))
        
        prompts = {
            "facts": """请将以下内容压缩为关键事实列表，保留所有重要信息，目标长度约 {target_tokens} 字：

{text}

只输出压缩后的内容：""",
            
            "narrative": """请将以下叙述内容精简，保留核心情节和关键细节，目标长度约 {target_tokens} 字：

{text}

只输出精简后的内容：""",
            
            "mixed": """请压缩以下内容，保留最重要的信息点，目标长度约 {target_tokens} 字：

{text}

只输出压缩后的内容："""
        }
        
        prompt_template = prompts.get(preserve_type, prompts["mixed"])
        prompt = prompt_template.format(text=text, target_tokens=target_tokens)
        
        try:
            response = await self.llm.chat([
                {"role": "user", "content": prompt}
            ], temperature=0.3)
            
            return response["content"]
        
        except Exception as e:
            print(f"LLM compress error: {e}")
            # 后备：规则压缩
            current_tokens = estimate_tokens(text)
            ratio = target_tokens / max(current_tokens, 1)
            return self.rule_based_compress(text, min(ratio, 1.0))
    
    # ========== Auto-compact 自动压缩 ==========
    
    async def auto_compact(
        self,
        context_items: List[ContextItem],
        token_budget: int
    ) -> List[ContextItem]:
        """
        自动压缩 - 类似 Claude Code 的 auto-compact
        
        当上下文接近溢出时自动触发
        
        Args:
            context_items: 上下文项列表
            token_budget: Token 预算
        
        Returns:
            压缩后的上下文项列表
        """
        current_tokens = sum(item.token_count for item in context_items)
        
        if current_tokens <= token_budget:
            return context_items
        
        overflow_ratio = current_tokens / token_budget
        
        # 按优先级从低到高处理
        compacted = []
        
        for item in sorted(context_items, key=lambda x: x.priority.value, reverse=True):
            if item.priority == ContextPriority.CRITICAL:
                # 关键项不压缩
                compacted.append(item)
            
            elif item.priority == ContextPriority.LOW:
                # 低优先级：溢出严重时直接移除
                if overflow_ratio > 1.5:
                    continue  # 移除
                else:
                    compacted.append(item.compressed(0.3))
            
            elif item.priority == ContextPriority.MEDIUM:
                # 中等优先级：按比例压缩
                compression_ratio = max(0.4, 1 / overflow_ratio)
                compacted.append(item.compressed(compression_ratio))
            
            else:  # HIGH
                # 高优先级：轻度压缩
                compression_ratio = max(0.7, 1 / overflow_ratio)
                compacted.append(item.compressed(compression_ratio))
        
        return compacted
    
    # ========== 智能合并压缩 ==========
    
    async def compress_and_merge(
        self,
        items: List[ContextItem],
        target_tokens: int,
        merge_same_type: bool = True
    ) -> List[ContextItem]:
        """
        智能合并压缩
        
        同类型的上下文项可以合并后一起压缩
        
        Args:
            items: 上下文项列表
            target_tokens: 目标 token 数
            merge_same_type: 是否合并同类型项
        
        Returns:
            压缩并可能合并后的上下文项列表
        """
        if not merge_same_type:
            return await self.auto_compact(items, target_tokens)
        
        # 按类型分组
        groups = {}
        for item in items:
            if item.type not in groups:
                groups[item.type] = []
            groups[item.type].append(item)
        
        compressed_items = []
        
        for item_type, group_items in groups.items():
            if len(group_items) == 1:
                compressed_items.append(group_items[0])
            else:
                # 多个同类型项：合并后压缩
                merged_content = "\n\n".join(item.content for item in group_items)
                merged_tokens = sum(item.token_count for item in group_items)
                
                # 如果合并后超过目标，则压缩
                if merged_tokens > target_tokens / len(groups):
                    compressed_content = await self.llm_compress(
                        merged_content,
                        int(target_tokens / len(groups)),
                        preserve_type="mixed"
                    )
                else:
                    compressed_content = merged_content
                
                compressed_items.append(ContextItem(
                    id=f"{item_type}_merged",
                    type=item_type,
                    content=compressed_content,
                    priority=max(i.priority for i in group_items),
                    metadata={"merged_from": [i.id for i in group_items]}
                ))
        
        return compressed_items
