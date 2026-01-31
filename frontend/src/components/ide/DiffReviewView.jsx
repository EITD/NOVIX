/**
 * DiffReviewView Component / 差异审阅视图组件
 * 
 * Displays unified diff with red/green highlighting like VS Code
 * 显示统一差异，使用红/绿高亮，类似 VS Code
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../ui/core';
import { Check, X, ChevronDown, ChevronRight, Plus, Minus, FileText } from 'lucide-react';

const DiffReviewView = ({
    hunks = [],           // Array of diff hunks from backend
    stats = {},           // { additions: N, deletions: N }
    decisions = {},       // { [hunkId]: 'accepted' | 'rejected' }
    onAcceptAll,          // Callback to accept all changes
    onRejectAll,          // Callback to reject all changes
    onAcceptHunk,         // Callback to accept single hunk
    onRejectHunk,         // Callback to reject single hunk
    originalVersion = "v1",
    revisedVersion = "v2"
}) => {
    const [expandedHunks, setExpandedHunks] = useState(new Set(hunks.map((_, i) => i)));

    const toggleHunk = (index) => {
        const newExpanded = new Set(expandedHunks);
        if (newExpanded.has(index)) {
            newExpanded.delete(index);
        } else {
            newExpanded.add(index);
        }
        setExpandedHunks(newExpanded);
    };

    if (!hunks || hunks.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-8 text-ink-400">
                <FileText size={48} className="mb-4 opacity-50" />
                <p className="text-sm">无修改内容</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-background rounded-lg border border-border overflow-hidden">
            {/* Header with stats */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-ink-50/50">
                <div className="flex items-center gap-4">
                    <span className="text-xs font-bold text-ink-700">
                        📝 编辑修改预览
                    </span>
                    <div className="flex items-center gap-3 text-[10px]">
                        <span className="flex items-center gap-1 text-green-600">
                            <Plus size={12} />
                            <span className="font-mono">{stats.additions || 0} 新增</span>
                        </span>
                        <span className="flex items-center gap-1 text-red-500">
                            <Minus size={12} />
                            <span className="font-mono">{stats.deletions || 0} 删除</span>
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={onRejectAll}
                        className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-medium text-red-600 hover:bg-red-50 rounded-md border border-red-200 transition-colors"
                    >
                        <X size={12} />
                        拒绝全部
                    </button>
                    <button
                        onClick={onAcceptAll}
                        className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-medium text-white bg-green-600 hover:bg-green-700 rounded-md transition-colors"
                    >
                        <Check size={12} />
                        接受全部
                    </button>
                </div>
            </div>

            {/* Diff Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {hunks.map((hunk, hunkIndex) => {
                    const decision = decisions[hunk.id];
                    const statusBadge = decision === 'accepted'
                        ? '已接受'
                        : decision === 'rejected'
                            ? '已拒绝'
                            : '待确认';

                    const { beforeText, afterText } = buildComparisonText(hunk);

                    return (
                    <div key={hunkIndex} className="border-b border-border last:border-b-0">
                        {/* Hunk Header */}
                        <button
                            onClick={() => toggleHunk(hunkIndex)}
                            className="w-full flex items-center justify-between px-4 py-2 bg-blue-50/50 hover:bg-blue-50 text-left transition-colors"
                        >
                            <div className="flex items-center gap-2">
                                {expandedHunks.has(hunkIndex) ? (
                                    <ChevronDown size={14} className="text-ink-400" />
                                ) : (
                                    <ChevronRight size={14} className="text-ink-400" />
                                )}
                                <span className="text-[10px] font-mono text-blue-600">
                                    {hunk.header || `变更区块 ${hunkIndex + 1}`}
                                </span>
                                <span className="text-[10px] text-ink-400">
                                    {statusBadge}
                                </span>
                            </div>

                            <div className="flex items-center gap-1">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onRejectHunk?.(hunk.id);
                                    }}
                                    className="p-1 text-red-500 hover:bg-red-100 rounded transition-colors"
                                    title="拒绝此修改"
                                >
                                    <X size={12} />
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onAcceptHunk?.(hunk.id);
                                    }}
                                    className="p-1 text-green-600 hover:bg-green-100 rounded transition-colors"
                                    title="接受此修改"
                                >
                                    <Check size={12} />
                                </button>
                            </div>
                        </button>

                        {/* Hunk Content */}
                        <AnimatePresence>
                            {expandedHunks.has(hunkIndex) && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.15 }}
                                    className="overflow-hidden"
                                >
                                    <div className="px-4 py-3 space-y-3 bg-white">
                                        {hunk.reason && (
                                            <div className="text-[11px] text-ink-500 bg-amber-50 border border-amber-100 rounded-md px-3 py-2">
                                                <span className="font-semibold text-amber-700">修改原因：</span>
                                                <span>{hunk.reason}</span>
                                            </div>
                                        )}

                                        <div className="grid grid-cols-1 gap-3">
                                            <div className="rounded-md border border-red-100 bg-red-50/60 p-3">
                                                <div className="text-[10px] font-semibold text-red-600 mb-2">修改前</div>
                                                <pre className="font-mono text-xs text-ink-700 whitespace-pre-wrap break-words">
                                                    {beforeText || '（无内容）'}
                                                </pre>
                                            </div>
                                            <div className="rounded-md border border-green-100 bg-green-50/60 p-3">
                                                <div className="text-[10px] font-semibold text-green-600 mb-2">修改后</div>
                                                <pre className="font-mono text-xs text-ink-700 whitespace-pre-wrap break-words">
                                                    {afterText || '（无内容）'}
                                                </pre>
                                            </div>
                                        </div>

                                        <div className="font-mono text-xs border border-border rounded-md overflow-hidden">
                                            {hunk.changes?.map((change, changeIndex) => (
                                                <DiffLine
                                                    key={changeIndex}
                                                    type={change.type}
                                                    content={change.content}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                    );
                })}
            </div>

            {/* Footer */}
            <div className="px-4 py-2 border-t border-border bg-ink-50/30 text-[10px] text-ink-400">
                比较: <span className="font-mono">{originalVersion}</span> → <span className="font-mono">{revisedVersion}</span>
            </div>
        </div>
    );
};

// Individual diff line component
const DiffLine = ({ type, content }) => {
    const lineStyles = {
        add: "bg-green-50 text-green-800 border-l-2 border-green-500",
        delete: "bg-red-50 text-red-800 border-l-2 border-red-500 line-through opacity-70",
        context: "bg-transparent text-ink-600 border-l-2 border-transparent"
    };

    const prefixStyles = {
        add: "text-green-600 select-none",
        delete: "text-red-500 select-none",
        context: "text-ink-300 select-none"
    };

    const prefix = {
        add: "+",
        delete: "-",
        context: " "
    };

    return (
        <div className={cn(
            "flex px-4 py-0.5 hover:bg-ink-50/50 transition-colors",
            lineStyles[type]
        )}>
            <span className={cn("w-4 shrink-0 text-center", prefixStyles[type])}>
                {prefix[type]}
            </span>
            <span className="whitespace-pre-wrap break-all">
                {content}
            </span>
        </div>
    );
};

const buildComparisonText = (hunk) => {
    const beforeLines = [];
    const afterLines = [];

    hunk.changes?.forEach((change) => {
        if (change.type === "context" || change.type === "delete") {
            beforeLines.push(change.content);
        }
        if (change.type === "context" || change.type === "add") {
            afterLines.push(change.content);
        }
    });

    return {
        beforeText: beforeLines.join("\n"),
        afterText: afterLines.join("\n")
    };
};

export default DiffReviewView;
