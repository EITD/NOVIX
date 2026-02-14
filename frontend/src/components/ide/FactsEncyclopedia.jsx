/**
 * FactsEncyclopedia - 事实全典
 * 仅做视觉一致性优化，不改变数据与交互逻辑。
 */
import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { ChevronDown, ChevronRight, Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { bindingsAPI, canonAPI, draftsAPI, volumesAPI } from '../../api';
import { Button, Card, Input, cn } from '../ui/core';
import logger from '../../utils/logger';


const FactsEncyclopedia = ({ projectId: overrideProjectId, onFactSelect }) => {
  const { projectId: routeProjectId } = useParams();
  const projectId = overrideProjectId || routeProjectId;

  const [expandedChapters, setExpandedChapters] = useState(new Set());
  const [expandedSummaries, setExpandedSummaries] = useState(new Set());
  const [expandedFacts, setExpandedFacts] = useState(new Set());
  const [editingFact, setEditingFact] = useState(null);
  const [editingSummary, setEditingSummary] = useState(null);
  const [creatingFact, setCreatingFact] = useState(null);

  const { data: factsTree = { volumes: [] }, isLoading, mutate } = useSWR(
    projectId ? [projectId, 'facts-tree'] : null,
    () => canonAPI.getTree(projectId).then((res) => res.data),
    { revalidateOnFocus: false }
  );

  const getChapterWeight = (chapterId) => {
    const normalized = (chapterId || '').toUpperCase();
    const match = normalized.match(/^(?:V(\d+))?C(\d+)(?:([EI])(\d+))?$/);
    if (!match) return Number.MAX_SAFE_INTEGER;

    const volume = match[1] ? Number.parseInt(match[1], 10) : 0;
    const chapter = Number.parseInt(match[2], 10);
    const type = match[3];
    const seq = match[4] ? Number.parseInt(match[4], 10) : 0;

    let weight = volume * 100000 + chapter * 10;
    if (type && seq) weight += seq;
    return weight;
  };

  const stats = useMemo(() => {
    const volumes = factsTree?.volumes || [];
    let chapterCount = 0;
    let factCount = 0;

    volumes.forEach((v) => {
      (v.chapters || []).forEach((c) => {
        chapterCount += 1;
        factCount += (c.facts || []).length;
      });
    });

    return { chapterCount, factCount };
  }, [factsTree]);

  const filteredTree = useMemo(() => {
    const rawVolumes = factsTree?.volumes || [];
    const volumes = rawVolumes.map((v) => ({
      ...v,
      chapters: [...(v.chapters || [])].sort((a, b) => getChapterWeight(a.id) - getChapterWeight(b.id)),
    }));
    return { volumes };
  }, [factsTree]);

  const toggleChapter = (chapterId) => {
    const next = new Set(expandedChapters);
    if (next.has(chapterId)) next.delete(chapterId);
    else next.add(chapterId);
    setExpandedChapters(next);
  };

  const toggleSummary = (key) => {
    const next = new Set(expandedSummaries);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpandedSummaries(next);
  };

  const toggleFact = (factKey) => {
    setExpandedFacts((prev) => {
      const next = new Set(prev);
      if (next.has(factKey)) next.delete(factKey);
      else next.add(factKey);
      return next;
    });
  };

  const handleDeleteFact = async (factId) => {
    if (!factId) {
      alert('该事实缺少 ID，无法删除。');
      return;
    }
    if (!window.confirm('确认删除该事实吗？该操作不可撤销。')) return;

    try {
      await canonAPI.delete(projectId, factId);
      mutate();
    } catch (error) {
      logger.error(error);
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
      logger.error(error);
      alert('保存失败，请稍后重试。');
    }
  };

  const handleCreateFact = async () => {
    if (!creatingFact) return;

    const statement = (creatingFact.content || creatingFact.statement || '').trim();
    if (!statement) {
      alert('请输入事实内容。');
      return;
    }

    try {
      const payload = {
        title: creatingFact.title || undefined,
        content: creatingFact.content || statement,
        statement,
        source: creatingFact.chapterId,
        introduced_in: creatingFact.chapterId,
        confidence: 1.0,
      };
      await canonAPI.createManual(projectId, payload);
      setCreatingFact(null);
      mutate();
    } catch (error) {
      logger.error(error);
      alert('新增失败，请稍后重试。');
    }
  };

  const openCreateFactDialog = (chapterId) => {
    setCreatingFact({
      chapterId,
      title: '',
      content: '',
    });
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
      logger.error(error);
      alert('保存失败，请稍后重试。');
    }
  };

  if (isLoading) {
    return (
      <div className="anti-theme h-full flex items-center justify-center text-[var(--vscode-fg-subtle)] text-xs bg-[var(--vscode-bg)]">
        加载中...
      </div>
    );
  }

  return (
    <div className="anti-theme h-full flex flex-col overflow-hidden bg-[var(--vscode-bg)] text-[var(--vscode-fg)] text-[12px]">
      <div className="px-3 pt-3 pb-2 border-b border-[var(--vscode-sidebar-border)] bg-[var(--vscode-sidebar-bg)]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-[6px] bg-[var(--vscode-list-hover)] border border-[var(--vscode-sidebar-border)] flex items-center justify-center">
              <Sparkles size={16} className="text-[var(--vscode-fg-subtle)]" />
            </div>
            <div className="leading-tight">
              <div className="flex items-baseline gap-2">
                <div className="text-sm font-bold text-[var(--vscode-fg)]">事实全典</div>
                <div className="text-[11px] text-[var(--vscode-fg-subtle)]">{stats.chapterCount} 章 · {stats.factCount} 条事实</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
        <div className="h-full overflow-y-auto custom-scrollbar facts-scroll p-2 space-y-3">
          {(filteredTree.volumes || []).length === 0 ? (
            <div className="p-6 text-center text-xs text-[var(--vscode-fg-subtle)] border border-dashed border-[var(--vscode-sidebar-border)] rounded-[6px] bg-[var(--vscode-bg)]">
              暂无事实记录
            </div>
          ) : (
            filteredTree.volumes.map((volume) => (
              <VolumeSection
                key={volume.id}
                projectId={projectId}
                volume={volume}
                expandedChapters={expandedChapters}
                expandedSummaries={expandedSummaries}
                expandedFacts={expandedFacts}
                onToggleChapter={toggleChapter}
                onToggleSummary={toggleSummary}
                onToggleFact={toggleFact}
                onEditSummary={(payload) => setEditingSummary(payload)}
                onEditFact={(fact) => setEditingFact(fact)}
                onAddFact={openCreateFactDialog}
                onDeleteFact={handleDeleteFact}
                onFactSelect={onFactSelect}
              />
            ))
          )}
        </div>
      </div>

      <EditFactDialog
        open={Boolean(editingFact)}
        fact={editingFact}
        onChange={setEditingFact}
        onClose={() => setEditingFact(null)}
        onSave={handleSaveFact}
      />

      <CreateFactDialog
        open={Boolean(creatingFact)}
        fact={creatingFact}
        onChange={setCreatingFact}
        onClose={() => setCreatingFact(null)}
        onSave={handleCreateFact}
      />

      <EditSummaryDialog
        open={Boolean(editingSummary)}
        summary={editingSummary}
        onChange={setEditingSummary}
        onClose={() => setEditingSummary(null)}
        onSave={handleSaveSummary}
      />
    </div>
  );
};

