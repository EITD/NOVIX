"""
Degradation Guard / 上下文退化防护系统
Detects and prevents four types of context degradation
检测并防止四类上下文退化
"""

from typing import List, Tuple, Dict, Any, Optional
from .models import ContextItem, DegradationType, HealthCheckResult, estimate_tokens


class ContextDegradationGuard:
    """
    上下文退化防护系统
    Monitors context health and prevents degradation
    """
    
    def __init__(self, llm_gateway=None):
        """
        初始化防护系统
        
        Args:
            llm_gateway: LLM 网关（用于智能检测）
        """
        self.llm = llm_gateway
        self.warning_threshold = 0.7  # Token 使用率警告阈值
        self.critical_threshold = 0.9  # 临界阈值
    
    # ========== 污染检测 (Poisoning Detection) ==========
    
    async def detect_poisoning(
        self,
        new_content: str,
        established_facts: List[str]
    ) -> Tuple[bool, List[str]]:
        """
        检测内容是否与已确立事实矛盾（可能是幻觉）
        
        Args:
            new_content: 新生成的内容
            established_facts: 已确立的事实列表
        
        Returns:
            (是否存在矛盾, 矛盾点列表)
        """
        if not established_facts:
            return False, []
        
        if not self.llm:
            # 无 LLM：简单的关键词检查
            return self._simple_contradiction_check(new_content, established_facts)
        
        # 使用 LLM 进行深度检测
        prompt = f"""分析以下新内容是否与已确立的事实矛盾：

新内容：
{new_content}

已确立事实：
{chr(10).join(f'- {f}' for f in established_facts)}

如果发现矛盾，列出矛盾点。如果没有矛盾，回复 "无矛盾"。
"""
        
        try:
            response = await self.llm.chat([
                {"role": "user", "content": prompt}
            ], temperature=0.2)
            
            if "无矛盾" in response["content"]:
                return False, []
            else:
                conflicts = [
                    line.strip() 
                    for line in response["content"].split("\n") 
                    if line.strip()
                ]
                return True, conflicts
        
        except Exception as e:
            print(f"Poisoning detection error: {e}")
            return False, []
    
    def _simple_contradiction_check(
        self,
        new_content: str,
        established_facts: List[str]
    ) -> Tuple[bool, List[str]]:
        """简单的矛盾检查（后备方案）"""
        # 简单的否定词检测
        negations = ["不是", "不再", "从未", "绝不", "并非"]
        
        for fact in established_facts:
            for negation in negations:
                if negation in new_content and fact in new_content:
                    return True, [f"可能矛盾: {fact}"]
        
        return False, []
    
    # ========== 干扰检测 (Distraction Detection) ==========
    
    def detect_distraction(
        self,
        total_tokens: int,
        max_tokens: int
    ) -> Tuple[bool, str]:
        """
        检测上下文是否接近溢出（可能导致模型降智）
        
        Args:
            total_tokens: 当前总 token 数
            max_tokens: 最大 token 限制
        
        Returns:
            (是否存在干扰风险, 状态消息)
        """
        usage_ratio = total_tokens / max(max_tokens, 1)
        
        if usage_ratio >= self.critical_threshold:
            return True, f"CRITICAL: 上下文使用率 {usage_ratio:.1%}，必须立即压缩"
        elif usage_ratio >= self.warning_threshold:
            return True, f"WARNING: 上下文使用率 {usage_ratio:.1%}，建议压缩"
        else:
            return False, f"OK: 上下文使用率 {usage_ratio:.1%}"
    
    # ========== 混淆检测 (Confusion Detection) ==========
    
    async def detect_confusion(
        self,
        context_items: List[ContextItem],
        current_task: str
    ) -> List[ContextItem]:
        """
        检测并标记与当前任务无关的上下文项
        
        Args:
            context_items: 上下文项列表
            current_task: 当前任务描述
        
        Returns:
            相关性过低的上下文项列表
        """
        irrelevant = []
        
        for item in context_items:
            # 基于相关性分数判断
            if item.relevance_score < 0.3:
                irrelevant.append(item)
        
        return irrelevant
    
    # ========== 冲突检测 (Clash Detection) ==========
    
    async def detect_clash(
        self,
        context_items: List[ContextItem]
    ) -> List[Tuple[ContextItem, ContextItem, str]]:
        """
        检测上下文内部的信息冲突
        
        Args:
            context_items: 上下文项列表
        
        Returns:
            冲突三元组列表 (item1, item2, 冲突描述)
        """
        clashes = []
        
        # 只检查同类型的项（不同类型通常不会冲突）
        type_groups = {}
        for item in context_items:
            if item.type not in type_groups:
                type_groups[item.type] = []
            type_groups[item.type].append(item)
        
        # 对每组进行两两对比
        for item_type, items in type_groups.items():
            if len(items) < 2:
                continue
            
            for i, item1 in enumerate(items):
                for item2 in items[i+1:]:
                    conflict = await self._check_conflict(item1, item2)
                    if conflict:
                        clashes.append((item1, item2, conflict))
        
        return clashes
    
    async def _check_conflict(
        self,
        item1: ContextItem,
        item2: ContextItem
    ) -> Optional[str]:
        """检查两个上下文项是否冲突"""
        if not self.llm:
            # 简单的文本重复检测
            if item1.content == item2.content:
                return "内容完全重复"
            return None
        
        # 使用 LLM 检测矛盾
        prompt = f"""比较以下两段内容是否存在矛盾：

内容 A:
{item1.content}

内容 B:
{item2.content}

如果存在矛盾，简要说明矛盾点。如果没有矛盾，回复 "无矛盾"。
"""
        
        try:
            response = await self.llm.chat([
                {"role": "user", "content": prompt}
            ], temperature=0.2)
            
            if "无矛盾" in response["content"]:
                return None
            else:
                return response["content"].strip()
        
        except Exception as e:
            print(f"Clash detection error: {e}")
            return None
    
    # ========== 综合健康检查 (Health Check) ==========
    
    async def health_check(
        self,
        context_items: List[ContextItem],
        total_tokens: int,
        max_tokens: int,
        current_task: str,
        established_facts: Optional[List[str]] = None
    ) -> HealthCheckResult:
        """
        综合上下文健康检查
        
        检测所有四类退化风险
        
        Args:
            context_items: 上下文项列表
            total_tokens: 总 token 数
            max_tokens: 最大 token 限制
            current_task: 当前任务描述
            established_facts: 已确立的事实列表
        
        Returns:
            健康检查结果
        """
        result = HealthCheckResult(
            healthy=True,
            issues=[],
            recommendations=[],
            token_usage={
                "total": total_tokens,
                "max": max_tokens,
                "ratio": total_tokens / max(max_tokens, 1)
            },
            degradation_risks=[]
        )
        
        # 1. 干扰检测
        is_distracted, distraction_msg = self.detect_distraction(
            total_tokens, max_tokens
        )
        if is_distracted:
            result.healthy = False
            result.degradation_risks.append(DegradationType.DISTRACTION)
            result.issues.append({
                "type": "distraction",
                "severity": "critical" if "CRITICAL" in distraction_msg else "warning",
                "message": distraction_msg
            })
            result.recommendations.append("执行 auto_compact 压缩上下文")
        
        # 2. 混淆检测
        irrelevant = await self.detect_confusion(context_items, current_task)
        if len(irrelevant) > len(context_items) * 0.3:  # 超过30%无关
            result.degradation_risks.append(DegradationType.CONFUSION)
            result.issues.append({
                "type": "confusion",
                "severity": "medium",
                "message": f"{len(irrelevant)} 个上下文项与当前任务相关性低"
            })
            result.recommendations.append("重新选取上下文，移除无关项")
        
        # 3. 冲突检测
        clashes = await self.detect_clash(context_items)
        if clashes:
            result.healthy = False
            result.degradation_risks.append(DegradationType.CLASH)
            result.issues.append({
                "type": "clash",
                "severity": "high",
                "message": f"发现 {len(clashes)} 处信息冲突",
                "details": [
                    {
                        "item1": clash[0].id,
                        "item2": clash[1].id,
                        "conflict": clash[2]
                    }
                    for clash in clashes
                ]
            })
            result.recommendations.append("解决冲突后再继续")
        
        # 4. 污染检测（如果提供了已确立事实）
        if established_facts:
            # 只检查新内容（草稿类型）
            new_contents = [
                item.content 
                for item in context_items 
                if item.type.value in ["draft", "scene_brief"]
            ]
            
            for content in new_contents:
                is_poisoned, conflicts = await self.detect_poisoning(
                    content, established_facts
                )
                if is_poisoned:
                    result.healthy = False
                    result.degradation_risks.append(DegradationType.POISONING)
                    result.issues.append({
                        "type": "poisoning",
                        "severity": "critical",
                        "message": "新内容与已确立事实矛盾",
                        "conflicts": conflicts
                    })
                    result.recommendations.append("修正矛盾内容或确认事实更新")
        
        return result
    
    def get_auto_fix_suggestions(
        self,
        health_result: HealthCheckResult
    ) -> List[Dict[str, Any]]:
        """
        根据健康检查结果生成自动修复建议
        
        Args:
            health_result: 健康检查结果
        
        Returns:
            修复建议列表
        """
        suggestions = []
        
        for risk in health_result.degradation_risks:
            if risk == DegradationType.DISTRACTION:
                suggestions.append({
                    "action": "compress",
                    "method": "auto_compact",
                    "urgency": "high"
                })
            
            elif risk == DegradationType.CONFUSION:
                suggestions.append({
                    "action": "filter",
                    "method": "remove_low_relevance",
                    "threshold": 0.3,
                    "urgency": "medium"
                })
            
            elif risk == DegradationType.CLASH:
                suggestions.append({
                    "action": "resolve_conflicts",
                    "method": "manual_review",
                    "urgency": "critical"
                })
            
            elif risk == DegradationType.POISONING:
                suggestions.append({
                    "action": "validate_facts",
                    "method": "fact_check",
                    "urgency": "critical"
                })
        
        return suggestions
