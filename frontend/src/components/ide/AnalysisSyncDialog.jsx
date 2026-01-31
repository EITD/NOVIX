import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckSquare, Square, X, RefreshCw } from 'lucide-react';
import { Button, Card } from '../ui/core';
import { draftsAPI, volumesAPI } from '../../api';

const getChapterWeight = (chapterId) => {
  const match = chapterId.match(/^(?:V(\d+))?C(\d+)(?:([EI])(\d+))?$/i);
  if (!match) return 0;
  const volume = parseInt(match[1] || '0', 10);
  const chapter = parseInt(match[2] || '0', 10);
  const type = match[3];
  const seq = parseInt(match[4] || '0', 10);
  let weight = volume * 1000 + chapter;
  if (type && seq > 0) weight += 0.1 * seq;
  return weight;
};

const getVolumeId = (chapterId, summary) => {
  if (summary?.volume_id) return summary.volume_id;
  const match = chapterId.match(/^V(\d+)/i);
  return match ? `V${match[1]}` : 'V1';
};

export default function AnalysisSyncDialog({ open, projectId, onClose, onConfirm, loading }) {
  const [chapters, setChapters] = useState([]);
  const [summaries, setSummaries] = useState({});
  const [volumes, setVolumes] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (!open || !projectId) return;
    setSelected(new Set());
    setFetching(true);
    Promise.all([
      draftsAPI.listChapters(projectId),
      draftsAPI.listSummaries(projectId),
      volumesAPI.list(projectId),
    ])
      .then(([chaptersResp, summariesResp, volumesResp]) => {
        const chapterList = Array.isArray(chaptersResp.data) ? chaptersResp.data : [];
        const summaryList = Array.isArray(summariesResp.data) ? summariesResp.data : [];
        const volumeList = Array.isArray(volumesResp.data) ? volumesResp.data : [];
        const summaryMap = {};
        summaryList.forEach((item) => {
          if (item?.chapter) summaryMap[item.chapter] = item;
        });
        setChapters(chapterList.sort((a, b) => getChapterWeight(a) - getChapterWeight(b)));
        setSummaries(summaryMap);
        setVolumes(volumeList);
      })
      .catch(() => {
        setChapters([]);
        setSummaries({});
        setVolumes([]);
      })
      .finally(() => setFetching(false));
  }, [open, projectId]);

  const grouped = useMemo(() => {
    const groups = {};
    chapters.forEach((chapterId) => {
      const summary = summaries[chapterId];
      const volumeId = getVolumeId(chapterId, summary);
      if (!groups[volumeId]) groups[volumeId] = [];
      groups[volumeId].push({
        id: chapterId,
        title: summary?.title || '',
      });
    });
    const volumeOrder = new Map(volumes.map((v, idx) => [v.id, v.order ?? idx]));
    const volumeIds = Object.keys(groups).sort((a, b) => {
      const orderA = volumeOrder.has(a) ? volumeOrder.get(a) : 999;
      const orderB = volumeOrder.has(b) ? volumeOrder.get(b) : 999;
      if (orderA !== orderB) return orderA - orderB;
      return a.localeCompare(b);
    });
    return volumeIds.map((id) => ({
      id,
      title: volumes.find((v) => v.id === id)?.title || id,
      chapters: groups[id] || [],
    }));
  }, [chapters, summaries, volumes]);

  const toggleChapter = (chapterId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(chapterId)) next.delete(chapterId);
      else next.add(chapterId);
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(chapters));
  };

  const clearAll = () => {
    setSelected(new Set());
  };

  const handleConfirm = () => {
    if (!onConfirm) return;
    onConfirm(Array.from(selected));
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
            <Card className="w-full max-w-4xl max-h-[85vh] p-6 flex flex-col overflow-hidden">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <h2 className="text-xl font-bold text-ink-900">分析同步</h2>
                  <p className="text-sm text-ink-500">
                    选择要同步分析的章节，将覆盖原有摘要/事实/设定卡。
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 rounded-md hover:bg-ink-100 text-ink-400 hover:text-ink-700"
                  title="关闭"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="flex items-center justify-between mt-4">
                <div className="text-xs text-ink-400">
                  每章事实将限制为 3-5 条（最多保留 5 条）
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={selectAll} disabled={chapters.length === 0 || fetching}>
                    全选
                  </Button>
                  <Button variant="ghost" size="sm" onClick={clearAll} disabled={selected.size === 0 || fetching}>
                    清空
                  </Button>
                </div>
              </div>

              <div className="mt-4 flex-1 min-h-0 overflow-y-auto pr-2 space-y-4">
                {fetching ? (
                  <div className="text-xs text-ink-400 flex items-center gap-2">
                    <RefreshCw size={12} className="animate-spin" />
                    载入章节中...
                  </div>
                ) : grouped.length === 0 ? (
                  <div className="text-xs text-ink-400 border border-dashed border-border rounded-md px-3 py-2">
                    暂无章节可同步
                  </div>
                ) : (
                  grouped.map((volume) => (
                    <div key={volume.id} className="space-y-2">
                      <div className="text-xs font-bold text-ink-500 flex items-center gap-2">
                        <span className="text-primary font-mono">{volume.id}</span>
                        <span>{volume.title}</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {volume.chapters.map((chapter) => {
                          const checked = selected.has(chapter.id);
                          return (
                            <button
                              key={chapter.id}
                              onClick={() => toggleChapter(chapter.id)}
                              className={
                                `flex items-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors ` +
                                (checked
                                  ? 'bg-primary/10 border-primary text-ink-900'
                                  : 'bg-surface border-border text-ink-700 hover:border-primary/40')
                              }
                            >
                              {checked ? (
                                <CheckSquare size={14} className="text-primary" />
                              ) : (
                                <Square size={14} className="text-ink-400" />
                              )}
                              <span className="font-mono text-xs text-ink-500">{chapter.id}</span>
                              <span className="text-sm text-ink-900 truncate">
                                {chapter.title || '未命名章节'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button variant="ghost" onClick={onClose} disabled={loading}>取消</Button>
                <Button onClick={handleConfirm} disabled={loading || selected.size === 0}>
                  {loading ? '同步中...' : '确认同步'}
                </Button>
              </div>
            </Card>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
