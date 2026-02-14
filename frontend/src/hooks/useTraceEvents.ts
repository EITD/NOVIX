/**
 * 文枢 WenShape - 深度上下文感知的智能体小说创作系统
 * WenShape - Deep Context-Aware Agent-Based Novel Writing System
 *
 * Copyright © 2025-2026 WenShape Team
 * License: PolyForm Noncommercial License 1.0.0
 *
 * 模块说明 / Module Description:
 *   追踪事件 Hook，通过 WebSocket 接收来自后端的实时追踪信息。
 *   用于监控 AI Agent 执行过程和上下文使用情况。
 */

import { useState, useEffect, useRef } from 'react';
import logger from '../utils/logger';

/**
 * 获取 WebSocket 连接地址
 *
 * 根据当前窗口位置和协议动态生成 WebSocket URL。
 * 支持 http/https 自动转换为 ws/wss。
 */
const getWsUrl = (): string => {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host = window.location.host;
    return `${protocol}://${host}/ws/trace`;
};

/**
 * Token 使用统计 / Token Usage
 *
 * 记录上下文中各类型 Token 的使用情况。
 */
interface TokenUsage {
    total: number;                  // 总 Token 数
    max: number;                    // 最大 Token 数（模型限制）
    breakdown: {                    // Token 分布
        guiding: number;            // 指导性 Token
        informational: number;      // 信息性 Token
        actionable: number;         // 可执行 Token
    };
}

/**
 * 上下文统计 / Context Statistics
 *
 * 上下文健康状态和 Token 使用统计。
 */
interface ContextStats {
    token_usage: TokenUsage;       // Token 使用情况
    health: {                       // 健康状态
        healthy: boolean;           // 是否健康
        issues: string[];          // 问题列表
    };
}

/**
 * 追踪消息 / Trace Message
 *
 * 从 WebSocket 接收的单条追踪消息。
 */
interface TraceMessage {
    type: string;                   // 消息类型
    payload: Record<string, unknown>; // 消息负载
}

/**
 * Agent 追踪 / Agent Trace
 *
 * 单个 Agent 的执行追踪信息。
 */
interface AgentTrace {
    agent_name: string;             // Agent 名称
    [key: string]: unknown;         // 其他字段
}

/**
 * useTraceEvents - 追踪事件 Hook
 *
 * 通过 WebSocket 连接到后端追踪服务，实时接收和处理以下类型的消息：
 * - trace_event: 通用追踪事件
 * - agent_trace_update: Agent 执行追踪更新
 * - context_stats_update: 上下文统计更新
 *
 * @returns {Object} 追踪数据对象
 *   - events: 追踪事件列表
 *   - traces: Agent 追踪列表
 *   - contextStats: 上下文统计
 *   - isConnected: WebSocket 连接状态
 *
 * @example
 * const { events, traces, contextStats, isConnected } = useTraceEvents();
 * if (isConnected) {
 *   console.log('Events received:', events);
 * }
 */
export const useTraceEvents = () => {
    // ========================================================================
    // 状态管理 / State Management
    // ========================================================================
    const [events, setEvents] = useState<Record<string, unknown>[]>([]);
    const [traces, setTraces] = useState<AgentTrace[]>([]);
    const [contextStats, setContextStats] = useState<ContextStats>({
        token_usage: {
            total: 0,
            max: 16000,
            breakdown: { guiding: 0, informational: 0, actionable: 0 }
        },
        health: { healthy: true, issues: [] }
    });
    const [isConnected, setIsConnected] = useState(false);
    const wsRef = useRef<WebSocket | null>(null);

    // ========================================================================
    // 生命周期：连接和断开 / Lifecycle: Connect and Disconnect
    // ========================================================================
    useEffect(() => {
        connect();
        return () => {
            if (wsRef.current) {
                wsRef.current.close();
            }
        };
    }, []);

    /**
     * 建立 WebSocket 连接
     */
    const connect = (): void => {
        try {
            const ws = new WebSocket(getWsUrl());
            wsRef.current = ws;

            ws.onopen = () => {
                logger.debug('Trace WebSocket Connected');
                setIsConnected(true);
            };

            ws.onclose = () => {
                logger.debug('Trace WebSocket Disconnected');
                setIsConnected(false);
                // 3秒后自动重连 / Automatically reconnect after 3s
                setTimeout(connect, 3000);
            };

            ws.onmessage = (event: MessageEvent) => {
                try {
                    const message: TraceMessage = JSON.parse(event.data);
                    handleMessage(message);
                } catch (e) {
                    logger.error('Failed to parse WS message', e);
                }
            };
        } catch (e) {
            logger.error('WebSocket connection error', e);
        }
    };

    /**
     * 处理接收到的消息
     *
     * @param {TraceMessage} message - WebSocket 消息
     */
    const handleMessage = (message: TraceMessage): void => {
        const { type, payload } = message;

        // ====================================================================
        // 消息类型处理 / Message Type Handling
        // ====================================================================

        if (type === 'trace_event') {
            // 通用追踪事件 - Generic trace event
            setEvents(prev => [...prev, payload]);
        } else if (type === 'agent_trace_update') {
            // Agent 执行追踪更新 - Agent trace update
            setTraces(prev => {
                const agentPayload = payload as AgentTrace;
                const index = prev.findIndex(t => t.agent_name === agentPayload.agent_name);
                if (index >= 0) {
                    // 更新现有 Agent 的追踪信息 / Update existing agent trace
                    const newTraces = [...prev];
                    newTraces[index] = { ...newTraces[index], ...agentPayload };
                    return newTraces;
                }
                // 添加新的 Agent 追踪 / Add new agent trace
                return [...prev, agentPayload];
            });
        } else if (type === 'context_stats_update') {
            // 上下文统计更新 - Context statistics update
            setContextStats(payload as ContextStats);
        }
    };

    return { events, traces, contextStats, isConnected };
};

