import React from 'react';
import { Library } from 'lucide-react';

const FanfictionPanel = () => {
    return (
        <div className="flex flex-col h-full bg-surface text-ink-900">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <h2 className="text-sm font-bold flex items-center gap-2">
                    <Library size={16} className="text-primary" />
                    <span>同人导入</span>
                </h2>
            </div>
            <div className="flex-1 p-4 text-xs text-ink-500 leading-relaxed">
                请在中间栏完成同人导入：搜索、选择词条与子词条、批量提取与编辑。
            </div>
        </div>
    );
};

export default FanfictionPanel;
