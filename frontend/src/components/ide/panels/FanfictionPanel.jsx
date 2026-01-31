/**
 * FanfictionPanel - Wiki 导入面板 (适配 IDE 侧边栏)
 * 
 * 功能：搜索 Wiki -> 预览页面 -> 批量提取角色卡片
 */
import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Library, Search, Loader, ChevronRight, Check, X, ExternalLink, ArrowLeft } from 'lucide-react';
import axios from 'axios';
import { cn } from '../../ui/core';

const API_BASE = '/api';

const FanfictionPanel = () => {
    const { projectId } = useParams();

    // Step: 1=Search, 2=Select, 3=Review
    const [step, setStep] = useState(1);

    // Step 1: Search
    const [searchQuery, setSearchQuery] = useState('');
    const [searchEngine, setSearchEngine] = useState('moegirl');
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);

    // Step 2: Preview & Select
    const [pagePreview, setPagePreview] = useState(null);
    const [selectedLinks, setSelectedLinks] = useState([]);
    const [previewing, setPreviewing] = useState(false);

    // Step 3: Extract & Review
    const [proposals, setProposals] = useState([]);
    const [extracting, setExtracting] = useState(false);
    const [acceptedProposals, setAcceptedProposals] = useState(new Set());

    // Search handler
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
        } finally {
            setSearching(false);
        }
    };

    // Preview handler
    const handleSelectResult = async (url) => {
        setPreviewing(true);
        try {
            const response = await axios.post(`${API_BASE}/fanfiction/preview`, { url });
            if (response.data.success) {
                setPagePreview(response.data);
                setStep(2);
            }
        } catch (error) {
            console.error('Preview failed:', error);
        } finally {
            setPreviewing(false);
        }
    };

    // Toggle link selection
    const toggleLink = (linkUrl) => {
        setSelectedLinks(prev =>
            prev.includes(linkUrl)
                ? prev.filter(u => u !== linkUrl)
                : [...prev, linkUrl]
        );
    };

    // Batch extract
    const handleExtract = async () => {
        setExtracting(true);
        try {
            const response = await axios.post(`${API_BASE}/fanfiction/extract/batch`, {
                project_id: projectId,
                urls: selectedLinks
            });
            if (response.data.success) {
                setProposals(response.data.proposals);
                setStep(3);
            }
        } catch (error) {
            console.error('Extraction failed:', error);
        } finally {
            setExtracting(false);
        }
    };

    // Accept proposal
    const handleAcceptProposal = async (proposal) => {
        try {
            if (proposal.type === 'Character') {
                let richIdentity = `## 身份\n${proposal.description || ''}`;
                if (proposal.appearance) richIdentity += `\n\n## 外貌\n${proposal.appearance}`;
                if (proposal.background) richIdentity += `\n\n## 背景故事\n${proposal.background}`;
                if (proposal.abilities) richIdentity += `\n\n## 能力设定\n${proposal.abilities}`;

                await axios.post(`${API_BASE}/projects/${projectId}/cards/characters`, {
                    name: proposal.name,
                    identity: richIdentity,
                    appearance: proposal.appearance || '',
                    motivation: '待补充',
                    personality: proposal.personality || [],
                    relationships: proposal.relationships || [],
                    boundaries: []
                });
            } else if (proposal.type === 'World') {
                await axios.post(`${API_BASE}/projects/${projectId}/cards/world`, {
                    name: proposal.name,
                    category: 'Location',
                    description: proposal.description,
                    rules: []
                });
            }
            setAcceptedProposals(prev => new Set([...prev, proposal.name]));
        } catch (error) {
            console.error('Failed to create card:', error);
        }
    };

    // Reset to step 1
    const resetToSearch = () => {
        setStep(1);
        setPagePreview(null);
        setSelectedLinks([]);
        setProposals([]);
        setAcceptedProposals(new Set());
    };

    return (
        <div className="flex flex-col h-full bg-surface text-ink-900">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <h2 className="text-sm font-bold flex items-center gap-2">
                    <Library size={16} className="text-primary" />
                    <span>同人导入</span>
                </h2>
                {step > 1 && (
                    <button
                        onClick={resetToSearch}
                        className="text-ink-400 hover:text-ink-900 transition-colors p-1 rounded hover:bg-ink-100"
                        title="返回搜索"
                    >
                        <ArrowLeft size={14} />
                    </button>
                )}
            </div>

            {/* Step Indicator */}
            <div className="px-4 py-2 border-b border-border flex items-center gap-2 text-[10px]">
                <span className={cn("px-2 py-0.5 rounded", step === 1 ? "bg-primary text-white" : "bg-ink-100 text-ink-500")}>
                    1.搜索
                </span>
                <ChevronRight size={10} className="text-ink-300" />
                <span className={cn("px-2 py-0.5 rounded", step === 2 ? "bg-primary text-white" : "bg-ink-100 text-ink-500")}>
                    2.筛选
                </span>
                <ChevronRight size={10} className="text-ink-300" />
                <span className={cn("px-2 py-0.5 rounded", step === 3 ? "bg-primary text-white" : "bg-ink-100 text-ink-500")}>
                    3.导入
                </span>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {/* Step 1: Search */}
                {step === 1 && (
                    <>
                        {/* Search Bar */}
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                placeholder="搜索角色/作品名..."
                                className="flex-1 text-xs py-2 px-3 bg-background border border-border rounded focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none"
                            />
                            <button
                                onClick={handleSearch}
                                disabled={searching}
                                className="px-3 py-2 bg-primary text-white rounded text-xs hover:bg-primary/90 disabled:opacity-50"
                            >
                                {searching ? <Loader size={12} className="animate-spin" /> : <Search size={12} />}
                            </button>
                        </div>

                        {/* Engine Selector */}
                        <div className="flex gap-2 text-xs">
                            {[
                                { id: 'moegirl', label: '萌娘百科' },
                                { id: 'fandom', label: 'Fandom' },
                                { id: 'wikipedia', label: 'Wikipedia' },
                            ].map(eng => (
                                <button
                                    key={eng.id}
                                    onClick={() => setSearchEngine(eng.id)}
                                    className={cn(
                                        "px-2 py-1 rounded border transition-colors",
                                        searchEngine === eng.id
                                            ? "border-primary bg-primary/10 text-primary"
                                            : "border-border text-ink-500 hover:border-primary/50"
                                    )}
                                >
                                    {eng.label}
                                </button>
                            ))}
                        </div>

                        {/* Search Results */}
                        <div className="space-y-2">
                            {searchResults.map((result, idx) => (
                                <div
                                    key={idx}
                                    onClick={() => handleSelectResult(result.url)}
                                    className="p-2 bg-background border border-border rounded hover:border-primary/50 cursor-pointer transition-colors"
                                >
                                    <div className="text-xs font-bold text-ink-900 truncate">{result.title}</div>
                                    <div className="text-[10px] text-ink-400 truncate mt-0.5">{result.url}</div>
                                </div>
                            ))}
                            {previewing && (
                                <div className="flex items-center justify-center py-8 text-ink-400">
                                    <Loader size={16} className="animate-spin" />
                                    <span className="ml-2 text-xs">加载页面...</span>
                                </div>
                            )}
                        </div>
                    </>
                )}

                {/* Step 2: Select Links */}
                {step === 2 && pagePreview && (
                    <>
                        <div className="p-2 bg-background border border-border rounded">
                            <div className="text-xs font-bold text-ink-900">{pagePreview.title}</div>
                            <div className="text-[10px] text-ink-400 mt-1 line-clamp-3">
                                {pagePreview.content?.substring(0, 200)}...
                            </div>
                        </div>

                        <div className="text-xs font-bold text-ink-600 mt-4">选择要提取的链接：</div>
                        <div className="space-y-1.5 max-h-48 overflow-y-auto">
                            {(pagePreview.links || []).slice(0, 20).map((link, idx) => (
                                <div
                                    key={idx}
                                    onClick={() => toggleLink(link.url)}
                                    className={cn(
                                        "p-2 rounded border cursor-pointer transition-colors flex items-center gap-2",
                                        selectedLinks.includes(link.url)
                                            ? "border-primary bg-primary/5"
                                            : "border-border hover:border-primary/30"
                                    )}
                                >
                                    <div className={cn(
                                        "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0",
                                        selectedLinks.includes(link.url)
                                            ? "bg-primary border-primary"
                                            : "border-ink-300"
                                    )}>
                                        {selectedLinks.includes(link.url) && <Check size={10} className="text-white" />}
                                    </div>
                                    <span className="text-xs text-ink-700 truncate">{link.title}</span>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={handleExtract}
                            disabled={selectedLinks.length === 0 || extracting}
                            className="w-full py-2 bg-primary text-white rounded text-xs font-bold hover:bg-primary/90 disabled:opacity-50"
                        >
                            {extracting ? (
                                <span className="flex items-center justify-center gap-2">
                                    <Loader size={12} className="animate-spin" />
                                    提取中...
                                </span>
                            ) : (
                                `提取 ${selectedLinks.length} 个页面`
                            )}
                        </button>
                    </>
                )}

                {/* Step 3: Review Proposals */}
                {step === 3 && (
                    <>
                        <div className="text-xs text-ink-500 mb-2">
                            已提取 {proposals.length} 个卡片，点击确认导入：
                        </div>
                        <div className="space-y-2">
                            {proposals.map((proposal, idx) => (
                                <div
                                    key={idx}
                                    className={cn(
                                        "p-2 rounded border transition-colors",
                                        acceptedProposals.has(proposal.name)
                                            ? "border-green-500 bg-green-50"
                                            : "border-border"
                                    )}
                                >
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <div className="text-xs font-bold text-ink-900">{proposal.name}</div>
                                            <div className="text-[10px] text-ink-400">
                                                {proposal.type === 'Character' ? '角色' : '世界观'}
                                            </div>
                                        </div>
                                        {!acceptedProposals.has(proposal.name) ? (
                                            <button
                                                onClick={() => handleAcceptProposal(proposal)}
                                                className="px-2 py-1 bg-primary text-white rounded text-[10px] hover:bg-primary/90"
                                            >
                                                导入
                                            </button>
                                        ) : (
                                            <Check size={16} className="text-green-600" />
                                        )}
                                    </div>
                                    <div className="text-[10px] text-ink-600 mt-1 line-clamp-2">
                                        {proposal.description}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={resetToSearch}
                            className="w-full py-2 border border-border text-ink-700 rounded text-xs font-medium hover:bg-ink-50 mt-4"
                        >
                            完成，继续搜索
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};

export default FanfictionPanel;
