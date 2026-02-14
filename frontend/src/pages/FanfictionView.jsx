/**
 * 文枢 WenShape - 深度上下文感知的智能体小说创作系统
 * WenShape - Deep Context-Aware Agent-Based Novel Writing System
 *
 * Copyright © 2025-2026 WenShape Team
 * License: PolyForm Noncommercial License 1.0.0
 *
 * 模块说明 / Module Description:
 *   同人导入页面 - 从 Wiki 站点检索并导入角色/设定卡
 */

import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Search, Link as LinkIcon, Loader, CheckCircle, Library, ChevronRight, ChevronLeft, Check, ArrowLeft } from 'lucide-react';
import axios from 'axios';
import logger from '../utils/logger';

const API_BASE = '/api';

/**
 * 同人导入组件 / Fanfiction Import Component
 *
 * 多步骤导入流程（搜索 → 预览 → 确认）用于从 Wiki 站点导入角色和世界观卡片。
 * 支持 Wiki 搜索和直接输入 URL 两种方式。
 *
 * @component
 * @param {Object} props - 组件 props
 * @param {boolean} [props.embedded=false] - 是否嵌入模式 / Embedded mode flag
 * @param {Function} [props.onClose] - 嵌入模式下的关闭回调 / Close callback for embedded mode
 * @returns {JSX.Element} 页面容器
 *
 * 功能特性：
 * - 多源搜索：支持萌娘百科等 Wiki 站点
 * - 页面预览：爬取并预览 Wiki 页面内容
 * - 链接筛选：选择相关子页面进行批量导入
 * - 卡片确认：显示提取的卡片并允许手动编辑
 * - 导航历史：支持前进后退浏览已查看的页面
 *
 * @example
 * <FanfictionView />
 * // 或嵌入模式
 * <FanfictionView embedded={true} onClose={handleClose} />
 */
