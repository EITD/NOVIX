import React, { useState } from 'react';
import { useIDE } from '../../../context/IDEContext';
import { Search, Loader2 } from 'lucide-react';
import { Input } from '../../ui/core';
import { evidenceAPI } from '../../../api';

/**
 * SearchPanel - 全局搜索面板
 * 负责搜索输入与结果占位展示。
 */
export default function SearchPanel() {
    const [query, setQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [results, setResults] = useState([]);
    const [error, setError] = useState('');
    const { state } = useIDE();
    const projectId = state.activeProjectId;

    const handleSearch = async (e) => {
        e.preventDefault();
        if (!query.trim() || !projectId) return;

        setIsSearching(true);
        setError('');
        try {
            const resp = await evidenceAPI.search(projectId, {
                queries: [query.trim()],
                limit: 12,
                include_text_chunks: true
            });
            setResults(resp.data?.items || []);
        } catch (err) {
            setResults([]);
            setError(err?.message || '搜索失败');
        } finally {
            setIsSearching(false);
        }
    };

    return (
        <div className="h-full flex flex-col bg-[var(--vscode-bg)] text-[var(--vscode-fg)]">
            <div className="p-3 border-b border-[var(--vscode-sidebar-border)] bg-[var(--vscode-sidebar-bg)]">
                <form onSubmit={handleSearch} className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-[var(--vscode-fg-subtle)] opacity-70" />
                    <Input
                        placeholder="全局搜索..."
                        className="pl-8 h-9 text-xs"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                </form>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
                {isSearching ? (
                    <div className="flex flex-col items-center justify-center text-[var(--vscode-fg-subtle)] py-8 gap-2 text-center">
                        <Loader2 size={16} className="animate-spin" />
                        <span className="text-xs">搜索中...</span>
                    </div>
                ) : error ? (
                    <div className="text-xs text-red-400 text-center">{error}</div>
                ) : results.length > 0 ? (
                    <div className="space-y-2">
                        {results.map((item, idx) => (
                            <div
                                key={`${item.id || item.type}-${idx}`}
                                className="p-3 rounded-[6px] border border-[var(--vscode-sidebar-border)] bg-[var(--vscode-input-bg)]"
                            >
                                <div className="flex items-center justify-between text-[10px] text-[var(--vscode-fg-subtle)] mb-1">
                                    <span className="uppercase tracking-wider">{item.type}</span>
                                    <span className="font-mono">{item.score?.toFixed ? item.score.toFixed(2) : item.score}</span>
                                </div>
                                <div className="text-xs text-[var(--vscode-fg)] leading-relaxed">{item.text}</div>
                                {item.source && (
                                    <div className="text-[10px] text-[var(--vscode-fg-subtle)] mt-1 font-mono">
                                        {JSON.stringify(item.source)}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-xs text-[var(--vscode-fg-subtle)] text-center">
                        在这里搜索项目内容、角色和设定。
                        <br /><br />
                        请输入关键词开始搜索。
                    </div>
                )}
            </div>
        </div>
    );
}
