"""
Actionable Context Manager / 行动性上下文管理器
Manages actionable context (tool definitions and traces)
管理行动性上下文（工具定义和调用追踪）
"""

from typing import List, Dict, Any
from .models import ToolDefinition, ToolTrace


class ActionableContextManager:
    """
    行动性上下文管理器
    Manages tools and their execution traces
    """
    
    def __init__(self, max_trace_history: int = 10):
        """
        初始化管理器
        
        Args:
            max_trace_history: 保留的工具调用历史最大数量
        """
        self.tool_definitions: List[ToolDefinition] = []
        self.tool_traces: List[ToolTrace] = []
        self.max_trace_history = max_trace_history
    
    def add_tool(self, tool: ToolDefinition):
        """添加工具定义"""
        # 避免重复添加
        if not any(t.name == tool.name for t in self.tool_definitions):
            self.tool_definitions.append(tool)
    
    def add_tool_from_dict(
        self,
        name: str,
        description: str,
        parameters: Dict[str, Any],
        examples: List[Dict[str, Any]] = None
    ):
        """从字典参数添加工具"""
        tool = ToolDefinition(
            name=name,
            description=description,
            parameters=parameters,
            examples=examples or []
        )
        self.add_tool(tool)
    
    def record_trace(self, trace: ToolTrace):
        """记录工具调用追踪"""
        self.tool_traces.append(trace)
        
        # 保持历史记录在限制内（FIFO）
        if len(self.tool_traces) > self.max_trace_history:
            self.tool_traces = self.tool_traces[-self.max_trace_history:]
    
    def record_trace_from_dict(
        self,
        tool_name: str,
        arguments: Dict[str, Any],
        result: Any,
        success: bool,
        timestamp: float,
        duration_ms: int = 0,
        error: str = None
    ):
        """从字典参数记录工具调用"""
        trace = ToolTrace(
            tool_name=tool_name,
            arguments=arguments,
            result=result,
            success=success,
            timestamp=timestamp,
            duration_ms=duration_ms,
            error=error
        )
        self.record_trace(trace)
    
    def get_tool(self, name: str) -> ToolDefinition:
        """根据名称获取工具定义"""
        for tool in self.tool_definitions:
            if tool.name == name:
                return tool
        return None
    
    def get_recent_traces(self, count: int = 5) -> List[ToolTrace]:
        """获取最近的 N 条工具调用记录"""
        return self.tool_traces[-count:] if self.tool_traces else []
    
    def get_context_string(self) -> str:
        """
        生成行动性上下文字符串
        用于插入到 LLM 的上下文中
        
        Returns:
            格式化的工具和调用历史字符串
        """
        parts = []
        
        # 工具定义
        if self.tool_definitions:
            parts.append("## 可用工具\n")
            for tool in self.tool_definitions:
                parts.append(tool.to_context_string())
                # 如果有示例，添加示例
                if tool.examples:
                    parts.append(f"  示例: {tool.examples[0]}")
                parts.append("")  # 空行
        
        # 最近的工具调用
        recent_traces = self.get_recent_traces(5)
        if recent_traces:
            parts.append("\n## 最近的工具调用\n")
            for trace in recent_traces:
                parts.append(trace.to_context_string())
        
        return "\n".join(parts)
    
    def get_function_schemas(self) -> List[Dict[str, Any]]:
        """
        获取工具的 Function Calling Schema 列表
        用于 OpenAI/Anthropic 的工具调用
        
        Returns:
            符合 OpenAI Function Calling 格式的 schema 列表
        """
        return [tool.to_function_schema() for tool in self.tool_definitions]
    
    def clear_traces(self):
        """清空工具调用历史"""
        self.tool_traces = []
    
    def get_stats(self) -> Dict[str, Any]:
        """获取统计信息"""
        total_calls = len(self.tool_traces)
        successful_calls = sum(1 for t in self.tool_traces if t.success)
        
        return {
            "total_tools": len(self.tool_definitions),
            "total_calls": total_calls,
            "successful_calls": successful_calls,
            "failed_calls": total_calls - successful_calls,
            "success_rate": successful_calls / total_calls if total_calls > 0 else 0,
            "tool_usage": self._get_tool_usage_stats()
        }
    
    def _get_tool_usage_stats(self) -> Dict[str, int]:
        """获取每个工具的使用次数"""
        usage = {}
        for trace in self.tool_traces:
            usage[trace.tool_name] = usage.get(trace.tool_name, 0) + 1
        return usage
