import { useEffect, useRef, useState } from 'react';
import { Save, ChevronDown, Sparkles } from 'lucide-react';
import { cn } from '../ui/core';

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
                    'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors',
                    disabled
                        ? 'bg-ink-100 text-ink-400'
                        : 'bg-primary text-white hover:bg-primary-hover'
                )}
                title="保存"
            >
                <Save size={14} />
                <span>{busy ? '保存中...' : '保存'}</span>
                <ChevronDown size={12} className={cn('transition-transform', open && 'rotate-180')} />
            </button>

            {open && !disabled && (
                <div className="absolute right-0 top-full mt-2 w-44 bg-surface border border-border rounded-lg shadow-lg py-1 z-50 animate-in fade-in slide-in-from-top-2">
                    <button
                        onClick={() => handleAction('analyze')}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-ink-700 hover:bg-ink-50 transition-colors"
                    >
                        <Sparkles size={14} className="text-primary" />
                        <span>分析并保存</span>
                    </button>
                    <button
                        onClick={() => handleAction('save')}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-ink-700 hover:bg-ink-50 transition-colors"
                    >
                        <Save size={14} className="text-ink-400" />
                        <span>仅保存</span>
                    </button>
                </div>
            )}
        </div>
    );
}
