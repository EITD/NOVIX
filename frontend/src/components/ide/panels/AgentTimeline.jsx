/**
 * AgentTimeline Component / Agent 执行时间线组件
 * 
 * 可视化展示多 Agent 协作过程 (重构版：回合制分组 + 中文本地化)
 * Visualizes multi-agent collaboration (Refactored: Turn-based Grouping + Chinese Localization)
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../ui/core';

// --- Localized Mappings / 本地化映射 ---

const AGENT_NAMES = {
    archivist: '档案员',
    writer: '撰稿人',
    reviewer: '审核员',
    editor: '编辑',
    orchestrator: '指挥官'
};

const AGENT_COLORS = {
    archivist: '#8b5cf6', // Indigo/Purple
    writer: '#3b82f6',    // Blue
    reviewer: '#f59e0b',  // Amber
    editor: '#10b981',    // Emerald
    orchestrator: '#64748b' // Slate
};

const EVENT_LABELS = {
    context_select: '检索上下文',
    context_compress: '压缩上下文',
    context_health_check: '健康检查',
    tool_call: '调用工具',
    tool_result: '工具返回',
    llm_request: '大模型生成',
    handoff: '交接',
    diff_generated: '内容变更',
    agent_start: '任务开始',
    agent_end: '任务结束',
    agent_error: '任务异常'
};

const EVENT_ICONS = {
    agent_start: '🚀',
    agent_end: '✅',
    agent_error: '❌',
    context_select: '🧠',
    context_compress: '🗜️',
    context_health_check: '🏥',
    tool_call: '🛠️',
    tool_result: '📤',
    llm_request: '✨',
    handoff: '🤝',
    diff_generated: '📝'
};

// --- Helper: Event Grouping Logic ---

const groupEventsByTurn = (events) => {
    const turns = [];
    let currentTurn = null;

    events.forEach(event => {
        // 1. Start a new turn
        if (event.type === 'agent_start') {
            if (currentTurn) turns.push(currentTurn); // Close prev if exists
            currentTurn = {
                id: `turn_${event.id}`,
                agent: event.agent_name,
                startTime: event.timestamp,
                status: 'running',
                events: [event],
                metrics: { tokens: 0, diffs: 0, tools: 0 }
            };
        }
        // 2. End current turn
        else if (event.type === 'agent_end' || event.type === 'agent_error') {
            if (currentTurn) {
                currentTurn.events.push(event);
                currentTurn.status = event.type === 'agent_end' ? 'completed' : 'failed';
                currentTurn.endTime = event.timestamp;
                currentTurn.duration = (currentTurn.endTime - currentTurn.startTime).toFixed(1);
                turns.push(currentTurn);
                currentTurn = null;
            } else {
                // Orphaned end event (shouldn't happen ideally)
                turns.push({
                    id: `orphan_${event.id}`,
                    agent: event.agent_name,
                    status: event.type === 'agent_end' ? 'completed' : 'failed',
                    events: [event],
                    metrics: { tokens: 0, diffs: 0, tools: 0 }
                });
            }
        }
        // 3. Add events to current turn
        else if (currentTurn) {
            currentTurn.events.push(event);

            // Update metrics
            if (event.type === 'llm_request') {
                currentTurn.metrics.tokens += (event.data.tokens?.total || 0);
            }
            if (event.type === 'diff_generated') {
                currentTurn.metrics.diffs += (event.data.additions + event.data.deletions);
            }
            if (event.type === 'tool_call') {
                currentTurn.metrics.tools += 1;
            }
        }
        // 4. Standalone events (e.g. handoff outside start/end distinct block)
        else {
            // Treat handoff as a special separator, not a turn
            if (event.type === 'handoff') {
                turns.push({
                    id: `handoff_${event.id}`,
                    type: 'separator',
                    data: event
                });
            }
        }
    });

    // Push last active turn if exists
    if (currentTurn) turns.push(currentTurn);

    return turns;
};

// --- Sub-components ---

const HandoffSeparator = ({ data }) => (
    <div className="flex items-center justify-center my-4 opacity-70">
        <div className="h-[1px] bg-border flex-1 mx-4" />
        <div className="flex items-center gap-2 text-[10px] text-ink-400 bg-surface px-3 py-1 rounded-full border border-border">
            <span>{AGENT_NAMES[data.agent_name] || data.agent_name}</span>
            <span>→</span>
            <span>{AGENT_NAMES[data.data.to] || data.data.to}</span>
        </div>
        <div className="h-[1px] bg-border flex-1 mx-4" />
    </div>
);

const TurnCard = ({ turn, expanded, onToggle }) => {
    const agentColor = AGENT_COLORS[turn.agent] || '#6b7280';
    const localizedName = AGENT_NAMES[turn.agent] || turn.agent;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-background border border-border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
            style={{ borderLeft: `4px solid ${agentColor}` }}
        >
            {/* Header */}
            <div
                onClick={onToggle}
                className="p-3 flex items-center justify-between cursor-pointer bg-ink-50/30 hover:bg-ink-50/80 transition-colors"
                title="点击展开详情"
            >
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm" style={{ backgroundColor: agentColor }}>
                        {localizedName[0]}
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-ink-800">{localizedName}</span>
                            <StatusBadge status={turn.status} />
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-ink-400">
                            {turn.duration && <span>⏱️ {turn.duration}s</span>}
                            {turn.metrics.tokens > 0 && <span>💎 {turn.metrics.tokens} Tok</span>}
                            {turn.metrics.diffs > 0 && <span>📝 {turn.metrics.diffs} 变更</span>}
                        </div>
                    </div>
                </div>
                <div className="text-ink-400">
                    {expanded ? '▲' : '▼'}
                </div>
            </div>

            {/* Expanded Body */}
            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: 'auto' }}
                        exit={{ height: 0 }}
                        className="overflow-hidden border-t border-border/50 bg-white"
                    >
                        <div className="p-3 space-y-3">
                            {turn.events.map(event => (
                                <DetailEventRow key={event.id} event={event} />
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

const StatusBadge = ({ status }) => {
    if (status === 'running') return <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded animate-pulse">● 运行中</span>;
    if (status === 'completed') return <span className="text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded">✓ 完成</span>;
    if (status === 'failed') return <span className="text-[10px] text-red-600 bg-red-50 px-1.5 py-0.5 rounded">✗ 失败</span>;
    return null;
};

const DetailEventRow = ({ event }) => {
    // Skip start/end events in detail view as they are implied by the card
    if (event.type === 'agent_start' || event.type === 'agent_end') return null;

    const label = EVENT_LABELS[event.type] || event.type;
    const icon = EVENT_ICONS[event.type] || '📌';
    const time = new Date(event.timestamp * 1000).toLocaleTimeString('zh-CN', { hour12: false });

    return (
        <div className="flex gap-3 text-xs group">
            <div className="w-12 text-[10px] text-ink-300 font-mono pt-1 text-right shrink-0">{time}</div>
            <div className="w-6 flex flex-col items-center">
                <div className="w-6 h-6 rounded-md bg-ink-50 text-ink-500 flex items-center justify-center text-sm border border-border/50 group-hover:border-primary/30 group-hover:text-primary transition-colors">
                    {icon}
                </div>
                <div className="w-[1px] bg-ink-100 flex-1 my-1 last:hidden" />
            </div>
            <div className="flex-1 pb-2">
                <div className="font-medium text-ink-700 mb-0.5">{label}</div>
                <EventPayloadRenderer event={event} />
            </div>
        </div>
    );
};

const EventPayloadRenderer = ({ event }) => {
    const { type, data } = event;

    if (type === 'llm_request') {
        return (
            <div className="text-[10px] bg-ink-50/50 p-2 rounded border border-border/50 font-mono text-ink-500">
                <div>Model: {data.model}</div>
                <div className="flex gap-2 mt-1">
                    <span className="text-blue-600">In: {data.tokens?.prompt}</span>
                    <span className="text-green-600">Out: {data.tokens?.completion}</span>
                    <span className="text-ink-400">{data.latency_ms}ms</span>
                </div>
            </div>
        );
    }

    if (type === 'context_select') {
        return (
            <div className="text-[10px]">
                <span className="text-ink-500">选中 </span>
                <span className="font-bold text-ink-800">{data.selected}</span>
                <span className="text-ink-300"> / {data.candidates} 项</span>
                <div className="h-1 bg-ink-100 rounded-full mt-1 w-24 overflow-hidden">
                    <div className="h-full bg-blue-500" style={{ width: `${(data.selected / data.candidates) * 100}%` }} />
                </div>
            </div>
        );
    }

    if (type === 'diff_generated') {
        return (
            <div className="text-[10px] font-mono flex gap-3">
                <span className="text-green-600">+{data.additions}</span>
                <span className="text-red-600">-{data.deletions}</span>
            </div>
        );
    }

    // Default JSON dump for others (Tool calls etc)
    return (
        <pre className="text-[10px] text-ink-400 overflow-x-auto whitespace-pre-wrap font-mono bg-ink-50/30 p-1.5 rounded">
            {JSON.stringify(data, (key, value) => {
                if (key === 'content' && typeof value === 'string' && value.length > 100) return value.substring(0, 100) + '...';
                return value;
            }, 2)}
        </pre>
    );
};

// --- Main Component ---

const AgentTimeline = ({ events = [], autoScroll = true, maxHeight = '100%' }) => {
    const containerRef = useRef(null);
    const [expandedTurns, setExpandedTurns] = useState(new Set()); // Store IDs of expanded turns

    // 1. Group events
    const turns = useMemo(() => groupEventsByTurn(events), [events]);

    // 2. Auto-expand the LATEST running turn
    useEffect(() => {
        const lastTurn = turns[turns.length - 1];
        if (lastTurn && lastTurn.status === 'running' && !turns.slice(0, -1).some(t => t.id === lastTurn.id)) {
            setExpandedTurns(prev => new Set(prev).add(lastTurn.id));
        }
    }, [turns.length]);

    // 3. Auto-scroll
    useEffect(() => {
        if (autoScroll && containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
    }, [events.length, autoScroll]);

    const toggleTurn = (id) => {
        setExpandedTurns(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    return (
        <div ref={containerRef} className="h-full overflow-y-auto p-3 space-y-4 custom-scrollbar bg-surface/30" style={{ maxHeight }}>
            {turns.length === 0 ? (
                <div className="text-center py-10 text-ink-400 text-xs">
                    <p>暂无行动记录</p>
                    <p className="opacity-50 mt-1">等待任务开始...</p>
                </div>
            ) : (
                turns.map((item, idx) => {
                    if (item.type === 'separator') return <HandoffSeparator key={item.id} data={item.data} />;
                    return (
                        <TurnCard
                            key={item.id}
                            turn={item}
                            expanded={expandedTurns.has(item.id)}
                            onToggle={() => toggleTurn(item.id)}
                        />
                    );
                })
            )}
            <div className="h-4" /> {/* Bottom padding */}
        </div>
    );
};

export default AgentTimeline;