function VolumeSection({
  projectId,
  volume,
  expandedChapters,
  expandedSummaries,
  expandedFacts,
  onToggleChapter,
  onToggleSummary,
  onToggleFact,
  onEditSummary,
  onEditFact,
  onAddFact,
  onDeleteFact,
  onFactSelect,
}) {
  const volumeSummaryKey = `volume-${volume.id}`;
  const volumeSummaryExpanded = expandedSummaries.has(volumeSummaryKey);
  const chapters = volume.chapters || [];

  return (
    <Card className="overflow-hidden bg-[var(--vscode-bg)] text-[var(--vscode-fg)] border border-[var(--vscode-sidebar-border)] rounded-[4px] shadow-none">
      <div className="px-3 py-2 border-b border-[var(--vscode-sidebar-border)] bg-[var(--vscode-sidebar-bg)]">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-[var(--vscode-fg-subtle)]">{volume.id}</span>
          <span className="text-sm font-semibold text-[var(--vscode-fg)] truncate">{volume.title}</span>
          <span className="ml-auto text-[10px] text-[var(--vscode-fg-subtle)] tabular-nums">{chapters.length}</span>
        </div>

        <div className="mt-2 flex items-start gap-1">
          <span className="text-[10px] text-[var(--vscode-fg-subtle)] shrink-0">摘要</span>
          <button
            className="flex-1 text-left text-[11px] text-[var(--vscode-fg)] leading-snug"
            onClick={() => onToggleSummary(volumeSummaryKey)}
            title={volume.summary || ''}
          >
            <span className={volumeSummaryExpanded ? '' : 'line-clamp-2'}>
              {volume.summary && volume.summary.trim() ? volume.summary : '暂无摘要'}
            </span>
          </button>

          <div className="flex items-center gap-1">
            <button
              onClick={() =>
                onEditSummary({
                  type: 'volume',
                  id: volume.id,
                  title: volume.title,
                  text: volume.summary || '',
                  chapterCount: chapters.length,
                })
              }
              className="p-2 rounded-[6px] text-[var(--vscode-fg-subtle)] hover:text-[var(--vscode-fg)] hover:bg-[var(--vscode-list-hover)] transition-none"
              title="编辑摘要"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={() => onToggleSummary(volumeSummaryKey)}
              className="p-2 rounded-[6px] text-[var(--vscode-fg-subtle)] hover:text-[var(--vscode-fg)] hover:bg-[var(--vscode-list-hover)] transition-none"
              title={volumeSummaryExpanded ? '收起' : '展开'}
            >
              <ChevronDown size={14} />
            </button>
          </div>
        </div>
      </div>

      <div className="p-2 space-y-2">
        {chapters.map((chapter) => (
          <ChapterBlock
            key={chapter.id}
            projectId={projectId}
            volumeId={volume.id}
            chapter={chapter}
            isExpanded={expandedChapters.has(chapter.id)}
            summaryExpanded={expandedSummaries.has(`chapter-${chapter.id}`)}
            expandedFacts={expandedFacts}
            onToggleChapter={onToggleChapter}
            onToggleSummary={onToggleSummary}
            onEditSummary={onEditSummary}
            onEditFact={onEditFact}
            onAddFact={onAddFact}
            onDeleteFact={onDeleteFact}
            onToggleFact={onToggleFact}
            onFactSelect={onFactSelect}
          />
        ))}
      </div>
    </Card>
  );
}

