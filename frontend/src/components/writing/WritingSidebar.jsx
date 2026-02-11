import React from 'react';
import { cn, Card, Button } from '../ui/core';
import { X, MessageSquare, Terminal } from 'lucide-react';

/**
 * WritingSidebar - 写作侧栏
 * 负责侧栏内容承载与关闭入口。
 */
export const WritingSidebar = ({ isOpen, onClose, title, children, icon: Icon = Terminal }) => {
    return (
        <div
            className={cn(
                "flex flex-col h-full bg-[var(--vscode-sidebar-bg)] border-l border-[var(--vscode-sidebar-border)] transform transition-transform duration-300 ease-in-out font-sans z-20",
                // isOpen ? "translate-x-0" : "translate-x-full" // Handled by Layout
            )}
        >
            <div className="flex flex-col h-full">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-[var(--vscode-sidebar-border)] bg-[var(--vscode-sidebar-bg)]">
                    <div className="flex items-center gap-2 font-medium text-[var(--vscode-fg)]">
                        <Icon size={16} className="text-[var(--vscode-fg-subtle)]" />
                        <span>{title}</span>
                    </div>
                    <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 text-[var(--vscode-fg-subtle)] hover:text-[var(--vscode-fg)]">
                        <X size={16} />
                    </Button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                    {children}
                </div>
            </div>
        </div>
    );
};
