import { useEffect, useRef, useState } from 'react';
import { Save, ChevronDown, Sparkles } from 'lucide-react';
import { cn } from '../ui/core';

/**
 * SaveMenu - 保存菜单
 * 提供保存与分析保存的快捷入口。
 */
export default function SaveMenu({
    disabled = false,
    busy = false,
    onSaveOnly,
    onAnalyzeSave,
}) {
    const [open, setOpen] = useState(false);
    const menuRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleToggle = () => {
        if (disabled) return;
        setOpen((prev) => !prev);
    };

    const handleAction = (action) => {
        setOpen(false);
        if (action === 'save' && onSaveOnly) {
            onSaveOnly();
        }
        if (action === 'analyze' && onAnalyzeSave) {
            onAnalyzeSave();
        }
    };

    return (
        <div ref={menuRef} className="relative">
            <button
                onClick={handleToggle}
                disabled={disabled}
                className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-[6px] text-sm transition-colors',
                    disabled
                        ? 'bg-[var(--vscode-list-hover)] text-[var(--vscode-fg-subtle)]'
                        : 'bg-[var(--vscode-list-active)] text-[var(--vscode-list-active-fg)] hover:opacity-90'
                )}
                title="保存"
            >
                <Save size={14} />
                <span>{busy ? '保存中...' : '保存'}</span>
                <ChevronDown size={12} className={cn('transition-transform', open && 'rotate-180')} />
            </button>

            {open && !disabled && (
                <div className="absolute right-0 top-full mt-2 w-44 glass-panel border border-[var(--vscode-sidebar-border)] rounded-[6px] py-1 z-50 soft-dropdown">
                    <button
                        onClick={() => handleAction('analyze')}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--vscode-fg)] hover:bg-[var(--vscode-list-hover)] transition-colors"
                    >
                        <Sparkles size={14} className="text-[var(--vscode-focus-border)]" />
                        <span>分析并保存</span>
                    </button>
                    <button
                        onClick={() => handleAction('save')}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--vscode-fg)] hover:bg-[var(--vscode-list-hover)] transition-colors"
                    >
                        <Save size={14} className="text-[var(--vscode-fg-subtle)]" />
                        <span>仅保存</span>
                    </button>
                </div>
            )}
        </div>
    );
}