function ChapterBlock({
  projectId,
  volumeId,
  chapter,
  isExpanded,
  summaryExpanded,
  expandedFacts,
  onToggleChapter,
  onToggleSummary,
  onEditSummary,
  onEditFact,
  onAddFact,
  onDeleteFact,
  onToggleFact,
  onFactSelect,
}) {
  const facts = chapter.facts || [];
  const chapterSummaryKey = `chapter-${chapter.id}`;

  const { data: bindingResp, isLoading: bindingLoading } = useSWR(
    isExpanded && projectId ? [projectId, chapter.id, 'bindings'] : null,
    () => bindingsAPI.get(projectId, chapter.id).then((res) => res.data),
    { revalidateOnFocus: false }
  );

  const binding = bindingResp?.binding;
  const boundCharacters = binding?.characters || [];
  const charactersText = binding
    ? (boundCharacters.length ? boundCharacters.join('、') : '无')
    : '未建立';

  return (
    <div className="border border-[var(--vscode-sidebar-border)] rounded-[4px] bg-[var(--vscode-bg)] overflow-hidden">
      <div
        onClick={() => onToggleChapter(chapter.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleChapter(chapter.id);
          }
        }}
        role="button"
        tabIndex={0}
        className={cn(
          'w-full flex items-center gap-2 px-2 py-1.5 text-left transition-none',
          'hover:bg-[var(--vscode-list-hover)]'
        )}
      >
        <span className={cn("text-[var(--vscode-fg-subtle)] inline-flex", isExpanded ? "rotate-90" : "")} aria-hidden>
          <ChevronRight size={14} />
        </span>

        <span className="text-[10px] font-mono text-[var(--vscode-fg-subtle)]">{chapter.id}</span>
        <span className="text-[12px] text-[var(--vscode-fg)] truncate flex-1">{chapter.title || '未命名章节'}</span>

        <div className="flex items-center gap-1">
          <button
            type="button"
            className="p-1 rounded-[4px] text-[var(--vscode-fg-subtle)] hover:text-[var(--vscode-fg)] hover:bg-[var(--vscode-list-hover)] transition-none"
            title="新增事实"
            onClick={(e) => {
              e.stopPropagation();
              onAddFact?.(chapter.id);
              if (!isExpanded) onToggleChapter(chapter.id);
            }}
          >
            <Plus size={14} />
          </button>
          <span className="text-[10px] text-[var(--vscode-fg-subtle)] tabular-nums">{facts.length}</span>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-[var(--vscode-sidebar-border)] bg-[var(--vscode-bg)] overflow-hidden">
          <div className="px-2 py-2 flex items-start gap-1">
            <span className="text-[10px] text-[var(--vscode-fg-subtle)] shrink-0">摘要</span>
            <button
              className="flex-1 text-left text-[11px] text-[var(--vscode-fg)] leading-snug"
              onClick={() => onToggleSummary(chapterSummaryKey)}
              title={chapter.summary || ''}
            >
              <span className={summaryExpanded ? '' : 'line-clamp-2'}>
                {chapter.summary && chapter.summary.trim() ? chapter.summary : '暂无摘要'}
              </span>
            </button>

            <div className="flex items-center gap-1">
              <button
                onClick={() =>
                  onEditSummary({
                    type: 'chapter',
                    id: chapter.id,
                    title: chapter.title,
                    volumeId,
                    text: chapter.summary || '',
                  })
                }
                className="p-1 rounded-[4px] text-[var(--vscode-fg-subtle)] hover:text-[var(--vscode-fg)] hover:bg-[var(--vscode-list-hover)] transition-none"
                title="编辑摘要"
              >
                <Pencil size={12} />
              </button>
              <button
                onClick={() => onToggleSummary(chapterSummaryKey)}
                className="p-1 rounded-[4px] text-[var(--vscode-fg-subtle)] hover:text-[var(--vscode-fg)] hover:bg-[var(--vscode-list-hover)] transition-none"
                title={summaryExpanded ? '收起' : '展开'}
              >
                <ChevronDown size={12} />
              </button>
            </div>
          </div>

          <div className="px-2 pb-2 flex items-start gap-1">
            <span className="text-[10px] text-[var(--vscode-fg-subtle)] shrink-0">角色</span>
            <div
              className="flex-1 text-[11px] text-[var(--vscode-fg)] leading-snug truncate"
              title={bindingLoading ? '加载中...' : charactersText}
            >
              {bindingLoading ? '加载中...' : charactersText}
            </div>
          </div>

          <div className="px-2 pb-2">
            {facts.length ? (
              <div className="space-y-1">
                {facts.map((fact, idx) => {
                  const factKey = fact.id || `${chapter.id}-${idx}`;
                  const factExpanded = expandedFacts?.has(factKey);
                  return (
                  <FactRow
                    key={factKey}
                    fact={fact}
                    index={idx + 1}
                    expanded={factExpanded}
                    onToggleExpand={() => onToggleFact?.(factKey)}
                    onEdit={() => onEditFact(fact)}
                    onDelete={() => onDeleteFact(fact.id)}
                    onSelect={onFactSelect ? () => onFactSelect(fact) : null}
                  />
                );
                })}
              </div>
            ) : (
              <div className="px-2 py-3 text-[11px] text-[var(--vscode-fg-subtle)]">暂无事实</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FactRow({ fact, index, expanded, onToggleExpand, onEdit, onDelete, onSelect }) {
  const statement = (fact.statement || fact.content || '').trim();
  const title = (fact.title || '').trim();
  const display = title && title !== statement ? `${title}：${statement}` : (statement || title || '暂无事实内容');

  return (
    <div
      className={cn(
        'group flex items-start gap-0.5 px-0.5 py-1.5 rounded-[4px] transition-none',
        'hover:bg-[var(--vscode-list-hover)]',
        onSelect ? 'cursor-pointer' : ''
      )}
      onClick={onSelect || undefined}
    >
      <div className="w-5 shrink-0 flex flex-col items-start">
        <span className="text-[9px] font-mono text-[var(--vscode-fg-subtle)] tabular-nums leading-none">#{index}</span>
        <button
          type="button"
          className="mt-0.5 p-0.5 rounded-[2px] text-[var(--vscode-fg-subtle)] hover:text-[var(--vscode-fg)] hover:bg-[var(--vscode-list-hover)] transition-none"
          title={expanded ? '收起' : '展开'}
          aria-label={expanded ? '收起' : '展开'}
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand?.();
          }}
        >
          <ChevronDown size={12} className={cn(expanded ? 'rotate-180' : '')} />
        </button>
      </div>

      <div className="flex-1 min-w-0">
        <div className={cn("text-[10.5px] text-[var(--vscode-fg)] leading-snug", expanded ? "" : "line-clamp-3")}>
          {display}
        </div>
      </div>

      <div className="shrink-0 flex items-center gap-0.5 justify-end">
        <button
          className="w-5 h-5 inline-flex items-center justify-center rounded-[2px] hover:bg-[var(--vscode-list-hover)] text-[var(--vscode-fg-subtle)] hover:text-[var(--vscode-fg)] opacity-50 hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onEdit?.();
          }}
          title="编辑"
        >
          <Pencil size={11} strokeWidth={1.7} />
        </button>
        <button
          className="w-5 h-5 inline-flex items-center justify-center rounded-[2px] hover:bg-red-50 text-red-500 opacity-50 hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onDelete?.();
          }}
          title="删除"
        >
          <Trash2 size={11} strokeWidth={1.7} />
        </button>
      </div>
    </div>
  );
}

