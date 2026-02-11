/**
 * FanfictionPanel - 同人导入面板
 * 仅做视觉一致性优化，不改变交互逻辑。
 */
import { Library } from 'lucide-react';

const FanfictionPanel = () => {
    return (
        <div className="anti-theme flex flex-col h-full bg-[var(--vscode-bg)] text-[var(--vscode-fg)]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--vscode-sidebar-border)] bg-[var(--vscode-sidebar-bg)]">
                <h2 className="text-sm font-bold flex items-center gap-2 text-[var(--vscode-fg)]">
                    <Library size={16} className="text-[var(--vscode-fg-subtle)]" />
                    <span>同人导入</span>
                </h2>
            </div>
            <div className="flex-1 p-4 text-xs text-[var(--vscode-fg-subtle)] leading-relaxed">
                请在中间栏完成同人导入：搜索、选择词条与子词条、批量提取与编辑。
            </div>
        </div>
    );
};

export default FanfictionPanel;
