# -*- coding: utf-8 -*-
"""
文枢 WenShape - 深度上下文感知的智能体小说创作系统
WenShape - Deep Context-Aware Agent-Based Novel Writing System

Copyright © 2025-2026 WenShape Team
License: PolyForm Noncommercial License 1.0.0

模块说明 / Module Description:
  编排器共享类型 - 在独立模块中定义SessionStatus以避免循环导入
  Shared Types for Orchestrator - Define SessionStatus in separate module to avoid circular imports.

设计说明 / Design Note:
  SessionStatus 放在独立模块中，避免 Mixin 与 orchestrator 之间的循环导入。
  Separating types prevents circular import issues between mixins and main orchestrator.
"""

from enum import Enum


class SessionStatus(str, Enum):
    """
    会话状态枚举 / Session status enumeration

    定义写作会话的所有可能状态。状态机转换遵循以下规则：
    IDLE -> GENERATING_BRIEF -> WRITING_DRAFT -> EDITING -> (WAITING_FEEDBACK|WAITING_USER_INPUT) -> ...

    Defines all possible states for a writing session.
    State machine follows: IDLE -> generating -> writing -> editing -> waiting

    Attributes:
        IDLE: 空闲状态，等待用户操作 / Idle, waiting for user action
        GENERATING_BRIEF: 正在生成场景简要 / Generating scene brief
        WRITING_DRAFT: 正在撰写草稿 / Writing draft content
        EDITING: 正在编辑/润色 / Editing content
        WAITING_FEEDBACK: 等待用户反馈 / Waiting for user feedback
        WAITING_USER_INPUT: 等待用户输入 / Waiting for user input
        COMPLETED: 会话已完成 / Session completed
        ERROR: 错误状态 / Error state
    """

    IDLE = "idle"
    GENERATING_BRIEF = "generating_brief"
    WRITING_DRAFT = "writing_draft"
    EDITING = "editing"
    WAITING_FEEDBACK = "waiting_feedback"
    WAITING_USER_INPUT = "waiting_user_input"
    COMPLETED = "completed"
    ERROR = "error"
