import React, { useMemo, useState } from 'react';
import useSWR from 'swr';
import { useParams } from 'react-router-dom';
import { Search, Pencil, Trash2, Sparkles } from 'lucide-react';
import { canonAPI, draftsAPI, volumesAPI } from '../../api';

/**
 * FactsEncyclopedia - 事实全典
 *
 * 功能：
 * - 按分卷/章节树形展示事实
 * - 支持搜索过滤
 * - 支持事实编辑与删除
 * - 支持卷/章摘要编辑
 */
const FactsEncyclopedia = ({ projectId: overrideProjectId, onFactSelect }) => {
  const { projectId: routeProjectId } = useParams();
  const projectId = overrideProjectId || routeProjectId;
  const [searchText, setSearchText] = useState('');
  const [expandedChapters, setExpandedChapters] = useState(new Set());
  const [expandedSummaries, setExpandedSummaries] = useState(new Set());
  const [editingFact, setEditingFact] = useState(null);
  const [editingSummary, setEditingSummary] = useState(null);

  const { data: factsTree = { volumes: [] }, isLoading, mutate } = useSWR(
    projectId ? [projectId, 'facts-tree'] : null,
    () => canonAPI.getTree(projectId).then((res) => res.data),
    { revalidateOnFocus: false }
  );

  const filteredTree = useMemo(() => {
    if (!searchText.trim()) {
      return factsTree;
    }

    const searchLower = searchText.toLowerCase();
    return {
      volumes:
        factsTree.volumes
          ?.map((volume) => ({
            ...volume,
            chapters:
              volume.chapters
                ?.map((chapter) => ({
                  ...chapter,
                  facts:
                    chapter.facts?.filter((fact) => {
                      const title = fact.title || '';
                      const content = fact.content || '';
                      return (
                        title.toLowerCase().includes(searchLower) ||
                        content.toLowerCase().includes(searchLower)
                      );
                    }) || [],
                }))
                .filter((chapter) => chapter.facts.length > 0) || [],
          }))
          .filter((volume) => volume.chapters.length > 0) || [],
    };
  }, [factsTree, searchText]);

  const toggleChapter = (chapterId) => {
    const next = new Set(expandedChapters);
    if (next.has(chapterId)) {
      next.delete(chapterId);
    } else {
      next.add(chapterId);
    }
    setExpandedChapters(next);
  };

  const toggleSummary = (summaryKey) => {
    const next = new Set(expandedSummaries);
    if (next.has(summaryKey)) {
      next.delete(summaryKey);
    } else {
      next.add(summaryKey);
    }
    setExpandedSummaries(next);
  };

  const handleDeleteFact = async (factId) => {
    if (!window.confirm('确认删除该事实吗？')) {
      return;
    }

    try {
      await canonAPI.delete(projectId, factId);
      mutate();
    } catch (error) {
      console.error('Failed to delete fact:', error);
      alert('删除失败，请稍后重试。');
    }
  };

  const handleSaveFact = async () => {
    if (!editingFact) return;
    try {
      const payload = {
        ...editingFact,
        statement: editingFact.content || editingFact.statement || '',
      };
      await canonAPI.update(projectId, editingFact.id, payload);
      setEditingFact(null);
      mutate();
    } catch (error) {
      console.error('Failed to save fact:', error);
      alert('保存失败，请稍后重试。');
    }
  };

  const handleSaveSummary = async () => {
    if (!editingSummary) return;
    try {
      if (editingSummary.type === 'volume') {
        let existing = null;
        try {
          const res = await volumesAPI.getSummary(projectId, editingSummary.id);
          existing = res.data;
        } catch (error) {
          existing = null;
        }
        const payload = {
          volume_id: editingSummary.id,
          brief_summary: editingSummary.text || '',
          key_themes: existing?.key_themes || [],
          major_events: existing?.major_events || [],
          chapter_count: existing?.chapter_count || editingSummary.chapterCount || 0,
        };
        await volumesAPI.saveSummary(projectId, editingSummary.id, payload);
      } else {
        let existing = null;
        try {
          const res = await draftsAPI.getSummary(projectId, editingSummary.id);
          existing = res.data;
        } catch (error) {
          existing = null;
        }
        const payload = {
          chapter: editingSummary.id,
          volume_id: existing?.volume_id || editingSummary.volumeId || 'V1',
          title: existing?.title || editingSummary.title || editingSummary.id,
          word_count: existing?.word_count || 0,
          key_events: existing?.key_events || [],
          new_facts: existing?.new_facts || [],
          character_state_changes: existing?.character_state_changes || [],
          open_loops: existing?.open_loops || [],
          brief_summary: editingSummary.text || '',
        };
        await draftsAPI.saveSummary(projectId, editingSummary.id, payload);
      }
      setEditingSummary(null);
      mutate();
    } catch (error) {
      console.error('Failed to save summary:', error);
      alert('保存失败，请稍后重试。');
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-ink-400 text-xs">
        加载中...
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-3 space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-border/50">
        <div className="flex items-center gap-2 text-ink-900 font-bold">
          <Sparkles size={16} className="text-primary" />
          <span>事实全典</span>
        </div>
      </div>

      <div className="relative">
        <Search size={14} className="absolute left-3 top-2.5 text-ink-400" />
        <input
          type="text"
          placeholder="搜索事实..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-xs rounded-md border border-border bg-surface/70 focus:outline-none focus:border-primary"
        />
      </div>

      {filteredTree.volumes?.length === 0 ? (
        <div className="p-6 text-center border border-dashed border-border rounded text-xs text-ink-400">
          暂无事实记录
        </div>
      ) : (
        filteredTree.volumes?.map((volume) => (
          <div key={volume.id} className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-ink-500 px-1">
              <span className="text-primary font-mono">{volume.id}</span>
              <span>{volume.title}</span>
              <span className="ml-auto bg-ink-100 text-ink-600 text-[10px] px-1.5 rounded-full min-w-[1.2rem] text-center">
                {volume.chapters?.length || 0}
              </span>
            </div>

            <div className="px-2 text-[11px] text-ink-500 flex items-start gap-2">
              <span className="text-ink-400">卷摘要</span>
              <button
                className="flex-1 text-left"
                onClick={() => toggleSummary(`volume-${volume.id}`)}
              >
                <span className={expandedSummaries.has(`volume-${volume.id}`) ? '' : 'line-clamp-1'}>
                  {volume.summary || '暂无摘要'}
                </span>
              </button>
              <button
                className="p-1 rounded hover:bg-ink-100 text-ink-500"
                onClick={() =>
                  setEditingSummary({
                    type: 'volume',
                    id: volume.id,
                    title: volume.title,
                    text: volume.summary || '',
                    chapterCount: volume.chapters?.length || 0,
                  })
                }
                title="编辑摘要"
              >
                <Pencil size={12} />
              </button>
              {volume.summary && volume.summary.length > 0 && (
                <button
                  className="text-[10px] text-ink-400"
                  onClick={() => toggleSummary(`volume-${volume.id}`)}
                >
                  {expandedSummaries.has(`volume-${volume.id}`) ? '收起' : '展开'}
                </button>
              )}
            </div>

            <div className="space-y-1.5">
              {volume.chapters?.map((chapter) => (
                <div key={chapter.id} className="bg-surface border border-border rounded">
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-ink-50 transition-colors"
                    onClick={() => toggleChapter(chapter.id)}
                  >
                    <span className="text-[10px] font-mono text-primary">{chapter.id}</span>
                    <span className="text-xs text-ink-800 truncate">{chapter.title}</span>
                    <span className="ml-auto text-[10px] text-ink-400">
                      {expandedChapters.has(chapter.id) ? '收起' : '展开'} {chapter.facts?.length || 0}
                    </span>
                  </button>

                  {expandedChapters.has(chapter.id) && (
                    <div className="border-t border-border/60 bg-ink-50/40">
                      <div className="px-3 py-2 text-[11px] text-ink-500 border-b border-border/60 flex items-start gap-2">
                        <span className="text-ink-400">章摘要</span>
                        <button
                          className="flex-1 text-left"
                          onClick={() => toggleSummary(`chapter-${chapter.id}`)}
                        >
                          <span className={expandedSummaries.has(`chapter-${chapter.id}`) ? '' : 'line-clamp-1'}>
                            {chapter.summary || '暂无摘要'}
                          </span>
                        </button>
                        <button
                          className="p-1 rounded hover:bg-ink-100 text-ink-500"
                          onClick={() =>
                            setEditingSummary({
                              type: 'chapter',
                              id: chapter.id,
                              title: chapter.title,
                              volumeId: volume.id,
                              text: chapter.summary || '',
                            })
                          }
                          title="编辑摘要"
                        >
                          <Pencil size={12} />
                        </button>
                        {chapter.summary && chapter.summary.length > 0 && (
                          <button
                            className="text-[10px] text-ink-400"
                            onClick={() => toggleSummary(`chapter-${chapter.id}`)}
                          >
                            {expandedSummaries.has(`chapter-${chapter.id}`) ? '收起' : '展开'}
                          </button>
                        )}
                      </div>
                      {chapter.facts?.length ? (
                        chapter.facts.map((fact) => {
                          const factText = fact.content || fact.statement || '';
                          const showTitle = fact.title && fact.title !== factText && factText.length > 40;
                          return (
                            <div
                              key={fact.id || fact.display_id}
                              className="px-3 py-2 flex items-start gap-2 border-b border-border/60 last:border-b-0"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-mono text-primary bg-primary/5 px-1 rounded">
                                    {fact.display_id || fact.id}
                                  </span>
                                  <span className="text-xs font-medium text-ink-800 truncate">
                                    {showTitle ? fact.title : (factText || '暂无事实内容')}
                                  </span>
                                </div>
                                {showTitle && (
                                  <div className="text-[11px] text-ink-500 leading-relaxed mt-1 line-clamp-2">
                                    {factText}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  className="p-1 rounded hover:bg-ink-100 text-ink-500"
                                  onClick={() => setEditingFact(fact)}
                                  title="编辑事实"
                                >
                                  <Pencil size={12} />
                                </button>
                                <button
                                  className="p-1 rounded hover:bg-red-50 text-red-500"
                                  onClick={() => handleDeleteFact(fact.id)}
                                  title="删除事实"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="px-3 py-3 text-xs text-ink-400">暂无事实</div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {editingFact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-lg shadow-2xl w-full max-w-md p-4 space-y-3">
            <div className="text-sm font-bold text-ink-900">编辑事实</div>
            <input
              type="text"
              placeholder="事实标题"
              value={editingFact.title || ''}
              onChange={(e) => setEditingFact({ ...editingFact, title: e.target.value })}
              className="w-full px-3 py-2 text-xs rounded border border-border bg-white focus:outline-none focus:border-primary"
            />
            <textarea
              placeholder="事实内容"
              value={editingFact.content || ''}
              onChange={(e) => setEditingFact({ ...editingFact, content: e.target.value })}
              className="w-full px-3 py-2 text-xs rounded border border-border bg-white focus:outline-none focus:border-primary"
              rows={6}
            />
            <div className="flex justify-end gap-2">
              <button
                className="px-3 py-1.5 text-xs rounded border border-border text-ink-600 hover:bg-ink-50"
                onClick={() => setEditingFact(null)}
              >
                取消
              </button>
              <button
                className="px-3 py-1.5 text-xs rounded bg-primary text-white hover:bg-primary/90"
                onClick={handleSaveFact}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {editingSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-lg shadow-2xl w-full max-w-md p-4 space-y-3">
            <div className="text-sm font-bold text-ink-900">编辑摘要</div>
            <textarea
              placeholder="摘要内容"
              value={editingSummary.text || ''}
              onChange={(e) => setEditingSummary({ ...editingSummary, text: e.target.value })}
              className="w-full px-3 py-2 text-xs rounded border border-border bg-white focus:outline-none focus:border-primary"
              rows={6}
            />
            <div className="flex justify-end gap-2">
              <button
                className="px-3 py-1.5 text-xs rounded border border-border text-ink-600 hover:bg-ink-50"
                onClick={() => setEditingSummary(null)}
              >
                取消
              </button>
              <button
                className="px-3 py-1.5 text-xs rounded bg-primary text-white hover:bg-primary/90"
                onClick={handleSaveSummary}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FactsEncyclopedia;
