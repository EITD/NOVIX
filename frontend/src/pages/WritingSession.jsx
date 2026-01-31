import { useState, useEffect, useRef, useCallback } from 'react';
import useSWR from 'swr';
import { motion, AnimatePresence } from 'framer-motion';
import { useParams, useNavigate } from 'react-router-dom';
import { sessionAPI, createWebSocket, draftsAPI, cardsAPI, projectsAPI, volumesAPI } from '../api';
import { Button, Input, Card } from '../components/ui/core';
import { WritingCanvas } from '../components/writing/WritingCanvas';
import AgentsPanel from '../components/ide/panels/AgentsPanel';
import AgentStatusPanel from '../components/ide/AgentStatusPanel';
import {
    Play, RotateCcw, Check, MessageSquare, AlertTriangle,
    Terminal, Sparkles, Save, ChevronLeft, Bot, PanelRight, Plus,
    BookOpen, PenTool, Eraser, X, Send, Loader2
} from 'lucide-react';
import { ChapterCreateDialog } from '../components/project/ChapterCreateDialog';
import { IDELayout } from '../components/ide/IDELayout';
import { IDEProvider } from '../context/IDEContext';
import { useIDE } from '../context/IDEContext';
import ExtractionPreview from '../components/ExtractionPreview';
import EntityActivityDashboard from '../components/writing/EntityActivityDashboard';
import { Activity } from 'lucide-react';

// Helper fetcher
const fetchChapterContent = async ([_, projectId, chapter]) => {
    try {
        // 1. Try to get Final Draft
        const resp = await draftsAPI.getFinal(projectId, chapter);
        return resp.data?.content || '';
    } catch (e) {
        // If final not found (404), try to get latest version
        try {
            const versionsResp = await draftsAPI.listVersions(projectId, chapter);
            const versions = versionsResp.data || [];
            if (versions.length > 0) {
                const latestVer = versions[versions.length - 1];
                const draftResp = await draftsAPI.getDraft(projectId, chapter, latestVer);
                return draftResp.data?.content || '';
            }
        } catch (vErr) {
            console.log('No drafts found, starting fresh.');
        }
    }
    return '';
};

