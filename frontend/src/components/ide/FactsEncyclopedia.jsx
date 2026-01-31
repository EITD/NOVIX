import React, { useMemo, useState } from 'react';
import useSWR from 'swr';
import { useParams } from 'react-router-dom';
import { Search, Pencil, Trash2, Sparkles } from 'lucide-react';
import { canonAPI } from '../../api';

/**
 * FactsEncyclopedia - 事实全典组件
 *
 * 职责：
 * - 树形展示项目事实
 * - 搜索与筛选
 * - 编辑与删除事实
 */
const FactsEncyclopedia = ({ projectId: overrideProjectId, onFactSelect }) => {
  const { projectId: routeProjectId } = useParams();
  const projectId = overrideProjectId || routeProjectId;
  const [searchText, setSearchText] = useState('');
  const [expandedChapters, setExpandedChapters] = useState(new Set());
  const [editingFact, setEditingFact] = useState(null);

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

  const handleDeleteFact = async (factId) => {
    if (!window.confirm('确定要删除该事实吗？')) {
      return;
    }

    try {
      await canonAPI.delete(projectId, factId);
      mutate();
    } catch (error) {
      console.error('Failed to delete fact:', error);
      alert('删除事实失败');
    }
  };

  const handleSaveFact = async () => {
    if (!editingFact) return;
    try {
      await canonAPI.update(projectId, editingFact.id, editingFact);
      setEditingFact(null);
      mutate();
    } catch (error) {
      console.error('Failed to save fact:', error);
      alert('保存事实失败');
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
          暂无事实
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
                      {expandedChapters.has(chapter.id) ? '▼' : '▶'} {chapter.facts?.length || 0}
                    </span>
                  </button>

                  {expandedChapters.has(chapter.id) && (
                    <div className="border-t border-border/60 bg-ink-50/40">
                      {chapter.facts?.length ? (
                        chapter.facts.map((fact) => (
                          <div
                            key={fact.id}
                            className="px-3 py-2 flex items-start gap-2 border-b border-border/60 last:border-b-0"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-mono text-primary bg-primary/5 px-1 rounded">
                                  {fact.id}
                                </span>
                                <span className="text-xs font-medium text-ink-800 truncate">
                                  {fact.title || '未命名事实'}
                                </span>
                              </div>
                              <div className="text-[11px] text-ink-500 leading-relaxed mt-1 line-clamp-3">
                                {fact.content}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                className="p-1 rounded hover:bg-ink-100 text-ink-500"
                                onClick={() => setEditingFact(fact)}
                                title="编辑"
                              >
                                <Pencil size={12} />
                              </button>
                              <button
                                className="p-1 rounded hover:bg-red-50 text-red-500"
                                onClick={() => handleDeleteFact(fact.id)}
                                title="删除"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        ))
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
    </div>
  );
};

export default FactsEncyclopedia;
