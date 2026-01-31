import React from 'react';
import { cn } from '../ui/core';

const StreamingDraftView = ({ content = '', progress = 0, active = false, className = '' }) => {
    const safeProgress = Math.min(100, Math.max(0, progress || 0));

    return (
        <div className={cn(
            "flex flex-col w-full h-full border-none bg-transparent",
            className
        )}>
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                <p className="whitespace-pre-wrap break-words font-serif text-base leading-relaxed text-ink-900">
                    {content}
                    {active && (
                        <span className="inline-block w-2 h-4 bg-ink-400/80 ml-1 align-middle animate-pulse" />
                    )}
                </p>
            </div>

            <div className="mt-3 flex items-center gap-3">
                <div className="text-[10px] text-ink-400 font-mono">{safeProgress}%</div>
                <div className="flex-1 h-1 bg-ink-100 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-primary transition-all duration-150"
                        style={{ width: `${safeProgress}%` }}
                    />
                </div>
            </div>
        </div>
    );
};

export default StreamingDraftView;
