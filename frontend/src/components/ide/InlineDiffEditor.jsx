/**
 * InlineDiffEditor Component / 内联差异编辑器组件
 * 
 * Shows COMPLETE original content with diff changes embedded INLINE at exact positions
 * Like Cursor/Copilot: see full document with red/green at modified locations
 * 类似 Cursor/Copilot：完整正文中，在修改位置直接嵌入红绿显示
 */

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Check, X, Plus, Minus } from 'lucide-react';

const InlineDiffEditor = ({
    originalContent = "",    // Original text (FULL document)
    revisedContent = "",     // Revised text (FULL document)
    hunks = [],              // Diff hunks from backend
    stats = {},              // { additions: N, deletions: N }
    onAccept,                // Accept all changes
    onReject,                // Reject all changes
    className = ""
}) => {
    // Build merged view: original content with inline diffs
    const mergedView = useMemo(() => {
        const originalLines = originalContent.split('\n');
        const hunksMap = new Map(); // lineIndex -> { deleted: string, added: string }

        // If no hunks, just show original content
        if (!hunks || hunks.length === 0) {
            return originalLines.map((line, i) => ({
                type: 'unchanged',
                content: line,
                lineNo: i + 1
            }));
        }

        // Parse hunks to build a map of changes by line number
        // Unified diff format: @@ -start,count +start,count @@
        let result = [];
        let originalLineNo = 0;

        hunks.forEach(hunk => {
            // Parse header to get starting line
            const headerMatch = hunk.header?.match(/@@ -(\d+)/);
            let hunkStartLine = headerMatch ? parseInt(headerMatch[1]) - 1 : originalLineNo;

            // Add unchanged lines before this hunk
            while (originalLineNo < hunkStartLine && originalLineNo < originalLines.length) {
                result.push({
                    type: 'unchanged',
                    content: originalLines[originalLineNo],
                    lineNo: originalLineNo + 1
                });
                originalLineNo++;
            }

            // Process hunk changes
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

        // Add remaining unchanged lines after the last hunk
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
        <div className={`flex flex-col h-full bg-white rounded-lg border border-border overflow-hidden ${className}`}>
            {/* Floating Action Bar */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="sticky top-0 z-10 flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-200 shadow-sm"
            >
                <div className="flex items-center gap-4">
                    <span className="text-sm font-bold text-amber-800">
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
                        className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-md border border-red-200 transition-all hover:shadow-sm"
                    >
                        <X size={16} />
                        拒绝修改
                    </button>
                    <button
                        onClick={onAccept}
                        className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md transition-all hover:shadow-sm"
                    >
                        <Check size={16} />
                        接受修改
                    </button>
                </div>
            </motion.div>

            {/* Content Area - Full text with inline diffs */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                <div className="font-serif text-base leading-relaxed text-ink-900">
                    {mergedView.map((item, index) => {
                        if (item.type === 'unchanged') {
                            // Normal unchanged line
                            return (
                                <div key={index} className="leading-loose">
                                    {item.content}
                                </div>
                            );
                        }

                        if (item.type === 'diff') {
                            // Inline diff: deleted (red) + added (green)
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

            {/* Bottom hint */}
            <div className="px-4 py-2 border-t border-border bg-ink-50/50 text-xs text-ink-500 text-center">
                💡 <span className="text-red-600 bg-red-50 px-1 rounded line-through">红色</span> 为删除内容，
                <span className="text-green-700 bg-green-50 px-1 rounded">绿色</span> 为新增内容
            </div>
        </div>
    );
};

export default InlineDiffEditor;
