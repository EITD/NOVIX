/**
 * ContextMonitor Component / 上下文监控组件
 * 
 * 实时展示多模型 Token 消耗及上下文健康状态
 * Visualizes multi-model token usage and context health
 */

import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../ui/core';
import { AlertTriangle, CheckCircle2, AlertOctagon, Activity, BarChart2, PieChart } from 'lucide-react';

// --- Localized Mappings ---

const AGENT_NAMES = {
    archivist: '档案员',
    writer: '撰稿人',
    editor: '编辑'
};

const AGENT_COLORS = {
    archivist: 'bg-purple-500',
    writer: 'bg-blue-500',
    editor: 'bg-emerald-500'
};

const TYPE_COLORS = {
    guiding: 'bg-green-500',
    informational: 'bg-blue-500',
    actionable: 'bg-orange-500',
    other: 'bg-gray-400'
};

// --- Sub-components ---

const AgentCostBar = ({ agentId, inputTokens, outputTokens, maxTokens }) => {
    const total = inputTokens + outputTokens;
    const inputPercent = (inputTokens / maxTokens) * 100;
    const outputPercent = (outputTokens / maxTokens) * 100;
    const name = AGENT_NAMES[agentId] || agentId;
    const color = AGENT_COLORS[agentId] || 'bg-gray-400';

    return (
        <div className="mb-3">
            <div className="flex justify-between text-[10px] mb-1 text-ink-600">
                <span className="font-bold flex items-center gap-1">
                    <div className={cn("w-2 h-2 rounded-full", color)} />
                    {name}
                </span>
                <span className="font-mono">
                    <span className="text-blue-600">{inputTokens}</span> + <span className="text-green-600">{outputTokens}</span> = {total}
                </span>
            </div>
            <div className="h-2 w-full bg-ink-100 rounded-full overflow-hidden flex">
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${inputPercent}%` }}
                    className="h-full bg-blue-400/80"
                    title={`Context: ${inputTokens}`}
                />
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${outputPercent}%` }}
                    className="h-full bg-green-500/80"
                    title={`Output: ${outputTokens}`}
                />
            </div>
        </div>
    );
};

