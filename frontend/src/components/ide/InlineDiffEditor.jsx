/**
 * 文枢 WenShape - 深度上下文感知的智能体小说创作系统
 * WenShape - Deep Context-Aware Agent-Based Novel Writing System
 *
 * Copyright © 2025-2026 WenShape Team
 * License: PolyForm Noncommercial License 1.0.0
 *
 * 模块说明 / Module Description:
 *   内联差异编辑器 - 在完整正文中嵌入修改位置的新增/删除提示
 *   Inline diff editor embedding add/delete indicators within full text context.
 */

/**
 * 内联差异编辑器 - 在原文中嵌入修改提示的差异编辑界面
 *
 * Displays original content with embedded inline diff indicators (additions and deletions)
 * for contextual review. Allows users to accept or reject modifications.
 *
 * @component
 * @example
 * return (
 *   <InlineDiffEditor
 *     originalContent="Original text..."
 *     revisedContent="Revised text..."
 *     hunks={diffHunks}
 *     onAccept={handleAccept}
 *     onReject={handleReject}
 *   />
 * )
 *
 * @param {Object} props - Component props
 * @param {string} [props.originalContent=''] - 原始全文 / Original full text
 * @param {string} [props.revisedContent=''] - 修订全文 / Revised full text
 * @param {Array} [props.hunks=[]] - 后端返回的 diff 块 / Backend diff chunks
 * @param {Object} [props.stats={}] - 统计信息 / Statistics { additions, deletions }
 * @param {Function} [props.onAccept] - 接受回调 / Accept callback
 * @param {Function} [props.onReject] - 拒绝回调 / Reject callback
 * @param {string} [props.className=''] - 自定义样式类名 / Additional CSS classes
 * @returns {JSX.Element} 内联差异编辑器 / Inline diff editor element
 */

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Check, X, Plus, Minus } from 'lucide-react';

const InlineDiffEditor = ({
    originalContent = "",    // 原始全文
    revisedContent = "",     // 修订全文
    hunks = [],              // 后端返回的 diff 块
    stats = {},              // { additions: N, deletions: N }
    onAccept,                // 接受修改
    onReject,                // 拒绝修改
    className = ""
}) => {
    // 构建内联合并视图
    const mergedView = useMemo(() => {
        const originalLines = originalContent.split('\n');
        const hunksMap = new Map(); // lineIndex -> { deleted: string, added: string }

        // 无差异时直接展示原文
        if (!hunks || hunks.length === 0) {
            return originalLines.map((line, i) => ({
                type: 'unchanged',
                content: line,
                lineNo: i + 1
            }));
        }

        // 解析差异块（统一 diff 格式：@@ -start,count +start,count @@）
        let result = [];
        let originalLineNo = 0;

        hunks.forEach(hunk => {
            // 解析起始行
            const headerMatch = hunk.header?.match(/@@ -(\d+)/);
            let hunkStartLine = headerMatch ? parseInt(headerMatch[1]) - 1 : originalLineNo;

            // 追加变更前的未修改行
            while (originalLineNo < hunkStartLine && originalLineNo < originalLines.length) {
                result.push({
                    type: 'unchanged',
                    content: originalLines[originalLineNo],
                    lineNo: originalLineNo + 1
                });
                originalLineNo++;
            }

            // 处理变更块
            if (hunk.changes) {
                let pendingDeletes = [];
                let pendingAdds = [];

                const flushPending = () => {
                    if (pendingDeletes.length > 0 || pendingAdds.length > 0) {
                        result.push({
                            type: 'diff',
                            deleted: pendingDeletes.join('\n'),
                            added: pendingAdds.join('\n'),
                            lineNo: originalLineNo
                        });
                        pendingDeletes = [];
                        pendingAdds = [];
                    }
                };

                hunk.changes.forEach(change => {
                    if (change.type === 'delete') {
                        pendingDeletes.push(change.content);
                        originalLineNo++;
                    } else if (change.type === 'add') {
                        pendingAdds.push(change.content);
                    } else if (change.type === 'context') {
                        flushPending();
                        result.push({
                            type: 'unchanged',
                            content: change.content,
                            lineNo: originalLineNo + 1
                        });
                        originalLineNo++;
                    }
                });

                flushPending();
            }
        });

        // 追加剩余未修改行
        while (originalLineNo < originalLines.length) {
            result.push({
                type: 'unchanged',
                content: originalLines[originalLineNo],
                lineNo: originalLineNo + 1
            });
            originalLineNo++;
        }

        return result;
    }, [originalContent, hunks]);

    return (
        <div className={`flex flex-col h-full bg-[var(--vscode-bg)] rounded-[6px] border border-[var(--vscode-sidebar-border)] overflow-hidden ${className}`}>
            {/* 顶部操作栏 */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="sticky top-0 z-10 flex items-center justify-between px-4 py-2.5 bg-[var(--vscode-sidebar-bg)] border-b border-[var(--vscode-sidebar-border)]"
            >
                <div className="flex items-center gap-4">
                    <span className="text-sm font-bold text-[var(--vscode-fg)]">
                        ✨ AI 修改建议
                    </span>
                    <div className="flex items-center gap-3 text-xs">
                        <span className="flex items-center gap-1 text-green-600 font-medium">
                            <Plus size={14} />
                            <span>{stats.additions || 0} 新增</span>
                        </span>
                        <span className="flex items-center gap-1 text-red-500 font-medium">
                            <Minus size={14} />
                            <span>{stats.deletions || 0} 删除</span>
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={onReject}
                        className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-[6px] border border-red-200 transition-colors"
                    >
                        <X size={16} />
                        拒绝修改
                    </button>
                    <button
                        onClick={onAccept}
                        className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-[6px] transition-colors"
                    >
                        <Check size={16} />
                        接受修改
                    </button>
                </div>
            </motion.div>

            {/* 内容区 */}
            <div className="flex-1 overflow-y-scroll editor-scrollbar p-6">
                <div className="font-serif text-base leading-relaxed text-[var(--vscode-fg)]">
                    {mergedView.map((item, index) => {
                        if (item.type === 'unchanged') {
                            return (
                                <div key={index} className="leading-loose">
                                    {item.content}
                                </div>
                            );
                        }

                        if (item.type === 'diff') {
                            return (
                                <div key={index} className="my-2">
                                    {item.deleted && (
                                        <div className="inline-block bg-red-50 border-l-4 border-red-400 px-3 py-1 my-1 rounded-r">
                                            <span className="text-red-700 line-through decoration-red-500 decoration-2">
                                                {item.deleted}
                                            </span>
                                        </div>
                                    )}
                                    {item.deleted && item.added && <br />}
                                    {item.added && (
                                        <div className="inline-block bg-green-50 border-l-4 border-green-400 px-3 py-1 my-1 rounded-r">
                                            <span className="text-green-800">
                                                {item.added}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            );
                        }

                        return null;
                    })}
                </div>
            </div>

            {/* 底部提示 */}
            <div className="px-4 py-2 border-t border-[var(--vscode-sidebar-border)] bg-[var(--vscode-sidebar-bg)] text-xs text-[var(--vscode-fg-subtle)] text-center">
                💡 <span className="text-red-600 bg-red-50 px-1 rounded line-through">红色</span> 为删除内容，
                <span className="text-green-700 bg-green-50 px-1 rounded">绿色</span> 为新增内容
            </div>
        </div>
    );
};

export default InlineDiffEditor;
