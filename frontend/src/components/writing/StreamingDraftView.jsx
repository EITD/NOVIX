/**
 * 文枢 WenShape - 深度上下文感知的智能体小说创作系统
 * WenShape - Deep Context-Aware Agent-Based Novel Writing System
 *
 * Copyright © 2025-2026 WenShape Team
 * License: PolyForm Noncommercial License 1.0.0
 */

import React from 'react';
import { cn } from '../ui/core';

/**
 * 流式草稿显示组件 - 实时展示生成中的文本内容
 *
 * Displays streaming draft content in real-time without progress percentage indicators
 * to minimize visual noise during active generation. Features a blinking cursor to
 * indicate ongoing generation status.
 *
 * @component
 * @example
 * return (
 *   <StreamingDraftView
 *     content="Generated text here..."
 *     active={true}
 *     className="custom-class"
 *   />
 * )
 *
 * @param {Object} props - Component props
 * @param {string} [props.content=''] - 流式文本内容 / Streaming text content to display
 * @param {boolean} [props.active=false] - 是否正在生成中 / Whether generation is in progress
 * @param {string} [props.className=''] - 自定义样式类名 / Additional CSS classes
 * @returns {JSX.Element} 流式草稿视图 / Streaming draft view element
 */
const StreamingDraftView = ({ content = '', active = false, className = '' }) => {
    return (
        <div className={cn(
            "flex flex-col w-full h-full border-none bg-transparent",
            className
        )}>
            {/*
              ======================================================================
              流式内容区域 / Streaming content area
              ======================================================================
              使用 whitespace-pre-wrap 保留格式，break-words 处理长词
              Uses whitespace-pre-wrap to preserve formatting, break-words for long lines
            */}
            <div className="flex-1 overflow-y-auto editor-scrollbar">
                <p className="whitespace-pre-wrap break-words font-serif text-base leading-relaxed text-[var(--vscode-fg)]">
                    {content}
                    {active && (
                        /* 生成指示器：闪烁光标 / Generation indicator: blinking cursor */
                        <span className="inline-block w-2 h-4 bg-[var(--vscode-fg-subtle)]/80 ml-1 align-middle animate-pulse" />
                    )}
                </p>
            </div>
        </div>
    );
};

export default StreamingDraftView;
