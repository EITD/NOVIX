/**
 * DiffReviewView - 差异审阅视图
 * 展示统一差异并支持逐块接受/拒绝。
 */

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '../ui/core';
import { Check, X, Plus, Minus, FileText } from 'lucide-react';

const DiffReviewView = ({
    ops = [],             // buildLineDiff 返回的 ops（含 context/add/delete；非 context 通常带 hunkId）
    hunks = [],           // 后端 diff 块
    stats = {},           // { additions: N, deletions: N }
    decisions = {},       // { [hunkId]: 'accepted' | 'rejected' }
    onAcceptAll,          // 接受全部
    onRejectAll,          // 拒绝全部
    onAcceptHunk,         // 接受单块
    onRejectHunk,         // 拒绝单块
    originalVersion = "v1",
    revisedVersion = "v2"
}) => {
    const segments = useMemo(() => buildInlineSegments(ops), [ops]);
    const hasChanges = (hunks?.length || 0) > 0 || segments.some((segment) => segment.type === 'change');

    if (!hasChanges) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-8 text-[var(--vscode-fg-subtle)]">
                <FileText size={48} className="mb-4 opacity-50" />
                <p className="text-sm">无修改内容</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-[var(--vscode-bg)] rounded-[6px] border border-[var(--vscode-sidebar-border)] overflow-hidden">
            {/* 头部统计 */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--vscode-sidebar-border)] bg-[var(--vscode-sidebar-bg)]">
                <div className="flex items-center gap-4">
                    <span className="text-xs font-bold text-[var(--vscode-fg)]">
                        编辑修改预览
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
                    <span className="text-[10px] text-[var(--vscode-fg-subtle)] font-mono">
                        {originalVersion} → {revisedVersion}
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={onRejectAll}
                        className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-medium text-red-600 hover:bg-red-50 rounded-[6px] border border-red-200 transition-colors"
                    >
                        <X size={12} />
                        拒绝全部
                    </button>
                    <button
                        onClick={onAcceptAll}
                        className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-medium text-white bg-green-600 hover:bg-green-700 rounded-[6px] transition-colors"
                    >
                        <Check size={12} />
                        接受全部
                    </button>
                </div>
            </div>

            {/* 内容区：在全文对应位置展示内联差异 */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                <div className="font-serif text-base leading-relaxed text-[var(--vscode-fg)] space-y-0.5">
                    {segments.map((segment, index) => {
                        if (segment.type === 'context') {
                            return (
                                <div
                                    key={`ctx-${index}`}
                                    className="leading-loose whitespace-pre-wrap break-words"
                                >
                                    {segment.content}
                                </div>
                            );
                        }

                        const decision = decisions[segment.hunkId];
                        return (
                            <InlineChangeBlock
                                key={`chg-${segment.hunkId}-${index}`}
                                decision={decision}
                                onAccept={() => onAcceptHunk?.(segment.hunkId)}
                                onReject={() => onRejectHunk?.(segment.hunkId)}
                                deletedLines={segment.deletedLines}
                                addedLines={segment.addedLines}
                            />
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

const InlineChangeBlock = ({ decision, onAccept, onReject, deletedLines = [], addedLines = [] }) => {
    const statusText = decision === 'accepted' ? '已接受' : decision === 'rejected' ? '已拒绝' : '待确认';

    return (
        <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="my-2 rounded-[6px] border border-[var(--vscode-sidebar-border)] bg-[var(--vscode-input-bg)] overflow-hidden"
        >
            <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--vscode-sidebar-border)] bg-[var(--vscode-sidebar-bg)]">
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-[var(--vscode-fg-subtle)]">差异块</span>
                    <span className={cn(
                        "text-[10px] px-2 py-0.5 rounded-full border",
                        decision === 'accepted'
                            ? "bg-green-50 text-green-700 border-green-200"
                            : decision === 'rejected'
                                ? "bg-red-50 text-red-700 border-red-200"
                                : "bg-amber-50 text-amber-700 border-amber-200"
                    )}>
                        {statusText}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={onReject}
                        className={cn(
                            "text-[10px] px-2 py-1 rounded-[6px] border transition-colors",
                            decision === 'rejected'
                                ? "bg-red-600 text-white border-red-600"
                                : "text-red-600 border-red-200 hover:bg-red-50"
                        )}
                    >
                        拒绝
                    </button>
                    <button
                        type="button"
                        onClick={onAccept}
                        className={cn(
                            "text-[10px] px-2 py-1 rounded-[6px] border transition-colors",
                            decision === 'accepted'
                                ? "bg-green-600 text-white border-green-600"
                                : "text-green-700 border-green-200 hover:bg-green-50"
                        )}
                    >
                        接受
                    </button>
                </div>
            </div>

            <div className="px-3 py-2 space-y-1">
                {deletedLines.length > 0 ? (
                    <div className="rounded-[6px] border border-red-100 bg-red-50/60 p-2">
                        {deletedLines.map((line, idx) => (
                            <div
                                key={`del-${idx}`}
                                className="text-sm text-red-700 line-through decoration-red-500 decoration-2 whitespace-pre-wrap break-words"
                            >
                                {line}
                            </div>
                        ))}
                    </div>
                ) : null}
                {addedLines.length > 0 ? (
                    <div className="rounded-[6px] border border-green-100 bg-green-50/60 p-2">
                        {addedLines.map((line, idx) => (
                            <div
                                key={`add-${idx}`}
                                className="text-sm text-green-800 whitespace-pre-wrap break-words"
                            >
                                {line}
                            </div>
                        ))}
                    </div>
                ) : null}
            </div>
        </motion.div>
    );
};

const buildInlineSegments = (ops = []) => {
    const segments = [];

    let index = 0;
    while (index < ops.length) {
        const op = ops[index];
        if (op.type === 'context') {
            segments.push({ type: 'context', content: op.content });
            index += 1;
            continue;
        }

        if (op.type !== 'add' && op.type !== 'delete') {
            index += 1;
            continue;
        }

        const hunkId = op.hunkId || `hunk-unknown-${index}`;
        const deletedLines = [];
        const addedLines = [];

        while (index < ops.length) {
            const current = ops[index];
            if (current.type === 'context') break;
            if ((current.hunkId || hunkId) !== hunkId) break;

            if (current.type === 'delete') {
                deletedLines.push(current.content);
            } else if (current.type === 'add') {
                addedLines.push(current.content);
            }

            index += 1;
        }

        segments.push({ type: 'change', hunkId, deletedLines, addedLines });
    }

    return segments;
};

export default DiffReviewView;