function EditFactDialog({ open, fact, onChange, onClose, onSave }) {
  if (!open || !fact) return null;

  return (
    <div className="anti-theme fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-4">
      <div className="w-full max-w-md border border-[var(--vscode-sidebar-border)] bg-[var(--vscode-bg)] text-[var(--vscode-fg)] rounded-[6px] shadow-none overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--vscode-sidebar-border)] bg-[var(--vscode-sidebar-bg)] flex items-center justify-between">
          <div className="text-sm font-bold text-[var(--vscode-fg)]">编辑事实</div>
          <button
            className="p-2 rounded-[6px] hover:bg-[var(--vscode-list-hover)] text-[var(--vscode-fg-subtle)] hover:text-[var(--vscode-fg)] transition-none"
            onClick={onClose}
            title="关闭"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <Input
            placeholder="事实标题（可选）"
            value={fact.title || ''}
            onChange={(e) => onChange({ ...fact, title: e.target.value })}
            className="h-10 text-sm bg-[var(--vscode-input-bg)] border-[var(--vscode-input-border)] text-[var(--vscode-fg)] focus-visible:border-[var(--vscode-focus-border)] focus-visible:ring-[var(--vscode-focus-border)]"
          />

          <textarea
            placeholder="事实内容"
            value={fact.content || fact.statement || ''}
            onChange={(e) => onChange({ ...fact, content: e.target.value })}
            className="w-full min-h-[140px] text-sm bg-[var(--vscode-input-bg)] border border-[var(--vscode-input-border)] rounded-[6px] px-3 py-2 text-[var(--vscode-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--vscode-focus-border)] focus:border-[var(--vscode-focus-border)] resize-none"
          />
        </div>

        <div className="px-4 py-3 border-t border-[var(--vscode-sidebar-border)] bg-[var(--vscode-sidebar-bg)] flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={onClose}
            className="h-8 px-3 text-xs rounded-[4px] border border-[var(--vscode-input-border)] text-[var(--vscode-fg)] hover:bg-[var(--vscode-list-hover)] shadow-none"
          >
            取消
          </Button>
          <Button
            onClick={onSave}
            className="h-8 px-3 text-xs rounded-[4px] bg-[var(--vscode-list-active)] text-[var(--vscode-list-active-fg)] hover:opacity-90 shadow-none"
          >
            保存
          </Button>
        </div>
      </div>
    </div>
  );
}

