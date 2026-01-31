"""
Context Engine Module / 上下文引擎模块
Manages context selection, compression, budgeting, and conflict detection
管理上下文选取、压缩、预算控制和冲突检测
"""

# 现有组件
from .selector import ContextSelector
from .compressor import ContextCompressor
from .budgeter import TokenBudgeter

# 新增：核心数据模型
from .models import (
    ContextItem,
    ContextPriority,
    ContextType,
    DegradationType,
    ToolDefinition,
    ToolTrace,
    HealthCheckResult,
    AssembledContext,
    estimate_tokens,
    count_tokens_accurate
)

# 新增：三类上下文管理器
from .guiding_context import GuidingContextBuilder
from .informational_context import InformationalContextManager
from .actionable_context import ActionableContextManager

# 新增：四大引擎
from .write_engine import ContextWriteEngine
from .select_engine import ContextSelectEngine
from .compress_engine import ContextCompressEngine
from .isolate_engine import ContextIsolateEngine

# 新增：退化防护
from .degradation_guard import ContextDegradationGuard

# 新增：统一编排器
from .orchestrator import ContextOrchestrator

__all__ = [
    # 现有
    "ContextSelector",
    "ContextCompressor",
    "TokenBudgeter",
    # 数据模型
    "ContextItem",
    "ContextPriority",
    "ContextType",
    "DegradationType",
    "ToolDefinition",
    "ToolTrace",
    "HealthCheckResult",
    "AssembledContext",
    "estimate_tokens",
    "count_tokens_accurate",
    # 三类上下文管理器
    "GuidingContextBuilder",
    "InformationalContextManager",
    "ActionableContextManager",
    # 四大引擎
    "ContextWriteEngine",
    "ContextSelectEngine",
    "ContextCompressEngine",
    "ContextIsolateEngine",
    # 退化防护
    "ContextDegradationGuard",
    # 统一编排器
    "ContextOrchestrator"
]
