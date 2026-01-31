import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button, Card, Input } from '../ui/core';
import { X, Trash2, Plus, CheckSquare } from 'lucide-react';

const emptySummary = {
  chapter: '',
  volume_id: 'V1',
  title: '',
  word_count: 0,
  key_events: [],
  new_facts: [],
  character_state_changes: [],
  open_loops: [],
  brief_summary: '',
};

export default function AnalysisReviewDialog({
  open,
  analyses = [],
  onCancel,
  onSave,
  saving = false,
}) {
  const [currentChapter, setCurrentChapter] = useState('');
  const [analysisMap, setAnalysisMap] = useState({});

  useEffect(() => {
    if (!open) return;
    const map = {};
    analyses.forEach((item) => {
      if (!item?.chapter) return;
      map[item.chapter] = {
        summary: { ...emptySummary, ...(item.analysis?.summary || {}), chapter: item.chapter },
        facts: item.analysis?.facts ? [...item.analysis.facts] : [],
        proposals: item.analysis?.proposals ? [...item.analysis.proposals] : [],
        timeline_events: item.analysis?.timeline_events || [],
        character_states: item.analysis?.character_states || [],
      };
    });
    setAnalysisMap(map);
    setCurrentChapter(analyses[0]?.chapter || '');
  }, [open, analyses]);

  const current = analysisMap[currentChapter] || {
    summary: { ...emptySummary, chapter: currentChapter },
    facts: [],
    proposals: [],
    timeline_events: [],
    character_states: [],
  };

  const chapterList = useMemo(() => {
    return analyses
      .map((item) => ({
        chapter: item.chapter,
        title: item.analysis?.summary?.title || '',
      }))
      .filter((item) => item.chapter);
  }, [analyses]);

  const updateCurrent = (patch) => {
    setAnalysisMap((prev) => ({
      ...prev,
      [currentChapter]: {
        ...prev[currentChapter],
        ...patch,
      },
    }));
  };

  const updateFact = (index, value) => {
    const next = current.facts.map((item, idx) => (
      idx === index ? { ...item, statement: value } : item
    ));
    updateCurrent({ facts: next });
  };

  const removeFact = (index) => {
    const next = current.facts.filter((_, idx) => idx !== index);
    updateCurrent({ facts: next });
  };

  const addFact = () => {
    if (current.facts.length >= 5) return;
    updateCurrent({ facts: [...current.facts, { statement: '', confidence: 1.0 }] });
  };

  const updateProposal = (index, patch) => {
    const next = current.proposals.map((item, idx) => (
      idx === index ? { ...item, ...patch } : item
    ));
    updateCurrent({ proposals: next });
  };

  const removeProposal = (index) => {
    const next = current.proposals.filter((_, idx) => idx !== index);
    updateCurrent({ proposals: next });
  };

  const handleSave = () => {
    if (!onSave) return;
    const payload = Object.entries(analysisMap).map(([chapter, data]) => {
      const cleanedFacts = (data.facts || [])
        .map((fact) => ({ ...fact, statement: (fact.statement || '').trim() }))
        .filter((fact) => fact.statement)
        .slice(0, 5);

      const cleanedProposals = (data.proposals || [])
        .map((item) => ({
          ...item,
          name: (item.name || '').trim(),
          description: (item.description || '').trim(),
          rationale: (item.rationale || '').trim(),
        }))
        .filter((item) => item.name && item.description);

      return {
        chapter,
        analysis: {
          summary: {
            ...data.summary,
            chapter,
            brief_summary: (data.summary?.brief_summary || '').trim(),
          },
          facts: cleanedFacts,
          proposals: cleanedProposals,
          timeline_events: data.timeline_events || [],
          character_states: data.character_states || [],
        },
      };
    });
    onSave(payload);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-40"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <Card className="w-full max-w-6xl max-h-[85vh] p-6 flex flex-col overflow-hidden">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <h2 className="text-xl font-bold text-ink-900">分析结果确认</h2>
                  <p className="text-sm text-ink-500">可在保存前微调摘要、事实与设定卡。</p>
                </div>
                <button
                  onClick={onCancel}
                  className="p-2 rounded-md hover:bg-ink-100 text-ink-400 hover:text-ink-700"
                  title="关闭"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4 overflow-hidden mt-4">
                <div className="border border-border rounded-md bg-surface/50 p-2 overflow-y-auto">
                  <div className="text-xs font-bold text-ink-500 px-2 py-1">章节列表</div>
                  <div className="space-y-1 mt-2">
                    {chapterList.map((item) => {
                      const active = item.chapter === currentChapter;
                      return (
                        <button
                          key={item.chapter}
                          onClick={() => setCurrentChapter(item.chapter)}
                          className={
                            `w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors ` +
                            (active
                              ? 'bg-primary/10 text-ink-900 border border-primary/30'
                              : 'text-ink-600 hover:bg-ink-50')
                          }
                        >
                          <CheckSquare size={12} className={active ? 'text-primary' : 'text-ink-300'} />
                          <span className="font-mono text-[11px]">{item.chapter}</span>
                          <span className="truncate">{item.title || '未命名章节'}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-4 overflow-hidden">
                  <div className="space-y-4 overflow-y-auto pr-2 min-h-0">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-ink-800">章节摘要</h3>
                        <span className="text-[10px] text-ink-400">不可删除</span>
                      </div>
                      <textarea
                        value={current.summary?.brief_summary || ''}
                        onChange={(e) =>
                          updateCurrent({ summary: { ...current.summary, brief_summary: e.target.value } })
                        }
                        placeholder="暂无摘要"
                        className="w-full min-h-[140px] text-sm bg-surface/70 border border-border rounded-md px-3 py-2 focus:outline-none focus:border-primary"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-ink-800">事实</h3>
                          <span className="text-[10px] text-ink-400">建议 3-5 条</span>
                        </div>
                        <button
                          onClick={addFact}
                          className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary-hover disabled:opacity-40"
                          disabled={current.facts.length >= 5}
                        >
                          <Plus size={12} />
                          新增事实 ({current.facts.length}/5)
                        </button>
                      </div>
                      {current.facts.length === 0 ? (
                        <div className="text-xs text-ink-400 border border-dashed border-border rounded-md px-3 py-2">
                          暂无事实
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {current.facts.map((fact, idx) => (
                            <div key={`${fact.id || 'fact'}-${idx}`} className="flex items-start gap-2">
                              <Input
                                value={fact.statement || ''}
                                onChange={(e) => updateFact(idx, e.target.value)}
                                placeholder="填写事实内容"
                                className="bg-surface/70 text-sm"
                              />
                              <button
                                onClick={() => removeFact(idx)}
                                className="p-2 rounded-md hover:bg-red-50 text-red-500"
                                title="移除"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3 overflow-y-auto pr-1 min-h-0">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-ink-800">新增设定卡</h3>
                      <span className="text-[10px] text-ink-400">可编辑/删除</span>
                    </div>
                    {current.proposals.length === 0 ? (
                      <div className="text-xs text-ink-400 border border-dashed border-border rounded-md px-3 py-2">
                        暂无新增设定
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {current.proposals.map((item, idx) => (
                          <div key={`${item.name || 'proposal'}-${idx}`} className="border border-border rounded-md p-3 bg-surface/70 space-y-2">
                            <div className="flex items-center gap-2">
                              <Input
                                value={item.name || ''}
                                onChange={(e) => updateProposal(idx, { name: e.target.value })}
                                placeholder="设定名称"
                                className="bg-background text-sm"
                              />
                              <select
                                value={item.type || 'Character'}
                                onChange={(e) => updateProposal(idx, { type: e.target.value })}
                                className="h-10 rounded-md border border-border bg-background text-xs px-2"
                              >
                                <option value="Character">角色</option>
                                <option value="World">世界</option>
                              </select>
                              <button
                                onClick={() => removeProposal(idx)}
                                className="p-2 rounded-md hover:bg-red-50 text-red-500"
                                title="移除"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                            <textarea
                              value={item.description || ''}
                              onChange={(e) => updateProposal(idx, { description: e.target.value })}
                              placeholder="设定描述"
                              className="w-full min-h-[80px] text-sm bg-background border border-border rounded-md px-3 py-2 focus:outline-none focus:border-primary"
                            />
                            <textarea
                              value={item.rationale || ''}
                              onChange={(e) => updateProposal(idx, { rationale: e.target.value })}
                              placeholder="必要性/理由"
                              className="w-full min-h-[60px] text-xs bg-background border border-border rounded-md px-3 py-2 focus:outline-none focus:border-primary"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button variant="ghost" onClick={onCancel} disabled={saving}>取消</Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? '保存中...' : '保存并入库'}
                </Button>
              </div>
            </Card>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
