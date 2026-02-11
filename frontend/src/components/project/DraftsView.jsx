import React, { useState, useEffect } from 'react';
import { draftsAPI } from '../../api';
import { Button, Card } from '../ui/core';
import { FileText, Trash2, Eye, EyeOff, BookOpen, Clock, ChevronRight, Sparkles, Drama } from 'lucide-react';

/**
 * DraftsView - 章节草稿与版本视图
 * 展示章节列表、版本与内容预览。
 */
export function DraftsView({ projectId }) {
  const [chapters, setChapters] = useState([]);
  const [selectedChapter, setSelectedChapter] = useState('');
  const [versions, setVersions] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadChapters();
  }, [projectId]);

  useEffect(() => {
    if (selectedChapter) loadChapterData();
  }, [selectedChapter]);

  useEffect(() => {
    if (selectedChapter && selectedVersion) loadDraftContent();
  }, [selectedChapter, selectedVersion]);

  const loadChapters = async () => {
    try {
      const resp = await draftsAPI.listChapters(projectId);
      const chapterList = Array.isArray(resp.data) ? resp.data : [];
      // Sort chapters by ID weight
      const sorted = sortChapters(chapterList);
      setChapters(sorted);
    } catch (e) {
      console.error(e);
    }
  };

  // Sort chapters using chapter ID rules
  const sortChapters = (chapterIds) => {
    const calculateWeight = (chapterId) => {
      const match = chapterId.match(/^(?:V(\d+))?C(\d+)(?:([EI])(\d+))?$/);
      if (!match) return 0;

      const volume = parseInt(match[1]) || 0;
      const chapter = parseInt(match[2]);
      const type = match[3];
      const seq = parseInt(match[4]) || 0;

      let weight = volume * 1000 + chapter;
      if (type && seq > 0) {
        weight += 0.1 * seq;
      }
      return weight;
    };

    return [...chapterIds].sort((a, b) => calculateWeight(a) - calculateWeight(b));
  };

  const getChapterIcon = (chapterId) => {
    if (chapterId.includes('E')) return <Sparkles size={14} className="text-amber-500" />;
    if (chapterId.includes('I')) return <Drama size={14} className="text-blue-500" />;
    return <BookOpen size={14} className="text-[var(--vscode-fg-subtle)]" />;
  };

  const loadChapterData = async () => {
    try {
      const vResp = await draftsAPI.listVersions(projectId, selectedChapter);
      const vItems = Array.isArray(vResp.data) ? vResp.data : [];
      setVersions(vItems);
      setSelectedVersion(vItems[vItems.length - 1] || '');

      try {
        const sResp = await draftsAPI.getSummary(projectId, selectedChapter);
        setSummary(sResp?.data || null);
      } catch {
        setSummary(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadDraftContent = async () => {
    setLoading(true);
    try {
      const dResp = await draftsAPI.getDraft(projectId, selectedChapter, selectedVersion);
      setDraftContent(dResp?.data?.content || '');
    } catch (e) {
      setDraftContent('加载内容失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-140px)]">
      {/* Sidebar List */}
      <div className="lg:col-span-3 flex flex-col gap-4 overflow-hidden">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-lg font-bold text-[var(--vscode-fg)]">内容管理</h3>
        </div>
        <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
          {chapters.length === 0 && <div className="text-sm text-[var(--vscode-fg-subtle)] p-2 italic">暂无章节</div>}
          {chapters.map((ch) => (
            <div
              key={ch}
              onClick={() => setSelectedChapter(ch)}
              className={`p-3 rounded-[6px] border cursor-pointer transition-colors text-sm flex items-center gap-2 ${selectedChapter === ch
                ? 'bg-[var(--vscode-list-active)] text-[var(--vscode-list-active-fg)] border-[var(--vscode-input-border)]'
                : 'bg-[var(--vscode-bg)] border-[var(--vscode-sidebar-border)] text-[var(--vscode-fg-subtle)] hover:text-[var(--vscode-fg)] hover:bg-[var(--vscode-list-hover)]'
                }`}
            >
              {getChapterIcon(ch)}
              <span className="font-mono flex-1">{ch}</span>
              {selectedChapter === ch && <ChevronRight size={14} />}
            </div>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="lg:col-span-9 flex flex-col gap-6 overflow-hidden">
        {!selectedChapter ? (
          <div className="flex-1 flex items-center justify-center text-[var(--vscode-fg-subtle)] border border-dashed border-[var(--vscode-sidebar-border)] rounded-[6px] bg-[var(--vscode-bg)]">
            <div className="flex flex-col items-center">
              <FileText size={48} className="mb-4 opacity-20" />
              <span className="font-serif">选择章节查看详情</span>
            </div>
          </div>
        ) : (
          <>
            {/* Top Meta */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="md:col-span-2 bg-[var(--vscode-bg)]">
                <div className="p-4 border-b border-[var(--vscode-sidebar-border)] bg-[var(--vscode-sidebar-bg)]">
                  <h4 className="text-sm font-bold text-[var(--vscode-fg)] flex items-center gap-2">
                    <BookOpen size={14} className="text-[var(--vscode-fg-subtle)]" /> 章节摘要
                  </h4>
                </div>
                <div className="p-4">
                  {summary ? (
                    <div className="space-y-2">
                      <div className="font-bold text-[var(--vscode-fg)]">{summary.title}</div>
                      <div className="text-sm text-[var(--vscode-fg-subtle)] line-clamp-2 leading-relaxed">{summary.brief_summary}</div>
                    </div>
                  ) : (
                    <span className="text-xs text-[var(--vscode-fg-subtle)] italic">暂无摘要信息</span>
                  )}
                </div>
              </Card>

              <Card className="bg-[var(--vscode-bg)]">
                <div className="p-4 border-b border-[var(--vscode-sidebar-border)] bg-[var(--vscode-sidebar-bg)]">
                  <h4 className="text-sm font-bold text-[var(--vscode-fg)] flex items-center gap-2">
                    <Clock size={14} className="text-[var(--vscode-fg-subtle)]" /> 版本历史
                  </h4>
                </div>
                <div className="p-4 space-y-3">
                  <select
                    className="w-full bg-[var(--vscode-input-bg)] border border-[var(--vscode-input-border)] rounded-[6px] p-2 text-sm text-[var(--vscode-fg)] focus:outline-none focus:border-[var(--vscode-focus-border)] transition-colors cursor-pointer"
                    value={selectedVersion}
                    onChange={(e) => setSelectedVersion(e.target.value)}
                  >
                    {versions.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                    onClick={async () => {
                      if (window.confirm(`确定要删除章节 ${selectedChapter} 吗？此操作不可撤销！`)) {
                        try {
                          await draftsAPI.deleteChapter(projectId, selectedChapter);
                          alert('章节已删除');
                          setSelectedChapter('');
                          setVersions([]);
                          setDraftContent('');
                          setSummary(null);
                          await loadChapters();
                        } catch (e) {
                          alert('删除失败: ' + e.message);
                        }
                      }
                    }}
                  >
                    <Trash2 size={12} className="mr-2" /> 删除章节
                  </Button>
                </div>
              </Card>
            </div>

            {/* Content Viewer */}
            <Card className="flex-1 overflow-hidden flex flex-col bg-[var(--vscode-bg)] shadow-none">
              <div className="p-4 border-b border-[var(--vscode-sidebar-border)] flex flex-row justify-between items-center bg-[var(--vscode-sidebar-bg)]">
                <h4 className="text-sm font-bold text-[var(--vscode-fg)]">内容预览: <span className="font-mono font-normal ml-2 text-[var(--vscode-fg-subtle)]">{selectedVersion}</span></h4>
                <div className="text-xs font-mono text-[var(--vscode-fg-subtle)]">
                  {loading ? '加载中...' : `${draftContent.length} 字符`}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-[var(--vscode-input-bg)]">
                <div className="prose prose-slate max-w-none font-serif text-[var(--vscode-fg)] leading-loose">
                  <pre className="whitespace-pre-wrap font-serif text-[var(--vscode-fg)] bg-transparent p-0 border-0">
                    {draftContent}
                  </pre>
                </div>
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
