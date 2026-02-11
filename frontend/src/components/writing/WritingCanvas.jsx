
import React from 'react';
import { cn } from '../ui/core';

/**
 * WritingCanvas - 写作画布
 * 提供正文展示与排版容器。
 */
export const WritingCanvas = ({ children, className, ...props }) => {
    return (
        <div className="flex-1 h-full overflow-y-auto relative bg-[var(--vscode-bg)] scroll-smooth" {...props}>
            <div className={cn(
                "max-w-[850px] mx-auto min-h-screen my-8 p-12",
                className
            )}>
                <article className="prose prose-lg prose-slate max-w-none font-serif leading-relaxed text-[var(--vscode-fg)] empty:before:content-['开始写作...'] empty:before:text-[var(--vscode-fg-subtle)]">
                    {children}
                </article>
            </div>

            {/* Bottom padding for scroll comfort */}
            <div className="h-[30vh]" />
        </div>
    );
};
