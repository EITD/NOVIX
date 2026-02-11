import React from 'react';
import { useIDE } from '../../context/IDEContext';
import { Folder, Save, AlertCircle, FileText, Bell } from 'lucide-react';

/**
 * StatusBar - 底部状态栏
 * 展示项目、保存状态与光标信息。
 */
export function StatusBar() {
    const { state } = useIDE();
    const {
        activeProjectId,
        wordCount,
        selectionCount,
        cursorPosition,
        lastSavedAt,
        unsavedChanges,
        zenMode
    } = state;

    const formatTime = (date) => {
        if (!date) return '--:--';
        return new Date(date).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (zenMode) return null;

    return (
        <div className="h-7 min-h-[28px] bg-[var(--vscode-sidebar-bg)] border-t border-[var(--vscode-sidebar-border)] text-[var(--vscode-fg-subtle)] flex items-center justify-between px-2 text-[11px] select-none flex-shrink-0 z-50">
            <div className="flex items-center gap-1">
                {activeProjectId && (
                    <button className="flex items-center gap-1.5 px-2 h-full hover:bg-[var(--vscode-list-hover)] rounded-[6px] transition-colors">
                        <Folder size={12} className="text-[var(--vscode-fg-subtle)]" />
                        <span className="max-w-[120px] truncate">{activeProjectId}</span>
                    </button>
                )}

                <button className="flex items-center gap-1.5 px-2 h-full hover:bg-[var(--vscode-list-hover)] rounded-[6px] transition-colors">
                    {unsavedChanges ? (
                        <>
                            <AlertCircle size={12} className="text-amber-600" />
                            <span className="text-[var(--vscode-fg)]">未保存</span>
                        </>
                    ) : lastSavedAt ? (
                        <>
                            <Save size={12} className="text-emerald-600" />
                            <span className="text-[var(--vscode-fg)]">已保存 {formatTime(lastSavedAt)}</span>
                        </>
                    ) : (
                        <>
                            <Save size={12} className="text-[var(--vscode-fg-subtle)]" />
                            <span className="text-[var(--vscode-fg-subtle)]">--:--</span>
                        </>
                    )}
                </button>
            </div>

            <div className="flex items-center gap-1">
                <button className="flex items-center gap-1.5 px-2 h-full hover:bg-[var(--vscode-list-hover)] rounded-[6px] transition-colors">
                    <FileText size={12} className="text-[var(--vscode-fg-subtle)]" />
                    <span className="text-[var(--vscode-fg)]">{wordCount.toLocaleString()} 字</span>
                    {selectionCount > 0 && (
                        <span className="text-[var(--vscode-fg-subtle)]">（选中 {selectionCount.toLocaleString()} 字）</span>
                    )}
                </button>

                <button className="flex items-center gap-1.5 px-2 h-full hover:bg-[var(--vscode-list-hover)] rounded-[6px] transition-colors font-mono">
                    <span className="text-[var(--vscode-fg-subtle)]">Ln {cursorPosition.line}, Col {cursorPosition.column}</span>
                </button>

                <button className="flex items-center gap-1.5 px-2 h-full hover:bg-[var(--vscode-list-hover)] rounded-[6px] transition-colors">
                    <Bell size={12} className="text-[var(--vscode-fg-subtle)]" />
                </button>
            </div>
        </div>
    );
}