function CreateFactDialog({ open, fact, onChange, onClose, onSave }) {
  if (!open || !fact) return null;

  return (
    <div className="anti-theme fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-4">
      <div className="w-full max-w-md border border-[var(--vscode-sidebar-border)] bg-[var(--vscode-bg)] text-[var(--vscode-fg)] rounded-[6px] shadow-none overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--vscode-sidebar-border)] bg-[var(--vscode-sidebar-bg)] flex items-center justify-between">
          <div className="text-sm font-bold text-[var(--vscode-fg)]">新增事实</div>
          <button
            className="p-2 rounded-[6px] hover:bg-[var(--vscode-list-hover)] text-[var(--vscode-fg-subtle)] hover:text-[var(--vscode-fg)] transition-none"
            onClick={onClose}
            title="关闭"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="text-[11px] text-[var(--vscode-fg-subtle)]">
            章节：<span className="font-mono">{fact.chapterId}</span>
          </div>

          <Input
            placeholder="事实标题（可选）"
            value={fact.title || ''}
            onChange={(e) => onChange({ ...fact, title: e.target.value })}
            className="h-10 text-sm bg-[var(--vscode-input-bg)] border-[var(--vscode-input-border)] text-[var(--vscode-fg)] focus-visible:border-[var(--vscode-focus-border)] focus-visible:ring-[var(--vscode-focus-border)]"
          />

          <textarea
            placeholder="事实内容（必填）"
            value={fact.content || ''}
            onChange={(e) => onChange({ ...fact, content: e.target.value })}
            className="w-full min-h-[140px] text-sm bg-[var(--vscode-input-bg)] border border-[var(--vscode-input-border)] rounded-[6px] px-3 py-2 text-[var(--vscode-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--vscode-focus-border)] focus:border-[var(--vscode-focus-border)] resize-none"
          />
        </div>

        <div className="px-4 py-3 border-t border-[var(--vscode-sidebar-border)] bg-[var(--vscode-sidebar-bg)] flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={onClose}
            className="h-8 px-3 text-xs rounded-[4px] border border-[var(--vscode-input-border)] text-[var(--vscode-fg)] hover:bg-[var(--vscode-list-hover)] shadow-none"
          >
            取消
          </Button>
          <Button
            onClick={onSave}
            className="h-8 px-3 text-xs rounded-[4px] bg-[var(--vscode-list-active)] text-[var(--vscode-list-active-fg)] hover:opacity-90 shadow-none"
          >
            新增
          </Button>
        </div>
      </div>
    </div>
  );
}

