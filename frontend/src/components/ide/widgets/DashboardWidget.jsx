import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { projectsAPI } from '../../../api';
import {
    Activity, Users, BookOpen, RefreshCw, BarChart2,
    CheckCircle2
} from 'lucide-react';
import { cn } from '../../ui/core';

/**
 * DashboardWidget - 项目概览小组件
 * 展示统计信息与最近事实，保持数据结构不变。
 */
export default function DashboardWidget() {
    const { projectId } = useParams();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);

    const loadStats = async () => {
        if (!projectId) return;
        setLoading(true);
        try {
            const res = await projectsAPI.getDashboard(projectId);
            setData(res.data);
        } catch (error) {
            console.error("Failed to load dashboard stats", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadStats();
    }, [projectId]);

    if (loading && !data) {
        return (
            <div className="anti-theme h-full flex flex-col items-center justify-center text-[var(--vscode-fg-subtle)] gap-2 bg-[var(--vscode-bg)]">
                <RefreshCw size={16} className="animate-spin" />
                <span className="text-xs">加载数据中...</span>
            </div>
        );
    }

    if (!data) return null;

    const stats = data.stats || {};
    const chapters = data.chapters || [];
    const recentFacts = data.recent?.facts || [];

    return (
        <div className="anti-theme h-full overflow-y-auto custom-scrollbar p-3 space-y-4 bg-[var(--vscode-bg)] text-[var(--vscode-fg)]">
            {/* Header / Refresh */}
            <div className="flex items-center justify-between pb-2 border-b border-[var(--vscode-sidebar-border)]">
                <div className="flex items-center gap-2 text-[var(--vscode-fg)] font-bold">
                    <BarChart2 size={16} className="text-[var(--vscode-focus-border)]" />
                    <span>项目概览</span>
                </div>
                <button
                    onClick={loadStats}
                    className="p-1.5 hover:bg-[var(--vscode-list-hover)] rounded-[6px] text-[var(--vscode-fg-subtle)] hover:text-[var(--vscode-fg)] transition-colors"
                    title="刷新数据"
                >
                    <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                </button>
            </div>

            {/* Core Stats Grid (Removed Completion Rate as requested) */}
            <div className="grid grid-cols-2 gap-2">
                <StatTile
                    icon={<BookOpen size={14} />}
                    label="总字数"
                    value={(stats.total_word_count || 0).toLocaleString()}
                    color="text-[var(--vscode-focus-border)]"
                />
                <StatTile
                    icon={<Users size={14} />}
                    label="角色数"
                    value={stats.character_count || 0}
                    color="text-[var(--vscode-focus-border)]"
                />
                <StatTile
                    icon={<Activity size={14} />}
                    label="实体总数"
                    value={(stats.fact_count || 0) + (stats.timeline_event_count || 0)}
                    color="text-[var(--vscode-fg-subtle)]"
                />
            </div>

            {/* Chapters List (Compact) */}
            <div className="space-y-2">
                <SectionHeader icon={<BookOpen size={14} />} title="章节状态" count={chapters.length} />
                <div className="space-y-1.5">
                    {chapters.length === 0 ? (
                        <EmptyState text="暂无章节" />
                    ) : (
                        chapters.map(ch => (
                            <div key={ch.chapter} className="flex items-center justify-between p-2 bg-[var(--vscode-bg)] border border-[var(--vscode-sidebar-border)] rounded-[6px] hover:bg-[var(--vscode-list-hover)] transition-colors group">
                                <div className="flex-1 min-w-0 pr-2">
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium text-xs text-[var(--vscode-fg)] truncate">
                                            {ch.chapter}
                                        </span>
                                        {ch.has_summary && (
                                            <span className="px-1 py-0.5 rounded-[2px] bg-[var(--vscode-list-hover)] text-[var(--vscode-fg)] text-[9px] font-mono leading-none">
                                                摘
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-[10px] text-[var(--vscode-fg-subtle)] mt-0.5 truncate font-mono">
                                        {ch.has_final ? `${ch.final_word_count} 字` : '无内容'}
                                    </div>
                                </div>
                                <div className="shrink-0">
                                    {(ch.conflict_count || 0) > 0 ? (
                                        <span className="flex items-center gap-1 text-[10px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded border border-red-100 font-bold">
                                            {ch.conflict_count} 冲突
                                        </span>
                                    ) : (
                                        <span className="text-emerald-600 text-[10px]">
                                            <CheckCircle2 size={14} />
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Recent Facts (Compact) */}
            <div className="space-y-2">
                <SectionHeader icon={<Activity size={14} />} title="近期事实" count={recentFacts.length} />
                <div className="space-y-1.5">
                    {recentFacts.length === 0 ? (
                        <EmptyState text="暂无近期变动" />
                    ) : (
                        recentFacts.slice(0, 5).map((f, idx) => (
                            <div key={idx} className="p-2 bg-[var(--vscode-bg)] border-l-2 border-l-[var(--vscode-focus-border)] border-y border-r border-[var(--vscode-sidebar-border)] rounded-r text-xs">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="font-mono font-bold text-[10px] text-[var(--vscode-focus-border)] bg-[var(--vscode-list-hover)] px-1 rounded">
                                        {f.id}
                                    </span>
                                </div>
                                <div className="text-[var(--vscode-fg)] line-clamp-2 leading-relaxed">
                                    {f.statement}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

function StatTile({ icon, label, value, color }) {
    return (
        <div className="bg-[var(--vscode-bg)] p-2 rounded-[6px] border border-[var(--vscode-sidebar-border)] flex flex-col items-center justify-center gap-1 transition-colors">
            <div className={cn("opacity-80", color)}>{icon}</div>
            <div className="text-[10px] text-[var(--vscode-fg-subtle)] tracking-tighter scale-90">{label}</div>
            <div className="text-sm font-bold font-serif text-[var(--vscode-fg)]">{value}</div>
        </div>
    );
}

function SectionHeader({ icon, title, count }) {
    return (
        <div className="flex items-center gap-2 text-xs font-bold text-[var(--vscode-fg-subtle)] px-1 mt-4">
            {icon}
            <span>{title}</span>
            <span className="ml-auto bg-[var(--vscode-list-hover)] text-[var(--vscode-fg)] text-[10px] px-1.5 rounded-full min-w-[1.2rem] text-center">
                {count}
            </span>
        </div>
    );
}

function EmptyState({ text }) {
    return (
        <div className="p-4 text-center border border-dashed border-[var(--vscode-sidebar-border)] rounded-[6px]">
            <span className="text-xs text-[var(--vscode-fg-subtle)] italic">{text}</span>
        </div>
    );
}
