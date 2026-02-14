/**
 * AgentStatusPanel - Agent 状态面板（带消息历史和输入框）
 * 
 * 保留对话形式的同时，在 Agent 工作时显示状态卡片
 * - 消息历史记录（用户可追溯修改意见）
 * - 动态 Agent 状态卡片
 * - 底部输入框用于用户交互
 */

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, Send, Sparkles, Copy, X } from 'lucide-react';

// 消息项组件
const MessageItem = ({ type, content, time }) => {
    const styles = {
        user: 'bg-[var(--vscode-list-active)] text-[var(--vscode-list-active-fg)] ml-8 border border-[var(--vscode-input-border)]',
        assistant: 'bg-[var(--vscode-input-bg)] text-[var(--vscode-fg)] border border-[var(--vscode-sidebar-border)] mr-8',
        system: 'bg-[var(--vscode-input-bg)] text-[var(--vscode-fg)] border border-[var(--vscode-sidebar-border)] mr-8 font-mono',
        error: 'bg-red-50 text-red-700 border border-red-200 mr-8',
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className={`px-3 py-2 rounded-[6px] text-xs my-1.5 ${styles[type] || styles.system}`}
        >
            {content}
            {time && (
                <span className="ml-2 opacity-50 text-[10px]">
                    {time.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                </span>
            )}
        </motion.div>
    );
};

const RunCard = ({
    run,
    expandedTrace,
    onToggleTrace,
    formatStageLabel,
    formatTime,
    formatSource,
}) => {
    const headerTime = run.startedAt ? formatTime(run.startedAt) : '';
    return (
        <div className="border border-[var(--vscode-sidebar-border)] rounded-[6px] bg-[var(--vscode-input-bg)] my-2 overflow-hidden">
            <div className="px-3 py-2 border-b border-[var(--vscode-sidebar-border)] bg-[var(--vscode-sidebar-bg)]">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-1 min-w-0">
                        <div className="text-[10px] text-[var(--vscode-fg-subtle)]">指令</div>
                        <div className="text-xs text-[var(--vscode-fg)] whitespace-pre-wrap break-words">
                            {run.userContent || '（系统）'}
                        </div>
                    </div>
                    {headerTime ? (
                        <div className="text-[10px] text-[var(--vscode-fg-subtle)] whitespace-nowrap">{headerTime}</div>
                    ) : null}
                </div>
            </div>

            {run.messages.length > 0 ? (
                <div className="px-3 py-2">
                    {run.messages.map((msg) => (
                        <MessageItem key={msg.id} type={msg.type} content={msg.content} time={msg.time} />
                    ))}
                </div>
            ) : null}

            {run.progressEvents.length > 0 ? (
                <div className="px-3 pb-3">
                    <div className="text-[10px] text-[var(--vscode-fg-subtle)] mb-1">行动轨迹</div>
                    <div className="space-y-1">
                        {run.progressEvents.map((event) => {
                            const hasDetails =
                                Boolean(event.note) ||
                                (Array.isArray(event.queries) && event.queries.length > 0) ||
                                typeof event.hits === 'number' ||
                                Boolean(event.stop_reason) ||
                                (Array.isArray(event.top_sources) && event.top_sources.length > 0) ||
                                event.payload !== undefined;
                            const expanded = Boolean(expandedTrace[event.id]);
                            const lineTime = event.timestamp ? formatTime(event.timestamp) : '';

                            return (
                                <div key={event.id} className="text-[10px] text-[var(--vscode-fg-subtle)]">
                                    <button
                                        type="button"
                                        onClick={hasDetails ? () => onToggleTrace(event.id) : undefined}
                                        className={[
                                            "w-full text-left leading-snug",
                                            hasDetails ? "hover:text-[var(--vscode-fg)] cursor-pointer" : "cursor-default"
                                        ].join(' ')}
                                    >
                                        <span className="font-mono opacity-70 mr-2">{lineTime}</span>
                                        <span className="text-[var(--vscode-fg)] font-semibold mr-2">{formatStageLabel(event.stage)}</span>
                                        <span>{event.message || ''}</span>
                                    </button>

                                    {hasDetails && expanded ? (
                                        <div className="mt-1 ml-4 border-l border-[var(--vscode-sidebar-border)] pl-3 space-y-2">
                                            {event.note ? (
                                                <div className="text-[10px] text-[var(--vscode-fg-subtle)] whitespace-pre-wrap break-words">
                                                    {event.note}
                                                </div>
                                            ) : null}

                                            {(Array.isArray(event.queries) && event.queries.length > 0) ? (
                                                <div>
                                                    <div className="text-[10px] text-[var(--vscode-fg-subtle)] mb-1">查询</div>
                                                    <div className="flex flex-wrap gap-1">
                                                        {event.queries.map((q, idx) => (
                                                            <span
                                                                key={`${event.id}-q-${idx}`}
                                                                className="px-2 py-0.5 rounded-[6px] border border-[var(--vscode-sidebar-border)] bg-[var(--vscode-bg)] text-[10px] text-[var(--vscode-fg-subtle)]"
                                                            >
                                                                {q}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : null}

                                            {typeof event.hits === 'number' ? (
                                                <div className="text-[10px] text-[var(--vscode-fg-subtle)]">命中：{event.hits}</div>
                                            ) : null}

                                            {(Array.isArray(event.top_sources) && event.top_sources.length > 0) ? (
                                                <div>
                                                    <div className="text-[10px] text-[var(--vscode-fg-subtle)] mb-1">命中摘要</div>
                                                    <div className="pt-1 space-y-1">
                                                        {event.top_sources.slice(0, 8).map((source, index) => (
                                                            <div key={`${event.id}-src-${index}`} className="text-[10px]">
                                                                <span className="font-mono">#{index + 1}</span>
                                                                <span className="ml-2">{source.type || 'evidence'}</span>
                                                                <span className="ml-2">{source.snippet}</span>
                                                                {formatSource(source.source) ? (
                                                                    <span className="ml-2 text-[var(--vscode-fg-subtle)]">
                                                                        ({formatSource(source.source)})
                                                                    </span>
                                                                ) : null}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : null}

                                            {event.stop_reason ? (
                                                <div className="text-[10px] text-[var(--vscode-fg-subtle)]">停止原因：{event.stop_reason}</div>
                                            ) : null}

                                            {event.payload !== undefined ? (
                                                <div>
                                                    <div className="text-[10px] text-[var(--vscode-fg-subtle)] mb-1">详情</div>
                                                    <div className="bg-[var(--vscode-input-bg)] border border-[var(--vscode-sidebar-border)] rounded-[6px] p-3 max-h-64 overflow-y-auto custom-scrollbar">
                                                        <pre className="text-[10px] text-[var(--vscode-fg-subtle)] font-mono whitespace-pre-wrap break-words">
                                                            {typeof event.payload === 'string' ? event.payload : JSON.stringify(event.payload, null, 2)}
                                                        </pre>
                                                    </div>
                                                </div>
                                            ) : null}
                                        </div>
                                    ) : null}
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : null}
        </div>
    );
};

// 主面板组件
const AgentStatusPanel = ({
    mode = 'create',
    onModeChange = () => { },
    createDisabled = false,
    inputDisabled = false,
    inputDisabledReason = '',
    selectionCandidateSummary = '',
    selectionAttachedSummary = '',
    selectionCandidateDifferent = false,
    onAttachSelection = () => { },
    onClearAttachedSelection = () => { },
    editScope = 'document',
    onEditScopeChange = () => { },
    contextDebug = null,
    progressEvents = [],
    messages = [],
    memoryPackStatus = null,
    activeChapter = null,
    editContextMode = 'quick',
    onEditContextModeChange = () => { },
    diffReview = null,
    diffDecisions = null,
    onAcceptAllDiff = () => { },
    onRejectAllDiff = () => { },
    onApplySelectedDiff = () => { },
    onSubmit = () => { },
    className = ''
}) => {
    const [inputValue, setInputValue] = useState('');
    const [copyStatus, setCopyStatus] = useState('');
    const [expandedTrace, setExpandedTrace] = useState({});
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    const runs = useMemo(() => {
        const combined = [];
        messages.forEach((msg, index) => {
            combined.push({
                kind: 'message',
                id: `msg-${index}`,
                ts: msg.time?.getTime?.() || 0,
                msg,
            });
        });
        progressEvents.forEach((event) => {
            combined.push({
                kind: 'progress',
                id: event.id,
                ts: event.timestamp || 0,
                event,
            });
        });
        combined.sort((a, b) => a.ts - b.ts);

        const result = [];
        let current = null;
        let runSeq = 0;

        const ensureRun = (startedAt = 0, userContent = '') => {
            if (current) return current;
            current = {
                id: `run-${runSeq++}`,
                startedAt,
                userContent,
                messages: [],
                progressEvents: [],
            };
            return current;
        };

        combined.forEach((item) => {
            if (item.kind === 'message' && item.msg?.type === 'user') {
                if (current) result.push(current);
                current = {
                    id: `run-${runSeq++}`,
                    startedAt: item.ts,
                    userContent: String(item.msg.content || '').trim(),
                    messages: [],
                    progressEvents: [],
                };
                return;
            }

            const run = ensureRun(item.ts, '');
            if (item.kind === 'message') {
                run.messages.push({
                    id: item.id,
                    type: item.msg.type,
                    content: item.msg.content,
                    time: item.msg.time,
                });
            } else if (item.kind === 'progress') {
                run.progressEvents.push(item.event);
            }
        });

        if (current) result.push(current);
        return result;
    }, [messages, progressEvents]);

    const feedItems = useMemo(() => {
        const runItems = runs.map((run) => ({
            kind: 'run',
            id: run.id,
            ts: run.startedAt || 0,
            run,
        }));
        const contextItems = contextDebug
            ? [{
                kind: 'context',
                id: 'context-debug',
                ts: Number.MAX_SAFE_INTEGER,
                debug: contextDebug,
            }]
            : [];
        return [...runItems, ...contextItems].sort((a, b) => a.ts - b.ts);
    }, [runs, contextDebug]);

    // 自动滚动到底部
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages.length, progressEvents.length, contextDebug]);

    const diffSummary = useMemo(() => {
        if (!diffReview?.hunks?.length) return null;
        const total = diffReview.hunks.length;
        const decisions = diffDecisions || {};
        let accepted = 0;
        let rejected = 0;
        let pending = 0;
        diffReview.hunks.forEach((hunk) => {
            const decision = decisions[hunk.id];
            if (decision === 'accepted') accepted += 1;
            else if (decision === 'rejected') rejected += 1;
            else pending += 1;
        });
        return {
            total,
            accepted,
            rejected,
            pending,
            additions: diffReview.stats?.additions || 0,
            deletions: diffReview.stats?.deletions || 0,
        };
    }, [diffReview, diffDecisions]);

    const hasDiffActions = Boolean(diffSummary);
    const hasAnyContent = runs.length > 0 || Boolean(contextDebug) || hasDiffActions;

    const handleSubmit = () => {
        if (inputDisabled) return;
        if (!inputValue.trim()) return;
        onSubmit(inputValue.trim());
        setInputValue('');
        if (inputRef.current) {
            inputRef.current.style.height = 'auto';
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    const updateInputHeight = (el) => {
        if (!el) return;
        el.style.height = 'auto';
        const maxHeight = 160;
        const nextHeight = Math.min(el.scrollHeight, maxHeight);
        el.style.height = `${Math.max(nextHeight, 40)}px`;
    };

    const handleCopyContextDebug = async () => {
        if (!contextDebug) return;
        const text = typeof contextDebug === 'string' ? contextDebug : JSON.stringify(contextDebug, null, 2);
        if (!navigator?.clipboard?.writeText) {
            window.alert('当前环境不支持剪贴板复制');
            return;
        }
        try {
            await navigator.clipboard.writeText(text);
            setCopyStatus('已复制');
            setTimeout(() => setCopyStatus(''), 1500);
        } catch (error) {
            setCopyStatus('复制失败');
            setTimeout(() => setCopyStatus(''), 2000);
        }
    };

    const toggleTrace = (id) => {
        setExpandedTrace((prev) => ({ ...prev, [id]: !prev[id] }));
    };

    const formatStageLabel = (stage) => {
        const mapping = {
            read_previous: '阅读前文',
            read_facts: '检索事实摘要',
            lookup_cards: '查询设定',
            prepare_retrieval: '准备检索',
            generate_plan: '生成研究计划',
            execute_retrieval: '执行检索',
            self_check: '证据自检',
            memory_pack: '记忆包',
            writing: '撰写',
            persist: '保存',
            session_start: '启动会话',
            scene_brief: '场景简报',
            edit_suggest: '生成修改建议',
            edit_suggest_done: '修改建议完成',
            system: '系统',
            connection: '连接',
        };
        return mapping[stage] || stage || '进度';
    };

    const formatSource = (source) => {
        if (!source) return '';
        const parts = [
            source.chapter,
            source.path,
            source.field,
            source.fact_id,
            source.card,
            source.introduced_in,
        ].filter(Boolean);
        return parts.join(' / ');
    };

    const formatTime = (timestamp) => {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    const formatBuiltAt = (value) => {
        if (!value) return '';
        const date = new Date(value);
        return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    };

    const memoryPackSummary = useMemo(() => {
        if (!activeChapter) {
            return { label: '记忆包：未选择章节', detail: '' };
        }
        if (!memoryPackStatus) {
            return { label: '记忆包：加载中...', detail: '' };
        }
        if (!memoryPackStatus.exists) {
            return { label: '记忆包：未生成', detail: '' };
        }
        const detailParts = [];
        const builtAt = formatBuiltAt(memoryPackStatus.built_at);
        if (builtAt) detailParts.push(`生成时间 ${builtAt}`);
        const total = memoryPackStatus?.evidence_stats?.total;
        if (typeof total === 'number') detailParts.push(`证据 ${total}`);
        const source = memoryPackStatus?.source;
        if (source) detailParts.push(`来源 ${source}`);
        return {
            label: '记忆包：已生成',
            detail: detailParts.join(' / ')
        };
    }, [activeChapter, memoryPackStatus]);

    return (
        <div className={`flex flex-col h-full ${className}`}>
            <div className="px-3 py-2 border-b border-[var(--vscode-sidebar-border)] bg-[var(--vscode-sidebar-bg)]">
                <div className="text-[11px] text-[var(--vscode-fg)]">{memoryPackSummary.label}</div>
                {memoryPackSummary.detail ? (
                    <div className="text-[10px] text-[var(--vscode-fg-subtle)]">{memoryPackSummary.detail}</div>
                ) : null}
            </div>
            {/* 消息列表（对话 + 行动轨迹） */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
                {!hasAnyContent ? (
                    /* 欢迎提示 */
                        <div className="h-full flex flex-col items-center justify-center text-center p-6">
                        <div className="w-16 h-16 rounded-[6px] bg-[var(--vscode-list-hover)] border border-[var(--vscode-sidebar-border)] flex items-center justify-center mb-4">
                            <Sparkles size={28} className="text-[var(--vscode-focus-border)]" />
                        </div>
                        <h3 className="text-sm font-bold text-[var(--vscode-fg)] mb-2">开始创作</h3>
                        <p className="text-xs text-[var(--vscode-fg-subtle)] max-w-[200px]">
                            选择章节后，在下方输入创作指令开始生成，或直接输入修改意见
                        </p>
                    </div>
                ) : (
                    <>
                        {hasDiffActions ? (
                            <div className="border border-[var(--vscode-sidebar-border)] rounded-[6px] bg-[var(--vscode-input-bg)] my-2 overflow-hidden">
                                <div className="px-3 py-2 border-b border-[var(--vscode-sidebar-border)] bg-[var(--vscode-sidebar-bg)]">
                                    <div className="flex items-center justify-between">
                                        <div className="text-xs font-bold text-[var(--vscode-fg)]">修改完成</div>
                                        <div className="text-[10px] text-[var(--vscode-fg-subtle)]">
                                            {diffSummary.additions} 新增 / {diffSummary.deletions} 删除
                                        </div>
                                    </div>
                                    <div className="text-[10px] text-[var(--vscode-fg-subtle)] mt-1">
                                        共 {diffSummary.total} 处修改，已接受 {diffSummary.accepted}，已拒绝 {diffSummary.rejected}，待确认 {diffSummary.pending}
                                    </div>
                                </div>
                                <div className="px-3 py-2 text-[10px] text-[var(--vscode-fg-subtle)]">
                                    可逐块调整后选择“应用已接受修改”，或直接全部接受/拒绝。
                                </div>
                                <div className="px-3 pb-3 flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={onRejectAllDiff}
                                        className="text-[10px] px-3 py-1.5 rounded-[6px] border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                                    >
                                        拒绝全部
                                    </button>
                                    <button
                                        type="button"
                                        onClick={onAcceptAllDiff}
                                        className="text-[10px] px-3 py-1.5 rounded-[6px] border border-green-200 text-green-700 hover:bg-green-50 transition-colors"
                                    >
                                        接受全部
                                    </button>
                                    <button
                                        type="button"
                                        onClick={onApplySelectedDiff}
                                        className="text-[10px] px-3 py-1.5 rounded-[6px] border border-[var(--vscode-input-border)] bg-[var(--vscode-list-active)] text-[var(--vscode-list-active-fg)] hover:opacity-90 transition-colors"
                                    >
                                        应用已接受修改
                                    </button>
                                </div>
                            </div>
                        ) : null}
                        {feedItems.map((item) => {
                            if (item.kind === 'run') {
                                return (
                                    <RunCard
                                        key={item.id}
                                        run={item.run}
                                        expandedTrace={expandedTrace}
                                        onToggleTrace={toggleTrace}
                                        formatStageLabel={formatStageLabel}
                                        formatTime={formatTime}
                                        formatSource={formatSource}
                                    />
                                );
                            }
                            if (item.kind === 'context') {
                                const expanded = Boolean(expandedTrace[item.id]);
                                return (
                                    <div
                                        key={item.id}
                                        className="border border-[var(--vscode-sidebar-border)] rounded-[6px] bg-[var(--vscode-input-bg)] my-2 overflow-hidden"
                                    >
                                        <button
                                            type="button"
                                            onClick={() => toggleTrace(item.id)}
                                            className="w-full text-left px-3 py-2 flex items-start justify-between gap-2 hover:bg-[var(--vscode-list-hover)]"
                                        >
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-bold text-[var(--vscode-fg)]">工作记忆</span>
                                                    <span className="text-[10px] text-[var(--vscode-fg-subtle)]">可展开查看</span>
                                                </div>
                                                <div className="text-xs text-[var(--vscode-fg-subtle)]">证据与缺口摘要（用于对齐与调试）</div>
                                            </div>
                                            <div className="flex items-center gap-2 text-[10px] text-[var(--vscode-fg-subtle)]">
                                                <button
                                                    type="button"
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        handleCopyContextDebug();
                                                    }}
                                                    title="复制(JSON)"
                                                    className="flex items-center gap-1 px-2 py-1 rounded-[6px] border border-[var(--vscode-sidebar-border)] bg-[var(--vscode-input-bg)] hover:border-[var(--vscode-focus-border)]"
                                                >
                                                    <Copy size={12} />
                                                    <span>{copyStatus || '复制'}</span>
                                                </button>
                                                <motion.div
                                                    animate={{ rotate: expanded ? 180 : 0 }}
                                                    transition={{ duration: 0.15 }}
                                                >
                                                    <ChevronDown size={14} />
                                                </motion.div>
                                            </div>
                                        </button>
                                        {expanded && (
                                            <div className="px-3 pb-3">
                                                <div className="bg-[var(--vscode-input-bg)] border border-[var(--vscode-sidebar-border)] rounded-[6px] p-3 max-h-64 overflow-y-auto custom-scrollbar">
                                                    <pre className="text-[10px] text-[var(--vscode-fg-subtle)] font-mono whitespace-pre-wrap break-words">
                                                        {typeof item.debug === 'string' ? item.debug : JSON.stringify(item.debug, null, 2)}
                                                    </pre>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            }

                            return null;
                        })}

                    </>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* 底部输入框 */}
            <div className="flex-shrink-0 p-3 border-t border-[var(--vscode-sidebar-border)] bg-[var(--vscode-sidebar-bg)]">
                <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        onClick={() => onModeChange('create')}
                            disabled={createDisabled || inputDisabled}
                            title={createDisabled ? '正文非空：主笔仅在正文为空时可用' : '主笔：用于撰写新正文（流式输出）'}
                            className={[
                                "px-2.5 h-7 text-[11px] rounded-[6px] border transition-colors",
                                mode === 'create'
                                    ? "bg-[var(--vscode-list-active)] text-[var(--vscode-list-active-fg)] border-[var(--vscode-input-border)]"
                                    : "bg-[var(--vscode-input-bg)] text-[var(--vscode-fg)] border-[var(--vscode-sidebar-border)] hover:border-[var(--vscode-focus-border)]",
                                (createDisabled || inputDisabled) ? "opacity-50 cursor-not-allowed" : ""
                            ].join(' ')}
                        >
                        主笔
                    </button>
                    <button
                        type="button"
                        onClick={() => onModeChange('edit')}
                        title="编辑：生成差异块，可选择接受或撤销"
                        disabled={inputDisabled}
                            className={[
                                "px-2.5 h-7 text-[11px] rounded-[6px] border transition-colors",
                                mode === 'edit'
                                    ? "bg-[var(--vscode-list-active)] text-[var(--vscode-list-active-fg)] border-[var(--vscode-input-border)]"
                                    : "bg-[var(--vscode-input-bg)] text-[var(--vscode-fg)] border-[var(--vscode-sidebar-border)] hover:border-[var(--vscode-focus-border)]",
                                inputDisabled ? "opacity-50 cursor-not-allowed" : ""
                            ].join(' ')}
                        >
                        编辑
                    </button>
                    {mode === 'edit' ? (
                        <div className="ml-2 flex items-center gap-1">
                            <button
                                type="button"
                                onClick={() => onEditContextModeChange('quick')}
                                title="快速：直接使用本章最新记忆包（不重建）"
                                disabled={inputDisabled}
                                className={[
                                    "px-2 h-7 text-[11px] rounded-[6px] border transition-colors",
                                    editContextMode === 'quick'
                                        ? "bg-[var(--vscode-list-active)] text-[var(--vscode-list-active-fg)] border-[var(--vscode-input-border)]"
                                        : "bg-[var(--vscode-input-bg)] text-[var(--vscode-fg)] border-[var(--vscode-sidebar-border)] hover:border-[var(--vscode-focus-border)]",
                                    inputDisabled ? "opacity-50 cursor-not-allowed" : ""
                                ].join(' ')}
                            >
                                快速
                            </button>
                            <button
                                type="button"
                                onClick={() => onEditContextModeChange('full')}
                                title="完整：先重建本章记忆包（更接近完整检索/分析）"
                                disabled={inputDisabled}
                                className={[
                                    "px-2 h-7 text-[11px] rounded-[6px] border transition-colors",
                                    editContextMode === 'full'
                                        ? "bg-[var(--vscode-list-active)] text-[var(--vscode-list-active-fg)] border-[var(--vscode-input-border)]"
                                        : "bg-[var(--vscode-input-bg)] text-[var(--vscode-fg)] border-[var(--vscode-sidebar-border)] hover:border-[var(--vscode-focus-border)]",
                                    inputDisabled ? "opacity-50 cursor-not-allowed" : ""
                                ].join(' ')}
                            >
                                完整
                            </button>
                        </div>
                    ) : null}
                </div>
                <span className="text-[10px] text-[var(--vscode-fg-subtle)]">
                    {mode === 'edit' ? '差异修改' : '流式撰写'}
                </span>
                </div>
                {mode === 'edit' ? (
                    <div className="flex items-center justify-between mb-2 gap-2">
                        <div className="text-[10px] text-[var(--vscode-fg-subtle)]">
                            {selectionCandidateSummary || '未选中内容'}
                        </div>
                        {selectionCandidateSummary ? (
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    disabled={inputDisabled}
                                    onClick={() => onEditScopeChange('document')}
                                    className={[
                                        "px-2 h-6 text-[10px] rounded-[6px] border transition-colors",
                                        editScope === 'document'
                                            ? "bg-[var(--vscode-list-active)] text-[var(--vscode-list-active-fg)] border-[var(--vscode-input-border)]"
                                            : "bg-[var(--vscode-input-bg)] text-[var(--vscode-fg)] border-[var(--vscode-sidebar-border)] hover:border-[var(--vscode-focus-border)]",
                                        inputDisabled ? "opacity-50 cursor-not-allowed" : ""
                                    ].join(' ')}
                                    title="对全章生成差异修改"
                                >
                                    全章
                                </button>
                                <button
                                    type="button"
                                    disabled={inputDisabled || !selectionAttachedSummary}
                                    onClick={() => onEditScopeChange('selection')}
                                    className={[
                                        "px-2 h-6 text-[10px] rounded-[6px] border transition-colors",
                                        editScope === 'selection'
                                            ? "bg-[var(--vscode-list-active)] text-[var(--vscode-list-active-fg)] border-[var(--vscode-input-border)]"
                                            : "bg-[var(--vscode-input-bg)] text-[var(--vscode-fg)] border-[var(--vscode-sidebar-border)] hover:border-[var(--vscode-focus-border)]",
                                        (inputDisabled || !selectionAttachedSummary) ? "opacity-50 cursor-not-allowed" : ""
                                    ].join(' ')}
                                    title={selectionAttachedSummary ? "仅对已添加的选区生成差异修改（更稳定）" : "请先点击“添加到对话”"}
                                >
                                    选区
                                </button>
                                <button
                                    type="button"
                                    disabled={inputDisabled || (selectionAttachedSummary && !selectionCandidateDifferent)}
                                    onClick={onAttachSelection}
                                    className={[
                                        "px-2 h-6 text-[10px] rounded-[6px] border transition-colors",
                                        "bg-[var(--vscode-input-bg)] text-[var(--vscode-fg)] border-[var(--vscode-sidebar-border)] hover:border-[var(--vscode-focus-border)]",
                                        (inputDisabled || (selectionAttachedSummary && !selectionCandidateDifferent)) ? "opacity-50 cursor-not-allowed" : ""
                                    ].join(' ')}
                                    title="将当前选区添加到对话（后续编辑会使用该选区）"
                                >
                                    {selectionAttachedSummary ? (selectionCandidateDifferent ? '替换选区' : '已添加') : '添加到对话'}
                                </button>
                            </div>
                        ) : null}
                    </div>
                ) : null}
                {mode === 'edit' && selectionAttachedSummary ? (
                    <div className="flex items-center justify-between mb-2 gap-2">
                        <div className="text-[10px] px-2 py-1 rounded-[6px] border border-[var(--vscode-sidebar-border)] bg-[var(--vscode-input-bg)] text-[var(--vscode-fg-subtle)]">
                            {selectionAttachedSummary}
                        </div>
                        <button
                            type="button"
                            disabled={inputDisabled}
                            onClick={onClearAttachedSelection}
                            className={[
                                "p-1 rounded-[6px] border border-[var(--vscode-sidebar-border)] bg-[var(--vscode-input-bg)] text-[var(--vscode-fg-subtle)] hover:text-[var(--vscode-fg)] hover:border-[var(--vscode-focus-border)] transition-colors",
                                inputDisabled ? "opacity-50 cursor-not-allowed" : ""
                            ].join(' ')}
                            title="撤销添加选区"
                            aria-label="撤销添加选区"
                        >
                            <X size={14} />
                        </button>
                    </div>
                ) : null}
                <div className="flex flex-col gap-2">
                    {inputDisabled && inputDisabledReason ? (
                        <div className="text-[10px] text-[var(--vscode-fg-subtle)] border border-[var(--vscode-sidebar-border)] bg-[var(--vscode-input-bg)] rounded-[6px] px-3 py-2">
                            {inputDisabledReason}
                        </div>
                    ) : null}
                    <div className="flex gap-2">
                        <textarea
                            ref={inputRef}
                            rows={1}
                            value={inputValue}
                            onChange={(e) => {
                                setInputValue(e.target.value);
                                updateInputHeight(e.target);
                            }}
                            onKeyDown={handleKeyDown}
                            onFocus={(e) => updateInputHeight(e.target)}
                            disabled={inputDisabled}
                            placeholder={mode === 'edit' ? "输入修改指令（将生成差异块）..." : "输入本章创作指令（正文需为空）..."}
                            className={[
                                "flex-1 px-3 py-2 text-sm border border-[var(--vscode-input-border)] rounded-[6px] bg-[var(--vscode-input-bg)] text-[var(--vscode-fg)] focus:outline-none focus:ring-1 focus:ring-[var(--vscode-focus-border)] focus:border-[var(--vscode-focus-border)] resize-none overflow-hidden min-h-[40px]",
                                inputDisabled ? "opacity-60 cursor-not-allowed" : ""
                            ].join(' ')}
                        />
                        <button
                            onClick={handleSubmit}
                            disabled={inputDisabled || !inputValue.trim()}
                            className="px-3 h-10 bg-[var(--vscode-list-active)] text-[var(--vscode-list-active-fg)] rounded-[6px] border border-[var(--vscode-input-border)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <Send size={16} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AgentStatusPanel;