const ContextMonitor = ({
    stats = {
        token_usage: {
            total: 0,
            max: 16000,
            breakdown: { guiding: 0, informational: 0, actionable: 0 }
        },
        health: { healthy: true, issues: [] },
        // New: We need agent-specific stats passed down or derived from traces
        // For now, let's assume stats might contain an 'agent_costs' field eventually,
        // or we aggregate it from traces if passed.
        // But props currently only show 'stats'. 
        // We might need to update AgentsPanel to pass 'traces' to derive costs if not in stats.
    },
    // Optional: Pass traces to calculate agent costs dynamically if backend doesn't aggregate yet
    traces = []
}) => {
    const [viewMode, setViewMode] = useState('cost'); // 'cost' (Agent) | 'health' (Context)

    // Calculate Agent Costs from Traces (Client-side aggregation)
    const agentCosts = useMemo(() => {
        const costs = {
            archivist: { input: 0, output: 0 },
            writer: { input: 0, output: 0 },
            editor: { input: 0, output: 0 }
        };

        traces.forEach(trace => {
            // Check context_stats in trace (if backend populates it)
            // Or sum up from LLM_REQUEST events in trace (not passed here directly usually)
            // Assuming trace object has accumulated usage or we need raw events.
            // Simplified: Use trace's `context_stats.token_usage` for Input (Context) roughly,
            // and maybe estimating Output.

            // BETTER: Use event metrics if available. 
            // Since we might not have granular events here, let's use a mock or the stats breakdown if traces are empty.
            // If traces have data:
            if (trace.context_stats?.token_usage) {
                // This is total tokens. Let's split arbitrarily for viz if real breakdown missing.
                // In reality, trace_collector should send input/output split.
                const total = trace.context_stats.token_usage;
                const input = Math.floor(total * 0.8);
                const output = total - input;

                if (costs[trace.agent_name]) {
                    costs[trace.agent_name].input = input;
                    costs[trace.agent_name].output = output;
                }
            }
        });
        return costs;
    }, [traces]);

    // Calculate global stats
    const { token_usage, health } = stats;
    const globalUsagePercent = Math.min((token_usage.total / token_usage.max) * 100, 100);

    // Breakdown percentages
    const guidingPercent = (token_usage.breakdown.guiding / token_usage.max) * 100;
    const infoPercent = (token_usage.breakdown.informational / token_usage.max) * 100;
    const actionPercent = (token_usage.breakdown.actionable / token_usage.max) * 100;

    return (
        <div className="flex flex-col gap-3 p-3 bg-background border border-border rounded-xl shadow-sm h-full">
            {/* Header / Tabs */}
            <div className="flex items-center justify-between border-b border-border pb-2">
                <div className="flex items-center gap-2">
                    <Activity size={16} className="text-primary" />
                    <span className="text-xs font-bold text-ink-800">系统监控</span>
                </div>

                <div className="flex bg-ink-100 p-0.5 rounded-lg">
                    <button
                        onClick={() => setViewMode('cost')}
                        className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-medium transition-all",
                            viewMode === 'cost' ? "bg-white text-primary shadow-sm" : "text-ink-500 hover:text-ink-700"
                        )}
                    >
                        <BarChart2 size={10} className="inline mr-1" />
                        模型消耗
                    </button>
                    <button
                        onClick={() => setViewMode('health')}
                        className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-medium transition-all",
                            viewMode === 'health' ? "bg-white text-primary shadow-sm" : "text-ink-500 hover:text-ink-700"
                        )}
                    >
                        <PieChart size={10} className="inline mr-1" />
                        上下文健康
                    </button>
                </div>
            </div>

            {/* Content Switcher */}
            {viewMode === 'cost' ? (
                <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="bg-ink-50 rounded-lg p-3 border border-border mb-3">
                        <div className="flex justify-between items-end mb-2">
                            <span className="text-xs font-medium text-ink-500">本章累计成本 (Session Cost)</span>
                            <div className="text-right">
                                <span className="text-lg font-bold text-ink-900 leading-none">{token_usage.total}</span>
                                <span className="text-xs text-ink-400 ml-1">/ {token_usage.max}</span>
                            </div>
                        </div>
                        <div className="h-1.5 w-full bg-ink-200 rounded-full overflow-hidden">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${globalUsagePercent}%` }}
                                className={cn("h-full", globalUsagePercent > 90 ? "bg-red-500" : "bg-primary")}
                            />
                        </div>
                    </div>

                    <div className="space-y-4">
                        {Object.entries(agentCosts).map(([agent, cost]) => (
                            <AgentCostBar
                                key={agent}
                                agentId={agent}
                                inputTokens={cost.input}
                                outputTokens={cost.output}
                                maxTokens={8192} // Max per agent turn assumption for visualization
                            />
                        ))}
                    </div>

                    <div className="mt-4 pt-4 border-t border-border flex justify-center gap-4 text-[10px] text-ink-400">
                        <div className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded bg-blue-400/80" />
                            <span>输入 (Context)</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded bg-green-500/80" />
                            <span>输出 (Generation)</span>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="animate-in fade-in slide-in-from-right-4 duration-300 space-y-4">
                    {/* Health Status */}
                    <div className={cn(
                        "flex items-center gap-2 p-2 rounded-lg text-xs font-bold border",
                        health.healthy ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"
                    )}>
                        {health.healthy ? <CheckCircle2 size={14} /> : <AlertOctagon size={14} />}
                        {health.healthy ? '系统健康状态良好' : '检测到上下文风险'}
                    </div>

                    {/* Breakdown Chart */}
                    <div className="bg-ink-50 rounded-lg p-3 border border-border">
                        <div className="text-[10px] text-ink-500 mb-2 font-medium">Token 结构分布</div>
                        <div className="h-8 w-full bg-ink-200 rounded flex overflow-hidden relative border border-ink-100/50">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${guidingPercent}%` }}
                                className={cn("h-full shadow-sm", TYPE_COLORS.guiding)}
                            />
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${infoPercent}%` }}
                                className={cn("h-full shadow-sm", TYPE_COLORS.informational)}
                            />
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${actionPercent}%` }}
                                className={cn("h-full shadow-sm", TYPE_COLORS.actionable)}
                            />
                        </div>
                        <div className="flex justify-between mt-2 text-[10px]">
                            <span className="flex items-center gap-1 text-ink-600">
                                <div className={cn("w-1.5 h-1.5 rounded-full", TYPE_COLORS.guiding)} /> 指导 ({token_usage.breakdown.guiding})
                            </span>
                            <span className="flex items-center gap-1 text-ink-600">
                                <div className={cn("w-1.5 h-1.5 rounded-full", TYPE_COLORS.informational)} /> 信息 ({token_usage.breakdown.informational})
                            </span>
                            <span className="flex items-center gap-1 text-ink-600">
                                <div className={cn("w-1.5 h-1.5 rounded-full", TYPE_COLORS.actionable)} /> 行动 ({token_usage.breakdown.actionable})
                            </span>
                        </div>
                    </div>

                    {/* Issues List */}
                    {health.issues.length > 0 && (
                        <div className="bg-red-50/50 border border-red-100 rounded-lg p-3">
                            <div className="flex items-center gap-2 mb-2 text-red-700 font-bold text-xs">
                                <AlertTriangle size={12} />
                                <span>潜在风险列表</span>
                            </div>
                            <ul className="space-y-1">
                                {health.issues.map((issue, idx) => (
                                    <li key={idx} className="text-[10px] text-red-600 flex items-start gap-1.5">
                                        <span className="mt-1 w-1 h-1 rounded-full bg-red-500 shrink-0" />
                                        <span><span className="font-bold">[{issue.type}]</span> {issue.message}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ContextMonitor;