export default function FanfictionView({ embedded = false, onClose }) {
    const { projectId } = useParams();
    const navigate = useNavigate();

    const [step, setStep] = useState(1);

    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [manualUrl, setManualUrl] = useState('');

    const [selectedUrl, setSelectedUrl] = useState(null);
    const [pagePreview, setPagePreview] = useState(null);
    const [selectedLinks, setSelectedLinks] = useState([]);
    const [previewing, setPreviewing] = useState(false);
    const [navUrls, setNavUrls] = useState([]);
    const [navIndex, setNavIndex] = useState(-1);
    const [subpageVisibleCount, setSubpageVisibleCount] = useState(200);

    const [proposals, setProposals] = useState([]);
    const [extracting, setExtracting] = useState(false);
    const [acceptedProposals, setAcceptedProposals] = useState(new Set());

    const handleSearch = async () => {
        if (!searchQuery.trim()) return;

        setSearching(true);
        try {
            const response = await axios.post(`${API_BASE}/fanfiction/search`, {
                query: searchQuery,
                engine: 'moegirl'
            });
            setSearchResults(response.data);
        } catch (error) {
            logger.error('Search failed:', error);
            alert('搜索失败，请重试');
        } finally {
            setSearching(false);
        }
    };

    const handleSelectResult = async (url, { pushHistory = true } = {}) => {
        const nextUrl = url;
        setSelectedUrl(nextUrl);
        setPreviewing(true);

        try {
            const response = await axios.post(`${API_BASE}/fanfiction/preview`, { url: nextUrl });

            if (!response.data.success) {
                alert(`页面加载失败: ${response.data.error || '未知错误'}`);
                setPreviewing(false);
                return;
            }

            setPagePreview(response.data);
            setSubpageVisibleCount(200);
            setManualUrl('');

            if (pushHistory) {
                setNavUrls((prev) => {
                    const base = prev.slice(0, Math.max(0, navIndex + 1));
                    const next = [...base, nextUrl];
                    setNavIndex(next.length - 1);
                    return next;
                });
            }
            if (response.data.content || response.data.links.length > 0) {
                setStep(2);
            } else {
                alert('该页面没有可提取的内容');
            }
        } catch (error) {
            logger.error('[Fanfiction] Preview failed:', error);
            alert('加载页面失败，请检查网络连接');
        } finally {
            setPreviewing(false);
        }
    };

    const handlePreviewManualUrl = async () => {
        const url = String(manualUrl || '').trim();
        if (!url) {
            alert('请输入要分析的链接');
            return;
        }
        handleSelectResult(url);
    };

    const handleNavigate = (url) => {
        if (!url) return;
        handleSelectResult(url, { pushHistory: true });
    };

    const canGoBack = navIndex > 0;
    const canGoForward = navIndex >= 0 && navIndex < navUrls.length - 1;

    const goBack = () => {
        if (!canGoBack) return;
        const next = navIndex - 1;
        setNavIndex(next);
        setStep(2);
        handleSelectResult(navUrls[next], { pushHistory: false });
    };

    const goForward = () => {
        if (!canGoForward) return;
        const next = navIndex + 1;
        setNavIndex(next);
        setStep(2);
        handleSelectResult(navUrls[next], { pushHistory: false });
    };

    const resetToSearch = () => {
        setStep(1);
        setPagePreview(null);
        setSelectedLinks([]);
        setNavUrls([]);
        setNavIndex(-1);
        setSubpageVisibleCount(200);
        setManualUrl('');
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
            const MAX_BATCH = 80;
            const all = selectedLinks.slice();
            const merged = [];
            for (let i = 0; i < all.length; i += MAX_BATCH) {
                const chunk = all.slice(i, i + MAX_BATCH);
                const response = await axios.post(`${API_BASE}/fanfiction/extract/batch`, {
                    project_id: projectId,
                    urls: chunk
                });
                if (!response.data.success) {
                    alert(`提取失败: ${response.data.error || '未知错误'}`);
                    setExtracting(false);
                    return;
                }
                merged.push(...(response.data.proposals || []));
            }

            const nextProposals = merged.map((item) => ({
                name: item.name || '',
                type: item.type || 'Character',
                description: item.description || '',
                source_url: item.source_url || ''
            }));
            setProposals(nextProposals);
            setStep(3);

        } catch (error) {
            logger.error('Extraction failed:', error);
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
            logger.error('Extraction failed:', error);
            const msg = error.response?.data?.error || error.response?.data?.detail || error.message;
            alert(`提取失败: ${msg || '未知错误'}`);
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
            logger.error('[Fanfiction] Failed to create card:', error);
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

                        <div className="flex gap-2 mb-6">
                            <input
                                type="text"
                                value={manualUrl}
                                onChange={(e) => setManualUrl(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handlePreviewManualUrl()}
                                placeholder="或直接粘贴网址进行分析..."
                                className="flex-1 px-4 py-3 rounded-[6px] border border-[var(--vscode-input-border)] bg-[var(--vscode-input-bg)] text-[var(--vscode-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--vscode-focus-border)]"
                            />
                            <button
                                onClick={handlePreviewManualUrl}
                                disabled={previewing}
                                className="px-6 py-3 border border-[var(--vscode-input-border)] rounded-[6px] hover:bg-[var(--vscode-list-hover)] disabled:opacity-50"
                            >
                                分析链接
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
                        <div className="mb-6 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={goBack}
                                    disabled={!canGoBack || previewing}
                                    className="w-9 h-9 rounded-[6px] border border-[var(--vscode-input-border)] flex items-center justify-center hover:bg-[var(--vscode-list-hover)] disabled:opacity-50"
                                    title="后退"
                                >
                                    <ChevronLeft size={16} />
                                </button>
                                <button
                                    onClick={goForward}
                                    disabled={!canGoForward || previewing}
                                    className="w-9 h-9 rounded-[6px] border border-[var(--vscode-input-border)] flex items-center justify-center hover:bg-[var(--vscode-list-hover)] disabled:opacity-50"
                                    title="前进"
                                >
                                    <ChevronRight size={16} />
                                </button>
                                <button
                                    onClick={resetToSearch}
                                    disabled={previewing}
                                    className="px-3 h-9 rounded-[6px] border border-[var(--vscode-input-border)] hover:bg-[var(--vscode-list-hover)] text-sm disabled:opacity-50"
                                >
                                    返回搜索
                                </button>
                            </div>
                            <h2 className="text-xl font-bold text-[var(--vscode-fg)] truncate">{pagePreview.title}</h2>
                        </div>

                        {pagePreview.content && (
                            <div className="mb-6 p-4 bg-[var(--vscode-bg)] rounded-[6px] border border-[var(--vscode-sidebar-border)]">
                                <h3 className="font-bold text-[var(--vscode-fg)] mb-2">页面内容预览</h3>
                                <div className="text-sm text-[var(--vscode-fg-subtle)] whitespace-pre-wrap max-h-56 overflow-y-auto border border-[var(--vscode-input-border)] rounded-[6px] p-3 bg-[var(--vscode-input-bg)]">
                                    {pagePreview.content}
                                </div>
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
                                <div className="flex items-center justify-between mb-3">
                                    <div>
                                        <h3 className="font-bold text-[var(--vscode-fg)]">
                                            子词条（{pagePreview.links.length}）
                                        </h3>
                                        <p className="text-xs text-[var(--vscode-fg-subtle)]">
                                            {pagePreview.is_list_page ? '列表页建议批量导入' : '普通词条也可选择少量相关子词条批量建卡（可选）'}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={handleExtractFromLinks}
                                            disabled={selectedLinks.length === 0 || extracting}
                                            className="px-4 py-2 bg-[var(--vscode-list-active)] text-[var(--vscode-list-active-fg)] rounded-[6px] hover:opacity-90 disabled:opacity-50"
                                        >
                                            {extracting ? '提取中...' : `提取选中（${selectedLinks.length}）`}
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-[520px] overflow-y-auto">
                                    {pagePreview.links
                                        .slice(0, subpageVisibleCount)
                                        .map((link, idx) => (
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

                                <div className="mt-2 flex items-center justify-between text-xs text-[var(--vscode-fg-subtle)]">
                                    <span>已显示 {Math.min(subpageVisibleCount, pagePreview.links.length)} / {pagePreview.links.length}</span>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setSubpageVisibleCount((v) => Math.min(pagePreview.links.length, v + 200))}
                                            disabled={subpageVisibleCount >= pagePreview.links.length}
                                            className="px-2 py-1 rounded-[6px] border border-[var(--vscode-input-border)] hover:bg-[var(--vscode-list-hover)] disabled:opacity-50"
                                        >
                                            显示更多
                                        </button>
                                        <button
                                            onClick={() => setSubpageVisibleCount(pagePreview.links.length)}
                                            disabled={subpageVisibleCount >= pagePreview.links.length}
                                            className="px-2 py-1 rounded-[6px] border border-[var(--vscode-input-border)] hover:bg-[var(--vscode-list-hover)] disabled:opacity-50"
                                        >
                                            显示全部
                                        </button>
                                    </div>
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
                    <div className="max-w-5xl mx-auto">
                        <div className="mb-4 flex items-start justify-between gap-4">
                            <div>
                                <h2 className="text-lg font-bold text-[var(--vscode-fg)]">确认卡片</h2>
                                <p className="text-sm text-[var(--vscode-fg-subtle)]">已提取 {proposals.length} 张卡片，请确认导入</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={goBack}
                                    disabled={!canGoBack || previewing}
                                    className="w-9 h-9 rounded-[6px] border border-[var(--vscode-input-border)] flex items-center justify-center hover:bg-[var(--vscode-list-hover)] disabled:opacity-50"
                                    title="后退"
                                >
                                    <ChevronLeft size={16} />
                                </button>
                                <button
                                    onClick={goForward}
                                    disabled={!canGoForward || previewing}
                                    className="w-9 h-9 rounded-[6px] border border-[var(--vscode-input-border)] flex items-center justify-center hover:bg-[var(--vscode-list-hover)] disabled:opacity-50"
                                    title="前进"
                                >
                                    <ChevronRight size={16} />
                                </button>
                                <button
                                    onClick={() => setStep(2)}
                                    className="px-3 h-9 rounded-[6px] border border-[var(--vscode-input-border)] hover:bg-[var(--vscode-list-hover)] text-sm"
                                >
                                    返回浏览
                                </button>
                                <button
                                    onClick={resetToSearch}
                                    className="px-3 h-9 rounded-[6px] border border-[var(--vscode-input-border)] hover:bg-[var(--vscode-list-hover)] text-sm"
                                >
                                    返回搜索
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4">
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
                                            rows={10}
                                            className="text-sm text-[var(--vscode-fg)] mb-3 w-full bg-[var(--vscode-input-bg)] border border-[var(--vscode-input-border)] rounded-[6px] p-3 resize-y min-h-[240px] focus:border-[var(--vscode-focus-border)] outline-none"
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