function WritingSessionContent({ isEmbedded = false }) {
    const { projectId } = useParams();
    const navigate = useNavigate();
    const { state, dispatch } = useIDE();

    // 加载项目数据
    const [project, setProject] = useState(null);
    useEffect(() => {
        if (projectId) {
            projectsAPI.get(projectId).then(res => setProject(res.data));
            dispatch({ type: 'SET_PROJECT_ID', payload: projectId });
        }
    }, [projectId, dispatch]);



    // UI State
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [showStartModal, setShowStartModal] = useState(true);
    const [showChapterDialog, setShowChapterDialog] = useState(false);
    const [chapters, setChapters] = useState([]);

    // Save/Analyze UI
    const [showSaveDialog, setShowSaveDialog] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Proposal State
    const [proposals, setProposals] = useState([]);
    const [rejectedItems, setRejectedItems] = useState([]);

    // Logic State
    const [status, setStatus] = useState('idle'); // idle, starting, editing, waiting_feedback, completed
    const [messages, setMessages] = useState([]);
    const [currentDraft, setCurrentDraft] = useState(null);
    const [manualContent, setManualContent] = useState(''); // Textarea content
    const [review, setReview] = useState(null);
    const [sceneBrief, setSceneBrief] = useState(null);
    const [draftV1, setDraftV1] = useState(null);
    const [feedback, setFeedback] = useState('');

    const [showActivity, setShowActivity] = useState(false);
    const [expandedSteps, setExpandedSteps] = useState({ review: true, editor: true });

    const toggleStep = (step) => {
        setExpandedSteps(prev => ({ ...prev, [step]: !prev[step] }));
    };

    // WebSocket
    const wsRef = useRef(null);
    const traceWsRef = useRef(null);
    const [wsConnected, setWsConnected] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);

    // Trace Events for AgentTimeline
    const [traceEvents, setTraceEvents] = useState([]);
    const [agentTraces, setAgentTraces] = useState([]);

    // Chapter Info
    const [chapterInfo, setChapterInfo] = useState({
        chapter: null,
        chapter_title: null,
        content: null,
    });

    // V3 Extraction State (Phase 3)
    const [extraction, setExtraction] = useState(null);
    const [showExtraction, setShowExtraction] = useState(false);

    // Draft version state
    const [currentDraftVersion, setCurrentDraftVersion] = useState('v1');

    // Agent Status State (for AgentStatusPanel)
    const [agentMode, setAgentMode] = useState('create'); // 'create' | 'edit'
    const [archivistStatus, setArchivistStatus] = useState('idle');
    const [writerStatus, setWriterStatus] = useState('idle');
    const [editorStatus, setEditorStatus] = useState('idle');
    const [archivistOutput, setArchivistOutput] = useState(null);

    useEffect(() => {
        const ws = createWebSocket(projectId, (data) => {
            if (data.type === 'start_ack') addMessage('system', 'Session started!');
            if (data.type === 'review') handleReview(data.data);
            if (data.type === 'scene_brief') handleSceneBrief(data.data);
            if (data.type === 'draft_v1') handleDraftV1(data.data);
            if (data.type === 'final_draft') handleFinalDraft(data.data);
            if (data.type === 'error') addMessage('error', data.message);

            // Handle backend status updates (progress)
            if (data.status && data.message) {
                addMessage('system', `> ${data.message}`);
            }
        });
        wsRef.current = ws;
        setWsConnected(true);

        // Connect to Trace WebSocket for AgentTimeline
        const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const wsHost = window.location.host;
        const traceWs = new WebSocket(`${wsProtocol}://${wsHost}/ws/trace`);

        traceWs.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'trace_event' && data.payload) {
                setTraceEvents(prev => [...prev.slice(-99), data.payload]); // Keep last 100 events
            }
            if (data.type === 'agent_trace_update' && data.payload) {
                setAgentTraces(prev => {
                    const existing = prev.findIndex(t => t.agent_name === data.payload.agent_name);
                    if (existing >= 0) {
                        const updated = [...prev];
                        updated[existing] = data.payload;
                        return updated;
                    }
                    return [...prev, data.payload];
                });
            }
        };

        traceWsRef.current = traceWs;

        return () => {
            if (ws) ws.close();
            if (traceWs) traceWs.close();
        };
    }, [projectId]);

    // Card State
    const [activeCard, setActiveCard] = useState(null);
    const [cardForm, setCardForm] = useState({ name: '', identity: '', description: '' });

    // SWR for Chapter Content
    const { data: loadedContent, mutate: mutateChapter } = useSWR(
        chapterInfo.chapter ? ['chapter', projectId, chapterInfo.chapter] : null,
        fetchChapterContent,
        {
            revalidateOnFocus: false,
            dedupingInterval: 60000, // Cache for 1 minute before checking again
            keepPreviousData: false // Don't show previous chapter data while loading (we handle this with manualContent update)
        }
    );

    const { data: volumes = [] } = useSWR(
        projectId ? ['volumes', projectId] : null,
        () => volumesAPI.list(projectId).then(res => res.data),
        { revalidateOnFocus: false }
    );

    // Sync SWR data to manualContent
    useEffect(() => {
        if (loadedContent !== undefined) {
            setManualContent(loadedContent);
            dispatch({ type: 'SET_WORD_COUNT', payload: loadedContent.length });
            // Only center cursor if we just switched chapters (optional optimization)
            // dispatch({ type: 'SET_CURSOR_POSITION', payload: { line: 1, column: 1 } });
        }
    }, [loadedContent, dispatch]);


    // 监听 Context 中的文档选择（章节或卡片）
    useEffect(() => {
        if (!state.activeDocument) return;

        if (state.activeDocument.type === 'chapter' && state.activeDocument.id) {
            setActiveCard(null); // Clear card state
            handleChapterSelect(state.activeDocument.id);
        } else if (['character', 'world'].includes(state.activeDocument.type)) {
            // Switch to Card Mode
            setChapterInfo({ chapter: null, chapter_title: null, content: null });

            // Initial setup with basic info
            const cardData = state.activeDocument.data || { name: state.activeDocument.id };
            setActiveCard({ ...cardData, type: state.activeDocument.type });
            setCardForm({
                name: cardData.name || '',
                identity: '',
                description: ''
            });
            setStatus('card_editing');

            // Fetch full details
            const fetchCardDetails = async () => {
                try {
                    let resp;
                    if (state.activeDocument.type === 'character') {
                        resp = await cardsAPI.getCharacter(projectId, state.activeDocument.id);
                    } else {
                        resp = await cardsAPI.getWorld(projectId, state.activeDocument.id);
                    }
                    if (resp.data) {
                        const fullData = resp.data;
                        setActiveCard(prev => ({ ...prev, ...fullData }));

                        // Populate form based on type
                        if (state.activeDocument.type === 'character') {
                            setCardForm({
                                name: fullData.name || '',
                                identity: fullData.identity || '',
                                appearance: fullData.appearance || '',
                                motivation: fullData.motivation || '',
                                personality: Array.isArray(fullData.personality) ? fullData.personality.join(', ') : (fullData.personality || ''),
                                speech_pattern: fullData.speech_pattern || '',
                                arc: fullData.arc || '',
                                boundaries: fullData.boundaries || []
                            });
                        } else {
                            setCardForm({
                                name: fullData.name || '',
                                category: fullData.category || '',
                                description: fullData.description || '',
                                rules: Array.isArray(fullData.rules) ? fullData.rules.join('\n') : (fullData.rules || ''),
                                immutable: fullData.immutable || false
                            });
                        }
                    }
                } catch (e) {
                    console.error("Failed to fetch card details", e);
                    addMessage('error', '加载卡片详情失败: ' + e.message);
                }
            };

            if (state.activeDocument.id) {
                fetchCardDetails();
            }
        }
    }, [state.activeDocument]);

    useEffect(() => {
        loadChapters();
    }, [projectId]);

    // 监听 Context 中的 Dialog 状态
    useEffect(() => {
        if (state.createChapterDialogOpen !== showChapterDialog) {
            setShowChapterDialog(state.createChapterDialogOpen);
        }
    }, [state.createChapterDialogOpen]);

    const loadChapters = async () => {
        try {
            const resp = await draftsAPI.listChapters(projectId);
            const list = resp.data || [];
            setChapters(list);
        } catch (e) {
            console.error('Failed to load chapters:', e);
        }
    };

    const handleChapterSelect = async (chapter) => {
        // Just set the chapter, let SWR handle fetching
        setChapterInfo({ chapter, chapter_title: `Chapter ${chapter}`, content: '' }); // content will be filled by SWR
        setStatus('editing');
    };

    const handleChapterCreate = async (chapterData) => {
        // Handle object from ChapterCreateDialog or direct arguments
        const chapterNum = typeof chapterData === 'object' ? chapterData.id : chapterData;
        const chapterTitle = typeof chapterData === 'object' ? chapterData.title : arguments[1];

        // Persist the new chapter immediately
        setIsSaving(true);
        try {
            await draftsAPI.updateContent(projectId, chapterNum, {
                content: '',
                title: chapterTitle
            });
            addMessage('system', `章节 ${chapterNum} 已创建`);
        } catch (e) {
            addMessage('error', '创建章节失败: ' + e.message);
        } finally {
            setIsSaving(false);
        }

        setChapterInfo({ chapter: chapterNum, chapter_title: chapterTitle, content: '' });
        setManualContent('');
        setShowChapterDialog(false);
        setStatus('idle');
        await loadChapters();
    };

    const addMessage = (type, content) => {
        setMessages(prev => [...prev, { type, content, time: new Date() }]);
    };

    // Handlers
    const handleStart = async (chapter, mode, instruction = null) => {
        if (!chapter) {
            alert('Please select a chapter first');
            return;
        }

        setStatus('starting');
        setIsGenerating(true);

        setAgentMode('create');
        setArchivistStatus('working');
        setWriterStatus('idle');
        setEditorStatus('idle');
        setArchivistOutput(null);

        addMessage('system', '档案员正在整理设定...');

        try {
            const payload = {
                chapter: String(chapter),
                chapter_title: chapterInfo.chapter_title || `Chapter ${chapter}`,
                chapter_goal: instruction || 'Auto-generation based on context',
                target_word_count: 3000
            };

            const resp = await sessionAPI.start(projectId, payload);
            const result = resp.data;

            if (!result.success) {
                setArchivistStatus('error');
                throw new Error(result.error || 'Session start failed');
            }

            setArchivistStatus('done');
            setWriterStatus('done');
            setEditorStatus('done');

            if (result.scene_brief) {
                setSceneBrief(result.scene_brief);
                setArchivistOutput(result.scene_brief);
            }

            if (result.review) {
                setReview(result.review);
            }

            if (result.draft_v1) {
                setDraftV1(result.draft_v1);
            }

            const finalDraft = result.draft_v2 || result.draft_v1;
            if (finalDraft) {
                setCurrentDraft(finalDraft);
                setManualContent(finalDraft.content || '');
                setCurrentDraftVersion(result.draft_v2 ? 'v2' : 'v1');
            }

            if (result.proposals) {
                setProposals(result.proposals);
            }

            setStatus('waiting_feedback');
            addMessage('system', '草稿已生成，可继续反馈或手动编辑。');
            setIsGenerating(false);
        } catch (e) {
            addMessage('error', 'Failed to start: ' + e.message);
            setStatus('idle');
            setIsGenerating(false);
            setArchivistStatus('error');
        }
    };

    const handleReview = (data) => {
        setReview(data);
        setStatus('editing');
        addMessage('system', 'Review received');
        setIsGenerating(false);
    };

    const handleSceneBrief = (data) => {
        setSceneBrief(data);
        addMessage('system', 'Scene brief received');
    };

    const handleDraftV1 = (data) => {
        setDraftV1(data);
        setManualContent(data.content || '');
        setStatus('waiting_feedback');
        addMessage('system', 'Draft V1 ready! Review and submit feedback or edit manually.');
        setIsGenerating(false);
    };

    const handleFinalDraft = (data) => {
        setCurrentDraft(data);
        setManualContent(data.content || '');
        setStatus('completed');
        addMessage('system', 'Final draft completed!');
        setIsGenerating(false);
    };

    const handleSubmitFeedback = async (feedbackOverride) => {
        const textToSubmit = typeof feedbackOverride === 'string' ? feedbackOverride : feedback;
        if (!textToSubmit?.trim()) return;

        try {
            setIsGenerating(true);
            setStatus('editing');

            setAgentMode('edit');
            setEditorStatus('working');

            addMessage('user', `?? ????: ${textToSubmit}`);
            addMessage('system', '??????...');
            setFeedback('');

            const resp = await sessionAPI.submitFeedback(projectId, {
                chapter: String(chapterInfo.chapter),
                feedback: textToSubmit,
                action: 'revise'
            });

            const result = resp.data;
            if (result.success) {
                setEditorStatus('done');
                if (result.draft) {
                    setCurrentDraft(result.draft);
                    setManualContent(result.draft.content || '');
                }
                if (result.version) {
                    setCurrentDraftVersion(result.version);
                }
                setStatus('waiting_feedback');
                addMessage('system', '?????????????????');
            } else {
                setEditorStatus('error');
                throw new Error(result.error || 'Edit failed');
            }

            setIsGenerating(false);
        } catch (e) {
            addMessage('error', '????: ' + e.message);
            setEditorStatus('error');
            setIsGenerating(false);
            setStatus('waiting_feedback');
        }
    };

    const handleManualSave = async () => {
        if (!chapterInfo.chapter) return;
        setIsSaving(true);
        try {
            const resp = await draftsAPI.updateContent(projectId, chapterInfo.chapter, { content: manualContent });
            if (resp.data.success) {
                addMessage('system', '草稿已保存');
                dispatch({ type: 'SET_SAVED' });
                setShowSaveDialog(true);
                // Update SWR cache
                mutateChapter(manualContent, false);
            }
        } catch (e) {
            addMessage('error', '保存失败: ' + e.message);
        } finally {
            setIsSaving(false);
        }
    };

    // V3: Handle finalize chapter with confirmed extraction (Phase 3)
    const handleFinalizeChapter = async (confirmedExtraction) => {
        if (!chapterInfo.chapter) return;
        setIsSaving(true);

        try {
            const resp = await sessionAPI.post(`/v3/${projectId}/finalize`, {
                chapter: chapterInfo.chapter,
                draft_content: manualContent,
                confirmed_extraction: confirmedExtraction
            });

            if (resp.data.success) {
                const stats = resp.data.stats || {};
                addMessage('system', `✅ 章节已保存! 事实: ${stats.facts_saved || 0}, 新实体: ${stats.entities_created || 0}`);
                setShowExtraction(false);
                setExtraction(null);
                dispatch({ type: 'SET_SAVED' });
            }
        } catch (e) {
            addMessage('error', '保存失败: ' + e.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancelExtraction = () => {
        setShowExtraction(false);
        // Keep extraction data in case user wants to revise
    };

    // Phase 4.3: Handle user answer for AskUser
    // Card Handlers
    const handleCardSave = async () => {
        if (!activeCard) return;
        setIsSaving(true);
        try {
            if (activeCard.type === 'character') {
                const payload = {
                    ...cardForm,
                    personality: typeof cardForm.personality === 'string' ? cardForm.personality.split(',').map(s => s.trim()).filter(Boolean) : cardForm.personality,
                    // ensure other array fields if needed
                };
                await cardsAPI.updateCharacter(projectId, activeCard.name, payload);
            } else {
                const payload = {
                    ...cardForm,
                    rules: typeof cardForm.rules === 'string' ? cardForm.rules.split('\n').filter(Boolean) : cardForm.rules
                };
                await cardsAPI.updateWorld(projectId, activeCard.name, payload);
            }
            addMessage('system', '卡片已更新');
            dispatch({ type: 'SET_SAVED' });
        } catch (e) {
            addMessage('error', '卡片保存失败: ' + e.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleAnalyzeConfirm = async () => {
        setShowSaveDialog(false);
        if (!chapterInfo.chapter) return;
        try {
            const resp = await sessionAPI.analyze(projectId, { chapter: chapterInfo.chapter });
            if (resp.data.success) {
                addMessage('system', '分析任务已提交');
            }
        } catch (e) {
            addMessage('error', '分析失败: ' + e.message);
        }
    };

    const renderMainContent = () => {
        return (
            <AnimatePresence mode="wait">
                {status === 'card_editing' && activeCard ? (
                    <motion.div
                        key="card-editor"
                        initial={{ opacity: 0, scale: 0.98, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.98, y: -10 }}
                        transition={{ duration: 0.3, ease: "easeOut" }}
                        className="h-full flex flex-col max-w-3xl mx-auto w-full pt-4"
                    >
                        <div className="flex items-center justify-between mb-6 pb-4 border-b border-border">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-primary/10 rounded-lg text-primary">
                                    {activeCard.type === 'character' ? <div className="i-lucide-user" /> : <div className="i-lucide-globe" />}
                                    {activeCard.type === 'character' ? '👤' : '🌍'}
                                </div>
                                <div>
                                    <h1 className="text-2xl font-serif font-bold text-ink-900">{cardForm.name || '未命名卡片'}</h1>
                                    <p className="text-xs text-ink-400 font-mono uppercase tracking-wider">{activeCard.type === 'character' ? 'CHARACTER CARD' : 'WORLD CARD'}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    setStatus('idle');
                                    setActiveCard(null);
                                }}
                                className="p-2 hover:bg-ink-100 rounded-lg transition-colors text-ink-400 hover:text-ink-700"
                                title="关闭卡片编辑"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="space-y-6 flex-1 overflow-y-auto px-1 pb-20">
                            {/* Common: Name */}
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-ink-500 uppercase tracking-wider">名称 / Name</label>
                                <Input
                                    value={cardForm.name}
                                    onChange={e => setCardForm(prev => ({ ...prev, name: e.target.value }))}
                                    className="font-serif text-lg bg-surface/50 font-bold"
                                />
                            </div>

                            {/* Character Fields */}
                            {activeCard.type === 'character' && (
                                <>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-ink-500 uppercase tracking-wider">身份 / Identity</label>
                                        <Input
                                            value={cardForm.identity || ''}
                                            onChange={e => setCardForm(prev => ({ ...prev, identity: e.target.value }))}
                                            placeholder="e.g. 25岁，私家侦探"
                                            className="bg-surface/50"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-ink-500 uppercase tracking-wider">外貌 / Appearance</label>
                                        <textarea
                                            className="w-full min-h-[80px] p-3 rounded-md border border-input bg-surface/50 text-sm focus:ring-1 focus:ring-primary resize-none overflow-hidden"
                                            value={cardForm.appearance || ''}
                                            onChange={e => {
                                                setCardForm(prev => ({ ...prev, appearance: e.target.value }));
                                                e.target.style.height = 'auto';
                                                e.target.style.height = e.target.scrollHeight + 'px';
                                            }}
                                            onFocus={e => {
                                                e.target.style.height = 'auto';
                                                e.target.style.height = e.target.scrollHeight + 'px';
                                            }}
                                            placeholder="外貌特征描述..."
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-ink-500 uppercase tracking-wider">核心动机 / Motivation</label>
                                        <Input
                                            value={cardForm.motivation || ''}
                                            onChange={e => setCardForm(prev => ({ ...prev, motivation: e.target.value }))}
                                            placeholder="角色的核心驱动力..."
                                            className="bg-surface/50"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-ink-500 uppercase tracking-wider">性格特征 / Personality (逗号分隔)</label>
                                        <Input
                                            value={cardForm.personality || ''}
                                            onChange={e => setCardForm(prev => ({ ...prev, personality: e.target.value }))}
                                            placeholder="勇敢, 鲁莽, 忠诚..."
                                            className="bg-surface/50"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-ink-500 uppercase tracking-wider">说话风格 / Speech Pattern</label>
                                        <Input
                                            value={cardForm.speech_pattern || ''}
                                            onChange={e => setCardForm(prev => ({ ...prev, speech_pattern: e.target.value }))}
                                            placeholder="语速快，喜欢用比喻..."
                                            className="bg-surface/50"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-ink-500 uppercase tracking-wider">角色弧光 / Arc</label>
                                        <textarea
                                            className="w-full min-h-[100px] p-3 rounded-md border border-input bg-surface/50 text-sm focus:ring-1 focus:ring-primary resize-none overflow-hidden"
                                            value={cardForm.arc || ''}
                                            onChange={e => {
                                                setCardForm(prev => ({ ...prev, arc: e.target.value }));
                                                e.target.style.height = 'auto';
                                                e.target.style.height = e.target.scrollHeight + 'px';
                                            }}
                                            onFocus={e => {
                                                e.target.style.height = 'auto';
                                                e.target.style.height = e.target.scrollHeight + 'px';
                                            }}
                                            placeholder="角色的成长与变化路径..."
                                        />
                                    </div>
                                </>
                            )}

                            {/* World Fields */}
                            {activeCard.type === 'world' && (
                                <>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-ink-500 uppercase tracking-wider">类别 / Category</label>
                                        <Input
                                            value={cardForm.category || ''}
                                            onChange={e => setCardForm(prev => ({ ...prev, category: e.target.value }))}
                                            placeholder="e.g. 地点, 魔法, 组织..."
                                            className="bg-surface/50"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-ink-500 uppercase tracking-wider">详细描述 / Description</label>
                                        <textarea
                                            className="w-full min-h-[200px] p-3 rounded-md border border-input bg-surface/50 text-sm focus:ring-1 focus:ring-primary resize-none overflow-hidden"
                                            value={cardForm.description || ''}
                                            onChange={e => {
                                                setCardForm(prev => ({ ...prev, description: e.target.value }));
                                                e.target.style.height = 'auto';
                                                e.target.style.height = e.target.scrollHeight + 'px';
                                            }}
                                            onFocus={e => {
                                                e.target.style.height = 'auto';
                                                e.target.style.height = e.target.scrollHeight + 'px';
                                            }}
                                            placeholder="关于此设定的详细描述..."
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-ink-500 uppercase tracking-wider">规则与约束 / Rules (每行一条)</label>
                                        <textarea
                                            className="w-full min-h-[150px] p-3 rounded-md border border-input bg-surface/50 text-sm focus:ring-1 focus:ring-primary resize-none overflow-hidden font-mono"
                                            value={cardForm.rules || ''}
                                            onChange={e => {
                                                setCardForm(prev => ({ ...prev, rules: e.target.value }));
                                                e.target.style.height = 'auto';
                                                e.target.style.height = e.target.scrollHeight + 'px';
                                            }}
                                            onFocus={e => {
                                                e.target.style.height = 'auto';
                                                e.target.style.height = e.target.scrollHeight + 'px';
                                            }}
                                            placeholder="该设定涉及的规则..."
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                    </motion.div>
                ) : !chapterInfo.chapter ? (
                    <motion.div
                        key="empty-state"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="h-[60vh] flex items-center justify-center"
                    >
                        <div className="text-center">
                            <h1 className="text-4xl font-serif font-bold text-ink-900/30 mb-4">
                                NOVIX IDE
                            </h1>
                            <p className="text-sm text-ink-500">
                                请在左侧选择资源，或使用 Cmd+B 切换面板
                            </p>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div
                        key="chapter-editor"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.3 }}
                        className="h-full flex flex-col relative"
                    >
                        <h1 className="text-2xl font-serif font-bold text-ink-900 mb-4 pb-3 border-b border-border flex-shrink-0">
                            {chapterInfo.chapter_title || `第 ${chapterInfo.chapter} 章`}
                        </h1>
                        <textarea
                            className="flex-1 w-full resize-none border-none outline-none bg-transparent text-base font-serif text-ink-900 leading-relaxed focus:ring-0 placeholder:text-ink-300"
                            value={manualContent}
                            onChange={(e) => {
                                setManualContent(e.target.value);
                                dispatch({ type: 'SET_WORD_COUNT', payload: e.target.value.length });
                                dispatch({ type: 'SET_UNSAVED' });
                            }}
                            onSelect={(e) => {
                                const text = e.target.value.substring(0, e.target.selectionStart);
                                const lines = text.split('\n');
                                dispatch({
                                    type: 'SET_CURSOR_POSITION',
                                    payload: {
                                        line: lines.length,
                                        column: lines[lines.length - 1].length + 1
                                    }
                                });
                            }}
                            placeholder="开始写作..."
                            disabled={!chapterInfo.chapter || isGenerating}
                            spellCheck={false}
                        />

                        {/* V3: Extraction Preview (Phase 3) */}
                        {showExtraction && extraction && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                transition={{ duration: 0.3 }}
                                className="mt-4"
                            >
                                <ExtractionPreview
                                    extraction={extraction}
                                    onConfirm={handleFinalizeChapter}
                                    onCancel={handleCancelExtraction}
                                />
                            </motion.div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        );
    };

    const rightPanelContent = (
        <AgentsPanel traceEvents={traceEvents} agentTraces={agentTraces}>
            <AgentStatusPanel
                mode={agentMode}
                archivistStatus={archivistStatus}
                writerStatus={writerStatus}
                editorStatus={editorStatus}
                archivistOutput={archivistOutput}
                messages={messages}
                onSubmit={(text) => {
                    // Route based on content state
                    const hasContent = manualContent && manualContent.length > 50;

                    if (status === 'waiting_feedback' || hasContent) {
                        // Has content - treat as edit feedback
                        handleSubmitFeedback(text);
                    } else if (chapterInfo.chapter) {
                        // No content but chapter selected - start new generation
                        addMessage('user', text);
                        handleStart(chapterInfo.chapter, 'deep', text);
                    } else {
                        // No chapter selected
                        addMessage('system', '请先选择章节以开始生成。');
                    }
                }}
            />
        </AgentsPanel>
    );


    const titleBarProps = {
        projectName: project?.name,
        // Show Card Name in Title if card editing
        chapterTitle: status === 'card_editing' ? cardForm.name : (chapterInfo.chapter ? (chapterInfo.chapter_title || `第 ${chapterInfo.chapter} 章`) : null)
    };

    return (
        <IDELayout rightPanelContent={rightPanelContent} titleBarProps={titleBarProps}>
            <div className="w-full h-full px-8 py-6">
                {renderMainContent()}
            </div>

            {/* Action Buttons - Moved to top right to avoid input area overlap */}
            <div className="fixed top-20 right-10 z-20 flex gap-2">
                {(chapterInfo.chapter) && (
                    <Button
                        onClick={() => setShowActivity(true)}
                        variant="secondary"
                        className="shadow-md bg-surface/90 backdrop-blur text-ink-900 border border-border hover:bg-ink-100"
                        size="sm"
                    >
                        <Activity size={14} className="mr-2" />
                        活跃度
                    </Button>
                )}

                {(chapterInfo.chapter || status === 'card_editing') && !isGenerating && (
                    <Button
                        onClick={status === 'card_editing' ? handleCardSave : handleManualSave}
                        disabled={isSaving}
                        className="shadow-md"
                        size="sm"
                    >
                        <Save size={14} className="mr-2" />
                        {isSaving ? "保存中..." : "保存"}
                    </Button>
                )}
            </div>

            <AnimatePresence>
                {showActivity && (
                    <EntityActivityDashboard
                        projectId={projectId}
                        chapterId={chapterInfo.chapter}
                        onClose={() => setShowActivity(false)}
                    />
                )}
            </AnimatePresence>

            <ChapterCreateDialog
                open={showChapterDialog}
                onClose={() => {
                    setShowChapterDialog(false);
                    dispatch({ type: 'CLOSE_CREATE_CHAPTER_DIALOG' });
                }}
                onConfirm={handleChapterCreate}
                existingChapters={chapters.map(c => ({ id: c, title: '' }))}
                volumes={volumes}
                defaultVolumeId={state.selectedVolumeId || 'V1'}
            />

            {showSaveDialog && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in">
                    <Card className="w-full max-w-md p-6 space-y-4 shadow-xl border-border bg-background relative">
                        <Button variant="ghost" size="icon" className="absolute right-4 top-4 text-ink-400 hover:text-ink-600" onClick={() => setShowSaveDialog(false)}>
                            <X size={16} />
                        </Button>
                        <div className="flex flex-col items-center justify-center space-y-2">
                            <div className="rounded-full bg-green-100 p-3 text-green-600">
                                <Check size={32} />
                            </div>
                            <h3 className="text-xl font-bold text-ink-900">保存成功</h3>
                            <p className="text-center text-ink-500">
                                章节内容已成功保存到云端。<br />
                                事实和状态已更新。
                            </p>
                        </div>
                        <div className="flex justify-center pt-2">
                            <Button onClick={() => setShowSaveDialog(false)} className="w-full">
                                知道了
                            </Button>
                        </div>
                    </Card>
                </div>
            )}

            {isGenerating && (
                <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-full shadow-lg animate-pulse">
                    <Loader2 size={16} className="animate-spin" />
                    <span className="text-sm font-medium">正在生成...</span>
                </div>
            )}
        </IDELayout >
    );
}

export default function WritingSession(props) {
    const { projectId } = useParams();
    return (
        <IDEProvider projectId={projectId}>
            <WritingSessionContent {...props} />
        </IDEProvider>
    );
}
