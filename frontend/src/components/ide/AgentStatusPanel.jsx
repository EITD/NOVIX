/**
 * AgentStatusPanel - Agent 状态面板（带消息历史和输入框）
 * 
 * 保留对话形式的同时，在 Agent 工作时显示状态卡片
 * - 消息历史记录（用户可追溯修改意见）
 * - 动态 Agent 状态卡片
 * - 底部输入框用于用户交互
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Book, PenTool, Edit3, User, Bot, AlertCircle, Send, Sparkles } from 'lucide-react';

// 状态灯组件
const StatusLight = ({ status }) => {
    const colors = {
        idle: 'bg-gray-300',
        working: 'bg-green-500 animate-pulse',
        done: 'bg-green-500',
        error: 'bg-red-500'
    };

    return (
        <span className={`w-2 h-2 rounded-full ${colors[status] || colors.idle}`} />
    );
};

// Agent 状态卡片（嵌入消息流中）
const AgentCard = ({
    icon: Icon,
    name,
    status,
    description,
    expandable = false,
    expandedContent = null,
}) => {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-100 rounded-xl overflow-hidden my-2"
        >
            <div
                className={`flex items-center justify-between p-3 ${expandable ? 'cursor-pointer hover:bg-amber-50/50' : ''}`}
                onClick={expandable ? () => setIsExpanded(!isExpanded) : undefined}
            >
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                        <Icon size={16} className="text-amber-700" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-ink-800">{name}</span>
                            <StatusLight status={status} />
                        </div>
                        {description && (
                            <p className="text-xs text-ink-500">{description}</p>
                        )}
                    </div>
                </div>

                {expandable && status === 'done' && (
                    <motion.div
                        animate={{ rotate: isExpanded ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        <ChevronDown size={16} className="text-ink-400" />
                    </motion.div>
                )}
            </div>

            {/* 展开内容 - 原始 JSON */}
            <AnimatePresence>
                {expandable && isExpanded && expandedContent && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="px-3 pb-3">
                            <div className="bg-white/80 border border-amber-100 rounded-lg p-2 max-h-48 overflow-y-auto custom-scrollbar">
                                <pre className="text-[10px] text-ink-600 font-mono whitespace-pre-wrap break-words">
                                    {typeof expandedContent === 'string'
                                        ? expandedContent
                                        : JSON.stringify(expandedContent, null, 2)}
                                </pre>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

// 消息项组件
const MessageItem = ({ type, content, time }) => {
    const styles = {
        user: 'bg-primary text-white ml-8',
        assistant: 'bg-ink-100 text-ink-700 mr-8',
        system: 'bg-amber-50 text-amber-700 border border-amber-100 mr-8',
        error: 'bg-red-50 text-red-700 border border-red-200 mr-8',
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className={`px-3 py-2 rounded-lg text-xs my-1.5 ${styles[type] || styles.system}`}
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

// 主面板组件
const AgentStatusPanel = ({
    mode = 'create',
    archivistStatus = 'idle',
    writerStatus = 'idle',
    editorStatus = 'idle',
    archivistOutput = null,
    messages = [],
    onSubmit = () => { },
    className = ''
}) => {
    const [inputValue, setInputValue] = useState('');
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    // 自动滚动到底部
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, archivistStatus, writerStatus, editorStatus]);

    // 判断是否显示 Agent 卡片
    const showArchivistCard = archivistStatus !== 'idle';
    const showWriterCard = mode === 'create' && writerStatus !== 'idle';
    const showEditorCard = mode === 'edit' && editorStatus !== 'idle';

    const hasAnyContent = messages.length > 0 || showArchivistCard || showWriterCard || showEditorCard;

    const handleSubmit = () => {
        if (!inputValue.trim()) return;
        onSubmit(inputValue);
        setInputValue('');
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    return (
        <div className={`flex flex-col h-full ${className}`}>
            {/* 面板标题 */}
            <div className="px-4 py-3 border-b border-border flex-shrink-0">
                <h2 className="text-sm font-bold text-ink-700">💬 对话与进度</h2>
            </div>

            {/* 消息列表（含 Agent 卡片） */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
                {!hasAnyContent ? (
                    /* 欢迎提示 */
                    <div className="h-full flex flex-col items-center justify-center text-center p-6">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center mb-4">
                            <Sparkles size={28} className="text-amber-600" />
                        </div>
                        <h3 className="text-sm font-bold text-ink-700 mb-2">开始创作</h3>
                        <p className="text-xs text-ink-500 max-w-[200px]">
                            选择章节后，在下方输入创作指令开始生成，或直接输入修改意见
                        </p>
                    </div>
                ) : (
                    <>
                        {/* 现有消息 */}
                        {messages.map((msg, idx) => (
                            <MessageItem
                                key={idx}
                                type={msg.type}
                                content={msg.content}
                                time={msg.time}
                            />
                        ))}

                        {/* Agent 状态卡片 - 创作模式 */}
                        {mode === 'create' && showArchivistCard && (
                            <AgentCard
                                icon={Book}
                                name="档案员"
                                status={archivistStatus}
                                description={
                                    archivistStatus === 'done'
                                        ? '场景简报已准备 (点击查看)'
                                        : archivistStatus === 'working'
                                            ? '正在整理资料...'
                                            : ''
                                }
                                expandable={archivistStatus === 'done' && archivistOutput}
                                expandedContent={archivistOutput}
                            />
                        )}

                        {showWriterCard && (
                            <AgentCard
                                icon={PenTool}
                                name="主笔"
                                status={writerStatus}
                                description={
                                    writerStatus === 'done'
                                        ? '草稿已完成'
                                        : writerStatus === 'working'
                                            ? '正在撰写...'
                                            : ''
                                }
                            />
                        )}

                        {/* Agent 状态卡片 - 编辑模式 */}
                        {showEditorCard && (
                            <AgentCard
                                icon={Edit3}
                                name="编辑"
                                status={editorStatus}
                                description={
                                    editorStatus === 'done'
                                        ? '修改建议已生成'
                                        : editorStatus === 'working'
                                            ? '正在处理修改意见...'
                                            : ''
                                }
                            />
                        )}
                    </>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* 底部输入框 */}
            <div className="flex-shrink-0 p-3 border-t border-border bg-background">
                <div className="flex gap-2">
                    <input
                        ref={inputRef}
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="输入创作指令或修改意见..."
                        className="flex-1 px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    />
                    <button
                        onClick={handleSubmit}
                        disabled={!inputValue.trim()}
                        className="px-3 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <Send size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AgentStatusPanel;
