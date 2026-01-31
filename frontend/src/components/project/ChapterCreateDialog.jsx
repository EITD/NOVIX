import React, { useEffect, useState } from 'react';
import { X, BookOpen, Sparkles, Drama } from 'lucide-react';
import { Button, Card, Input } from '../ui/core';

/**
 * ChapterCreateDialog - 章节创建对话框
 *
 * 支持创建：
 * - 正文章节 (C1, C2, ...)
 * - 番外章节 (C3E1, C3E2, ...)
 * - 幕间章节 (C2I1, C2I2, ...)
 */
export function ChapterCreateDialog({
  open,
  onClose,
  onConfirm,
  existingChapters = [],
  volumes = [],
  defaultVolumeId = 'V1',
}) {
  const [chapterType, setChapterType] = useState('normal');
  const [selectedVolume, setSelectedVolume] = useState('V1');
  const [insertAfter, setInsertAfter] = useState('');
  const [suggestedId, setSuggestedId] = useState('');
  const [customId, setCustomId] = useState('');
  const [title, setTitle] = useState('');

  const availableVolumes = volumes.length ? volumes : [{ id: 'V1', title: '第一卷' }];

  const normalizeToVolume = (chapterId, volumeId) => {
    const trimmed = (chapterId || '').trim().toUpperCase();
    if (!trimmed) {
      return '';
    }
    if (trimmed.startsWith('V')) {
      return trimmed;
    }
    if (trimmed.startsWith('C')) {
      return `${volumeId}${trimmed}`;
    }
    return trimmed;
  };

  const parseVolumeId = (chapterId) => {
    const match = (chapterId || '').toUpperCase().match(/^V(\d+)/);
    return match ? `V${match[1]}` : 'V1';
  };

  const normalizedChapters = existingChapters.map((chapter) => {
    const volumeId = parseVolumeId(chapter.id);
    const normalizedId = normalizeToVolume(chapter.id, volumeId);
    return { ...chapter, volumeId, normalizedId };
  });

  useEffect(() => {
    if (!open) return;
    let suggested = '';

    if (chapterType === 'normal') {
      const normalChapters = normalizedChapters.filter(
        (chapter) => chapter.volumeId === selectedVolume && /C\d+$/i.test(chapter.normalizedId)
      );
      let maxChapter = 0;
      normalChapters.forEach((chapter) => {
        const match = chapter.normalizedId.match(/C(\d+)/i);
        if (match) {
          maxChapter = Math.max(maxChapter, Number.parseInt(match[1], 10));
        }
      });
      suggested = `${selectedVolume}C${maxChapter + 1}`;
    } else if (chapterType === 'extra' && insertAfter) {
      const extraCount = normalizedChapters.filter(
        (chapter) =>
          chapter.normalizedId.startsWith(insertAfter) &&
          chapter.normalizedId.toUpperCase().includes('E')
      ).length;
      suggested = `${insertAfter}E${extraCount + 1}`;
    } else if (chapterType === 'interlude' && insertAfter) {
      const interludeCount = normalizedChapters.filter(
        (chapter) =>
          chapter.normalizedId.startsWith(insertAfter) &&
          chapter.normalizedId.toUpperCase().includes('I')
      ).length;
      suggested = `${insertAfter}I${interludeCount + 1}`;
    }

    setSuggestedId(suggested);
    setCustomId('');
  }, [chapterType, insertAfter, normalizedChapters, open, selectedVolume]);

  useEffect(() => {
    if (open) {
      setChapterType('normal');
      setInsertAfter('');
      setTitle('');
      setCustomId('');
      const fallback = availableVolumes[0]?.id || 'V1';
      const target = availableVolumes.find((volume) => volume.id === defaultVolumeId)
        ? defaultVolumeId
        : fallback;
      setSelectedVolume(target);
    }
  }, [availableVolumes, defaultVolumeId, open]);

  useEffect(() => {
    if (chapterType !== 'normal') {
      setInsertAfter('');
    }
  }, [chapterType, selectedVolume]);

  if (!open) return null;

  const rawId = customId || suggestedId;
  const finalId = normalizeToVolume(rawId, selectedVolume);
  const canCreate = Boolean(title && finalId);
  const normalChapters = normalizedChapters.filter(
    (chapter) => chapter.volumeId === selectedVolume && /C\d+$/i.test(chapter.normalizedId)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <Card className="w-full max-w-md bg-surface shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-border bg-gray-50/50">
          <h3 className="text-lg font-bold text-ink-900">创建新章节</h3>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X size={18} />
          </Button>
        </div>

        <div className="p-6 space-y-6">
          <div className="space-y-3">
            <label className="text-xs font-bold text-ink-500 uppercase tracking-wider">
              章节类型
            </label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { id: 'normal', icon: BookOpen, label: '正文', color: 'text-ink-600' },
                { id: 'extra', icon: Sparkles, label: '番外', color: 'text-amber-500' },
                { id: 'interlude', icon: Drama, label: '幕间', color: 'text-blue-500' },
              ].map(({ id, icon: Icon, label, color }) => (
                <label
                  key={id}
                  className={`flex flex-col items-center justify-center p-3 border rounded-lg cursor-pointer transition-all ${
                    chapterType === id
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-border hover:border-primary/30 hover:bg-surface-hover'
                  }`}
                >
                  <input
                    type="radio"
                    name="type"
                    value={id}
                    checked={chapterType === id}
                    onChange={(e) => setChapterType(e.target.value)}
                    className="sr-only"
                  />
                  <Icon size={20} className={`mb-2 ${color}`} />
                  <span
                    className={`text-xs font-medium ${
                      chapterType === id ? 'text-primary' : 'text-ink-600'
                    }`}
                  >
                    {label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-ink-500 uppercase">分卷</label>
            <select
              value={selectedVolume}
              onChange={(e) => setSelectedVolume(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded bg-white text-ink-900 text-sm focus:outline-none focus:border-primary transition-colors cursor-pointer"
            >
              {availableVolumes.map((volume) => (
                <option key={volume.id} value={volume.id}>
                  {volume.id} {volume.title ? `- ${volume.title}` : ''}
                </option>
              ))}
            </select>
          </div>

          {chapterType !== 'normal' && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-ink-500 uppercase">插入位置</label>
              <select
                value={insertAfter}
                onChange={(e) => setInsertAfter(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded bg-white text-ink-900 text-sm focus:outline-none focus:border-primary transition-colors cursor-pointer"
              >
                <option value="">请选择章节...</option>
                {normalChapters.map((chapter) => (
                  <option key={chapter.normalizedId} value={chapter.normalizedId}>
                    在 {chapter.normalizedId} 之后 - {chapter.title || '未命名'}
                  </option>
                ))}
              </select>
              {!insertAfter && normalChapters.length > 0 && (
                <p className="text-xs text-ink-400">选择要插入在哪个章节之后</p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-bold text-ink-500 uppercase">章节编号</label>
            <div className="space-y-1">
              <Input
                value={customId || suggestedId}
                onChange={(e) => setCustomId(e.target.value.toUpperCase())}
                placeholder="使用建议编号或手动输入"
                className="font-mono"
              />
              {suggestedId && (
                <p className="text-xs text-ink-400">
                  系统建议:{' '}
                  <span className="font-mono font-medium text-primary">{suggestedId}</span>
                </p>
              )}
              {customId && !customId.toUpperCase().startsWith('V') && (
                <p className="text-xs text-ink-400">
                  将自动归入 <span className="font-mono text-primary">{selectedVolume}</span>
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-ink-500 uppercase">章节标题</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：第一章 初入京城"
              className="font-serif"
            />
          </div>
        </div>

        <div className="flex gap-3 p-6 border-t border-border bg-gray-50">
          <Button variant="ghost" onClick={onClose} className="flex-1">
            取消
          </Button>
          <Button
            onClick={() => {
              if (canCreate) {
                onConfirm({ id: finalId, title, type: chapterType });
                onClose();
              }
            }}
            className="flex-1"
            disabled={!canCreate}
          >
            创建章节
          </Button>
        </div>
      </Card>
    </div>
  );
}
