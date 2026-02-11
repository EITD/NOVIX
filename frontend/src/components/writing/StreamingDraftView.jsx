import React from 'react';
import { cn } from '../ui/core';

/**
 * StreamingDraftView - 流式草稿展示
 * 展示生成中的文本与进度。
 */
const StreamingDraftView = ({ content = '', progress = 0, active = false, className = '' }) => {
    const safeProgress = Math.min(100, Math.max(0, progress || 0));

    return (
        <div className={cn(
            "flex flex-col w-full h-full border-none bg-transparent",
            className
        )}>
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                <p className="whitespace-pre-wrap break-words font-serif text-base leading-relaxed text-[var(--vscode-fg)]">
                    {content}
                    {active && (
                        <span className="inline-block w-2 h-4 bg-[var(--vscode-fg-subtle)]/80 ml-1 align-middle animate-pulse" />
                    )}
                </p>
            </div>

            <div className="mt-3 flex items-center gap-3">
                <div className="text-[10px] text-[var(--vscode-fg-subtle)] font-mono">{safeProgress}%</div>
                <div className="flex-1 h-1 bg-[var(--vscode-list-hover)] rounded-full overflow-hidden">
                    <div
                        className="h-full bg-[var(--vscode-focus-border)] transition-all duration-150"
                        style={{ width: `${safeProgress}%` }}
                    />
                </div>
            </div>
        </div>
    );
};

export default StreamingDraftView;
