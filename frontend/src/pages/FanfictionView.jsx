import { useState } from 'react';
import { motion } from 'framer-motion';
import { useParams, useNavigate } from 'react-router-dom';
import { Search, Link as LinkIcon, Loader, CheckCircle, Library, ChevronRight, Check, ArrowLeft } from 'lucide-react';
import axios from 'axios';

const API_BASE = '/api';

/**
 * FanfictionView - 同人导入
 * 用于从 Wiki 站点检索并导入角色/设定卡，不改变接口与流程语义。
 */

export default function FanfictionView({ embedded = false, onClose }) {
    const { projectId } = useParams();
    const navigate = useNavigate();

    const [step, setStep] = useState(1);

    const [searchQuery, setSearchQuery] = useState('');
    const [searchEngine, setSearchEngine] = useState('moegirl');
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);

    const [selectedUrl, setSelectedUrl] = useState(null);
    const [pagePreview, setPagePreview] = useState(null);
    const [selectedLinks, setSelectedLinks] = useState([]);
    const [previewing, setPreviewing] = useState(false);
    const [historyStack, setHistoryStack] = useState([]);

    const [proposals, setProposals] = useState([]);
    const [extracting, setExtracting] = useState(false);
    const [acceptedProposals, setAcceptedProposals] = useState(new Set());

    const handleSearch = async () => {
        if (!searchQuery.trim()) return;

        setSearching(true);
        try {
            const response = await axios.post(`${API_BASE}/fanfiction/search`, {
                query: searchQuery,
                engine: searchEngine
            });
            setSearchResults(response.data);
        } catch (error) {
            console.error('Search failed:', error);
            alert('搜索失败，请重试');
        } finally {
            setSearching(false);
        }
    };

    const handleSelectResult = async (url) => {
        setSelectedUrl(url);
        setPreviewing(true);

        try {
            const response = await axios.post(`${API_BASE}/fanfiction/preview`, { url });

            if (!response.data.success) {
                alert(`页面加载失败: ${response.data.error || '未知错误'}`);
                setPreviewing(false);
                return;
            }

            setPagePreview(response.data);
            if (response.data.content || response.data.links.length > 0) {
                setStep(2);
            } else {
                alert('该页面没有可提取的内容');
            }
        } catch (error) {
            console.error('[Fanfiction] Preview failed:', error);
            alert('加载页面失败，请检查网络连接');
        } finally {
            setPreviewing(false);
        }
    };

    const handleNavigate = (url) => {
        if (!url) return;
        setHistoryStack(prev => [...prev, {
            title: pagePreview?.title || '上一页',
            url: selectedUrl
        }]);
        handleSelectResult(url);
    };

    const handleBack = () => {
        if (historyStack.length > 0) {
            const prev = historyStack[historyStack.length - 1];
            setHistoryStack(curr => curr.slice(0, -1));
            handleSelectResult(prev.url);
        } else {
            setStep(1);
            setPagePreview(null);
            setSelectedLinks([]);
            setHistoryStack([]);
        }
    };

    const toggleLink = (linkUrl) => {
        setSelectedLinks(prev =>
            prev.includes(linkUrl)
                ? prev.filter(u => u !== linkUrl)
                : [...prev, linkUrl]
        );
    };

    const handleExtractFromLinks = async () => {
        setExtracting(true);
        setProposals([]);
        try {
            const response = await axios.post(`${API_BASE}/fanfiction/extract/batch`, {
                project_id: projectId,
                urls: selectedLinks
            });

            if (response.data.success) {
                const nextProposals = (response.data.proposals || []).map((item) => ({
                    name: item.name || '',
                    type: item.type || 'Character',
                    description: item.description || '',
                    source_url: item.source_url || ''
                }));
                setProposals(nextProposals);
                setStep(3);
            } else {
                alert(`提取失败: ${response.data.error}`);
            }

        } catch (error) {
            console.error('Extraction failed:', error);
            alert('提取失败，请查看控制台');
        } finally {
            setExtracting(false);
        }
    };

    const extractCardsFromUrl = async (url) => {
        if (!url) return;
        setExtracting(true);
        try {
            const response = await axios.post(`${API_BASE}/fanfiction/extract`, {
                project_id: projectId,
                url
            });

            if (response.data.success) {
                const nextProposals = (response.data.proposals || []).map((item) => ({
                    name: item.name || '',
                    type: item.type || 'Character',
                    description: item.description || '',
                    source_url: item.source_url || url
                }));
                setProposals(nextProposals);
                setStep(3);
            }
        } catch (error) {
            console.error('Extraction failed:', error);
            alert('提取失败');
        } finally {
            setExtracting(false);
        }
    };

    const handleAcceptProposal = async (proposal, index) => {
        if (!proposal.name || !proposal.name.trim()) {
            alert('名称不能为空');
            return;
        }
        try {
            if (proposal.type === 'Character') {
                await axios.post(`${API_BASE}/projects/${projectId}/cards/characters`, {
                    name: proposal.name,
                    description: proposal.description || ''
                });
            } else if (proposal.type === 'World') {
                await axios.post(`${API_BASE}/projects/${projectId}/cards/world`, {
                    name: proposal.name,
                    description: proposal.description || ''
                });
            }

            setAcceptedProposals(prev => new Set([...prev, index]));
        } catch (error) {
            console.error('[Fanfiction] Failed to create card:', error);
            alert(`导入失败: ${error.response?.data?.detail || error.message}`);
        }
    };

    const handleProposalChange = (index, field, value) => {
        setProposals((prev) => {
            const next = [...prev];
            next[index] = { ...next[index], [field]: value };
            return next;
        });
    };

    return (
        <div className={`${embedded ? 'h-full' : 'h-screen'} anti-theme flex flex-col bg-[var(--vscode-bg)] text-[var(--vscode-fg)]`}>
            <div className={embedded ? "p-4 border-b border-[var(--vscode-sidebar-border)] bg-[var(--vscode-sidebar-bg)]" : "p-6 border-b border-[var(--vscode-sidebar-border)] bg-[var(--vscode-sidebar-bg)]"}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Library size={embedded ? 18 : 24} className="text-[var(--vscode-focus-border)]" />
                        <div>
                            <h1 className={embedded ? "text-lg font-bold text-[var(--vscode-fg)]" : "text-2xl font-bold text-[var(--vscode-fg)]"}>同人导入</h1>
                            <p className="text-sm text-[var(--vscode-fg-subtle)]">从 Wiki 导入角色与设定卡</p>
                        </div>
                    </div>
                    {!embedded && (
                        <button
                            onClick={() => navigate(`/project/${projectId}`)}
                            className="flex items-center gap-2 px-4 py-2 rounded-[6px] border border-[var(--vscode-input-border)] hover:bg-[var(--vscode-list-hover)] transition-colors text-[var(--vscode-fg)]"
                        >
                            <ArrowLeft size={16} />
                            <span className="text-sm font-medium">返回工作区</span>
                        </button>
                    )}
                    {embedded && (
                        <button
                            onClick={onClose}
                            className="flex items-center gap-2 px-3 py-2 rounded-[6px] border border-[var(--vscode-input-border)] hover:bg-[var(--vscode-list-hover)] transition-colors text-[var(--vscode-fg)]"
                        >
                            <ArrowLeft size={14} />
                            <span className="text-sm font-medium">返回写作</span>
                        </button>
                    )}
                </div>
            </div>

            <div className="px-6 py-4 border-b border-[var(--vscode-sidebar-border)] bg-[var(--vscode-bg)]">
                <div className="flex items-center gap-4">
                    <div className={`flex items-center gap-2 ${step >= 1 ? 'text-[var(--vscode-focus-border)]' : 'text-[var(--vscode-fg-subtle)]'}`}>
                        <div className="w-8 h-8 rounded-full bg-[var(--vscode-list-hover)] flex items-center justify-center font-bold text-[var(--vscode-fg)]">1</div>
                        <span className="text-sm">搜索</span>
                    </div>
                    <div className="flex-1 h-px bg-[var(--vscode-sidebar-border)]" />
                    <div className={`flex items-center gap-2 ${step >= 2 ? 'text-[var(--vscode-focus-border)]' : 'text-[var(--vscode-fg-subtle)]'}`}>
                        <div className="w-8 h-8 rounded-full bg-[var(--vscode-list-hover)] flex items-center justify-center font-bold text-[var(--vscode-fg)]">2</div>
                        <span className="text-sm">筛选</span>
                    </div>
                    <div className="flex-1 h-px bg-[var(--vscode-sidebar-border)]" />
                    <div className={`flex items-center gap-2 ${step >= 3 ? 'text-[var(--vscode-focus-border)]' : 'text-[var(--vscode-fg-subtle)]'}`}>
                        <div className="w-8 h-8 rounded-full bg-[var(--vscode-list-hover)] flex items-center justify-center font-bold text-[var(--vscode-fg)]">3</div>
                        <span className="text-sm">确认</span>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
                {step === 1 && (
                    <div className="max-w-2xl mx-auto mt-12">
                        <div className="text-center mb-8">
                            <h2 className="text-xl font-bold text-[var(--vscode-fg)] mb-2">输入作品名称</h2>
                            <p className="text-sm text-[var(--vscode-fg-subtle)]">例如：封神榜、哈利波特、秦时明月</p>
                        </div>

                        <div className="flex gap-4 mb-4 justify-center">
                            <div className="flex items-center gap-2 p-2 rounded-[6px] bg-[var(--vscode-bg)] border border-[var(--vscode-sidebar-border)]">
                                <span className="text-sm text-[var(--vscode-fg)]">萌娘百科</span>
                            </div>
                        </div>

                        <div className="flex gap-2 mb-6">
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                placeholder="输入作品名称..."
                                className="flex-1 px-4 py-3 rounded-[6px] border border-[var(--vscode-input-border)] bg-[var(--vscode-input-bg)] text-[var(--vscode-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--vscode-focus-border)]"
                            />
                            <button
                                onClick={handleSearch}
                                disabled={searching}
                                className="px-6 py-3 bg-[var(--vscode-list-active)] text-[var(--vscode-list-active-fg)] rounded-[6px] hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
                            >
                                {searching ? <Loader size={20} className="animate-spin" /> : <Search size={20} />}
                                搜索
                            </button>
                        </div>

                        {previewing && (
                            <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
                                <div className="bg-[var(--vscode-bg)] p-6 rounded-[6px] border border-[var(--vscode-sidebar-border)] flex items-center gap-3">
                                    <Loader size={24} className="animate-spin text-[var(--vscode-focus-border)]" />
                                    <span className="text-[var(--vscode-fg)]">正在加载页面...</span>
                                </div>
                            </div>
                        )}

                        {searchResults.length > 0 && (
                            <div className="grid grid-cols-1 gap-4">
                                {searchResults.map((result, idx) => (
                                    <div
                                        key={idx}
                                        onClick={() => !previewing && handleSelectResult(result.url)}
                                        className={`p-4 border border-[var(--vscode-sidebar-border)] rounded-[6px] hover:border-[var(--vscode-focus-border)] hover:bg-[var(--vscode-list-hover)] cursor-pointer transition-colors ${previewing ? 'opacity-50 pointer-events-none' : ''}`}
                                    >
                                        <div className="flex items-start justify-between mb-2">
                                            <h3 className="font-bold text-[var(--vscode-fg)]">{result.title}</h3>
                                            <span className="text-xs px-2 py-1 bg-[var(--vscode-list-hover)] text-[var(--vscode-fg)] rounded-[4px]">{result.source}</span>
                                        </div>
                                        <p className="text-sm text-[var(--vscode-fg-subtle)] line-clamp-2">{result.snippet}</p>
                                        <div className="flex items-center gap-1 mt-2 text-xs text-[var(--vscode-fg-subtle)]">
                                            <LinkIcon size={12} />
                                            <span className="truncate">{result.url}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {step === 2 && pagePreview && (
                    <div className="max-w-4xl mx-auto">
                        <div className="mb-6 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={handleBack}
                                    className="text-[var(--vscode-fg-subtle)] hover:text-[var(--vscode-fg)] flex items-center gap-1"
                                >
                                    {historyStack.length > 0 ? '返回上一层' : '返回搜索'}
                                </button>
                                <h2 className="text-xl font-bold text-[var(--vscode-fg)]">{pagePreview.title}</h2>
                            </div>
                        </div>

                        {pagePreview.content && (
                            <div className="mb-6 p-4 bg-[var(--vscode-bg)] rounded-[6px] border border-[var(--vscode-sidebar-border)]">
                                <h3 className="font-bold text-[var(--vscode-fg)] mb-2">页面内容预览</h3>
                                <p className="text-sm text-[var(--vscode-fg-subtle)] line-clamp-4">{pagePreview.content.substring(0, 500)}...</p>
                                <button
                                    onClick={() => extractCardsFromUrl(selectedUrl)}
                                    disabled={extracting}
                                    className="mt-3 px-4 py-2 bg-[var(--vscode-list-active)] text-[var(--vscode-list-active-fg)] rounded-[6px] hover:opacity-90 disabled:opacity-50"
                                >
                                    {extracting ? '提取中...' : '直接提取此页面'}
                                </button>
                            </div>
                        )}

                        {pagePreview.links.length > 0 && (
                            <div className="mb-6">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-bold text-[var(--vscode-fg)]">选择子页面进行提取（{pagePreview.links.length} 个链接）</h3>
                                    <button
                                        onClick={handleExtractFromLinks}
                                        disabled={selectedLinks.length === 0 || extracting}
                                        className="px-4 py-2 bg-[var(--vscode-list-active)] text-[var(--vscode-list-active-fg)] rounded-[6px] hover:opacity-90 disabled:opacity-50"
                                    >
                                        {extracting ? '提取中...' : `提取选中（${selectedLinks.length}）`}
                                    </button>
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-96 overflow-y-auto">
                                    {pagePreview.links.map((link, idx) => (
                                        <div
                                            key={idx}
                                            className={`flex border rounded-[6px] overflow-hidden transition-colors ${selectedLinks.includes(link.url)
                                                ? 'border-[var(--vscode-focus-border)] bg-[var(--vscode-list-hover)]'
                                                : 'border-[var(--vscode-sidebar-border)] hover:border-[var(--vscode-focus-border)]'
                                                }`}
                                        >
                                            <div
                                                onClick={(e) => { e.stopPropagation(); toggleLink(link.url); }}
                                                className="w-10 flex items-center justify-center cursor-pointer border-r border-[var(--vscode-sidebar-border)] hover:bg-[var(--vscode-list-hover)]"
                                                title="选择提取"
                                            >
                                                <div className={`w-4 h-4 border rounded flex items-center justify-center ${selectedLinks.includes(link.url) ? 'bg-[var(--vscode-focus-border)] border-[var(--vscode-focus-border)]' : 'border-[var(--vscode-input-border)]'}`}>
                                                    {selectedLinks.includes(link.url) && <Check size={12} className="text-white" />}
                                                </div>
                                            </div>

                                            <div
                                                onClick={() => handleNavigate(link.url)}
                                                className="flex-1 p-3 cursor-pointer hover:bg-[var(--vscode-list-hover)] flex items-center justify-between group"
                                                title="点击进入查看详情"
                                            >
                                                <span className="text-sm text-[var(--vscode-fg)] truncate">{link.title}</span>
                                                <ChevronRight size={14} className="text-[var(--vscode-fg-subtle)] opacity-0 group-hover:opacity-100" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {(pagePreview.success === false || (!pagePreview.content && pagePreview.links.length === 0)) && (
                            <div className="text-center py-8 text-[var(--vscode-fg-subtle)]">
                                <p>{pagePreview.error || '该页面没有可提取的内容'}</p>
                                <button
                                    onClick={() => { setStep(1); setPagePreview(null); }}
                                    className="mt-4 px-4 py-2 border border-[var(--vscode-input-border)] rounded-[6px] hover:bg-[var(--vscode-list-hover)]"
                                >
                                    返回搜索
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {step === 3 && (
                    <div>
                        <div className="mb-4">
                            <h2 className="text-lg font-bold text-[var(--vscode-fg)]">确认卡片</h2>
                            <p className="text-sm text-[var(--vscode-fg-subtle)]">已提取 {proposals.length} 张卡片，请确认导入</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {proposals.map((proposal, idx) => {
                                const isAccepted = acceptedProposals.has(idx);
                                return (
                                    <div key={idx} className="p-4 border border-[var(--vscode-sidebar-border)] rounded-[6px] bg-[var(--vscode-bg)]">
                                        <div className="flex items-start justify-between mb-2">
                                            <div className="flex-1">
                                                <input
                                                    value={proposal.name}
                                                    onChange={(e) => handleProposalChange(idx, 'name', e.target.value)}
                                                    className="font-bold text-[var(--vscode-fg)] bg-transparent border-b border-transparent focus:border-[var(--vscode-focus-border)] outline-none w-full"
                                                />
                                                <div className="mt-1">
                                                    <select
                                                        value={proposal.type}
                                                        onChange={(e) => handleProposalChange(idx, 'type', e.target.value)}
                                                        className="text-xs px-2 py-0.5 rounded-[4px] border border-[var(--vscode-input-border)] text-[var(--vscode-fg)] bg-transparent"
                                                    >
                                                        <option value="Character">角色</option>
                                                        <option value="World">设定</option>
                                                    </select>
                                                </div>
                                            </div>
                                            {isAccepted && <CheckCircle size={20} className="text-emerald-600" />}
                                        </div>

                                        <textarea
                                            value={proposal.description}
                                            onChange={(e) => handleProposalChange(idx, 'description', e.target.value)}
                                            rows={4}
                                            className="text-sm text-[var(--vscode-fg)] mb-3 w-full bg-[var(--vscode-input-bg)] border border-[var(--vscode-input-border)] rounded-[6px] p-2 resize-none focus:border-[var(--vscode-focus-border)] outline-none"
                                        />

                                        {!isAccepted && (
                                            <button
                                                onClick={() => handleAcceptProposal(proposal, idx)}
                                                className="w-full px-3 py-2 bg-[var(--vscode-list-active)] text-[var(--vscode-list-active-fg)] text-sm rounded-[6px] hover:opacity-90"
                                            >
                                                采纳
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