function EditSummaryDialog({ open, summary, onChange, onClose, onSave }) {
  if (!open || !summary) return null;

  return (
    <div className="anti-theme fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-4">
      <div className="w-full max-w-md border border-[var(--vscode-sidebar-border)] bg-[var(--vscode-bg)] text-[var(--vscode-fg)] rounded-[6px] shadow-none overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--vscode-sidebar-border)] bg-[var(--vscode-sidebar-bg)] flex items-center justify-between">
          <div className="text-sm font-bold text-[var(--vscode-fg)]">编辑摘要</div>
          <button
            className="p-2 rounded-[6px] hover:bg-[var(--vscode-list-hover)] text-[var(--vscode-fg-subtle)] hover:text-[var(--vscode-fg)] transition-none"
            onClick={onClose}
            title="关闭"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <textarea
            placeholder="摘要内容"
            value={summary.text || ''}
            onChange={(e) => onChange({ ...summary, text: e.target.value })}
            className="w-full min-h-[180px] text-sm bg-[var(--vscode-input-bg)] border border-[var(--vscode-input-border)] rounded-[6px] px-3 py-2 text-[var(--vscode-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--vscode-focus-border)] focus:border-[var(--vscode-focus-border)] resize-none"
          />
        </div>

        <div className="px-4 py-3 border-t border-[var(--vscode-sidebar-border)] bg-[var(--vscode-sidebar-bg)] flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={onClose}
            className="h-8 px-3 text-xs rounded-[4px] border border-[var(--vscode-input-border)] text-[var(--vscode-fg)] hover:bg-[var(--vscode-list-hover)] shadow-none"
          >
            取消
          </Button>
          <Button
            onClick={onSave}
            className="h-8 px-3 text-xs rounded-[4px] bg-[var(--vscode-list-active)] text-[var(--vscode-list-active-fg)] hover:opacity-90 shadow-none"
          >
            保存
          </Button>
        </div>
      </div>
    </div>
  );
}

export default FactsEncyclopedia;
