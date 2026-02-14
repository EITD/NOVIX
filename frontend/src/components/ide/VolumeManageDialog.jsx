import React, { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Layers, Pencil, Plus, Trash2, X } from 'lucide-react';
import { volumesAPI } from '../../api';
import { cn } from '../ui/core';
import logger from '../../utils/logger';

/**
 * VolumeManageDialog - 分卷管理弹窗
 *
 * 设计目标：资源管理器只展示“分卷-章节树”，分卷的创建/编辑/删除集中在一个轻量弹窗里，避免界面割裂。
 */
export default function VolumeManageDialog({ open, projectId, onClose }) {
  const [mode, setMode] = useState('list'); // list | create | edit
  const [draft, setDraft] = useState({ title: '', summary: '' });
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const { data: volumes = [], mutate, isLoading } = useSWR(
    projectId && open ? [projectId, 'volumes'] : null,
    () => volumesAPI.list(projectId).then((res) => res.data),
    { revalidateOnFocus: false }
  );

  const sortedVolumes = useMemo(() => {
    const list = [...volumes];
    list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return list;
  }, [volumes]);

  const resetState = () => {
    setMode('list');
    setDraft({ title: '', summary: '' });
    setEditing(null);
    setSaving(false);
  };

  const handleClose = () => {
    resetState();
    onClose?.();
  };

  const handleCreate = async () => {
    const title = (draft.title || '').trim();
    if (!title) {
      alert('请输入分卷标题');
      return;
    }
    setSaving(true);
    try {
      await volumesAPI.create(projectId, { title, summary: draft.summary || '' });
      await mutate();
      resetState();
    } catch (error) {
      logger.error(error);
      alert(`创建分卷失败: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!editing) return;
    const title = (editing.title || '').trim();
    if (!title) {
      alert('请输入分卷标题');
      return;
    }
    setSaving(true);
    try {
      await volumesAPI.update(projectId, editing.id, {
        title,
        summary: editing.summary || '',
        order: editing.order,
      });
      await mutate();
      resetState();
    } catch (error) {
      logger.error(error);
      alert(`更新分卷失败: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (volumeId) => {
    if (volumeId === 'V1') {
      alert('默认分卷 V1 不可删除');
      return;
    }
    if (!window.confirm('确定要删除该分卷吗？该操作不可撤销。')) {
      return;
    }

    setSaving(true);
    try {
      await volumesAPI.delete(projectId, volumeId);
      await mutate();
    } catch (error) {
      logger.error(error);
      alert(`删除分卷失败: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="anti-theme fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-4">
      <div className="w-full max-w-lg border border-[var(--vscode-sidebar-border)] bg-[var(--vscode-bg)] text-[var(--vscode-fg)] rounded-[6px] shadow-none overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--vscode-sidebar-border)] bg-[var(--vscode-sidebar-bg)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-[6px] bg-[var(--vscode-list-hover)] text-[var(--vscode-fg)] flex items-center justify-center">
              <Layers size={16} />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-bold text-[var(--vscode-fg)]">分卷管理</div>
              <div className="text-[11px] text-[var(--vscode-fg-subtle)]">创建、编辑、删除分卷（V1 不可删除）</div>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="p-2 rounded-[6px] text-[var(--vscode-fg-subtle)] hover:text-[var(--vscode-fg)] hover:bg-[var(--vscode-list-hover)] transition-none"
            title="关闭"
          >
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto custom-scrollbar p-4">
          {isLoading ? (
            <div className="text-xs text-[var(--vscode-fg-subtle)]">加载中...</div>
          ) : mode === 'list' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-[var(--vscode-fg-subtle)] uppercase tracking-wider">分卷列表</div>
                <button
                  className="inline-flex items-center gap-1 text-xs text-[var(--vscode-fg)] hover:text-[var(--vscode-fg)] hover:bg-[var(--vscode-list-hover)] px-2 py-1 rounded-[4px]"
                  onClick={() => setMode('create')}
                >
                  <Plus size={12} /> 新建分卷
                </button>
              </div>

              {sortedVolumes.length === 0 ? (
                <div className="p-4 text-center text-xs text-[var(--vscode-fg-subtle)] border border-dashed border-[var(--vscode-sidebar-border)] rounded-[6px]">
                  暂无分卷
                </div>
              ) : (
                <div className="space-y-2">
                  {sortedVolumes.map((volume) => (
                    <div
                      key={volume.id}
                      className="flex items-start justify-between gap-3 px-3 py-2 border border-[var(--vscode-sidebar-border)] rounded-[6px] bg-[var(--vscode-bg)] hover:bg-[var(--vscode-list-hover)] transition-none"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-[var(--vscode-fg-subtle)]">{volume.id}</span>
                          <span className="text-sm font-semibold text-[var(--vscode-fg)] truncate">{volume.title}</span>
                        </div>
                        {volume.summary ? (
                          <div className="text-[11px] text-[var(--vscode-fg-subtle)] mt-1 line-clamp-2">{volume.summary}</div>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          className="p-2 rounded-[6px] hover:bg-[var(--vscode-list-hover)] text-[var(--vscode-fg-subtle)] hover:text-[var(--vscode-fg)] transition-none"
                          onClick={() => {
                            setEditing({ ...volume });
                            setMode('edit');
                          }}
                          title="编辑"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          className={cn(
                            'p-2 rounded-[6px] transition-none',
                            volume.id === 'V1'
                              ? 'text-[var(--vscode-fg-subtle)] cursor-not-allowed'
                              : 'text-red-500 hover:bg-red-50'
                          )}
                          onClick={() => volume.id !== 'V1' && handleDelete(volume.id)}
                          title={volume.id === 'V1' ? '默认分卷不可删除' : '删除'}
                          disabled={saving || volume.id === 'V1'}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-xs font-bold text-[var(--vscode-fg-subtle)] uppercase tracking-wider">
                {mode === 'create' ? '新建分卷' : '编辑分卷'}
              </div>

              <label className="block space-y-1">
                <span className="text-[11px] font-semibold text-[var(--vscode-fg-subtle)] uppercase">分卷标题</span>
                <input
                  value={mode === 'create' ? draft.title : (editing?.title || '')}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (mode === 'create') setDraft((prev) => ({ ...prev, title: value }));
                    else setEditing((prev) => ({ ...prev, title: value }));
                  }}
                  className="w-full px-3 py-2 text-sm rounded-[6px] border border-[var(--vscode-input-border)] bg-[var(--vscode-input-bg)] text-[var(--vscode-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--vscode-focus-border)] focus:border-[var(--vscode-focus-border)]"
                  placeholder="例如：第一卷"
                  autoFocus
                />
              </label>

              <label className="block space-y-1">
                <span className="text-[11px] font-semibold text-[var(--vscode-fg-subtle)] uppercase">分卷简介（可选）</span>
                <textarea
                  value={mode === 'create' ? draft.summary : (editing?.summary || '')}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (mode === 'create') setDraft((prev) => ({ ...prev, summary: value }));
                    else setEditing((prev) => ({ ...prev, summary: value }));
                  }}
                  className="w-full px-3 py-2 text-sm rounded-[6px] border border-[var(--vscode-input-border)] bg-[var(--vscode-input-bg)] text-[var(--vscode-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--vscode-focus-border)] focus:border-[var(--vscode-focus-border)] resize-none"
                  rows={4}
                  placeholder="一句话描述这一卷的内容（可选）"
                />
              </label>
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-[var(--vscode-sidebar-border)] bg-[var(--vscode-sidebar-bg)] flex items-center justify-end gap-2">
          {mode === 'list' ? (
            <button
              className="px-3 py-2 text-sm rounded-[6px] border border-[var(--vscode-input-border)] text-[var(--vscode-fg)] hover:bg-[var(--vscode-list-hover)] transition-none"
              onClick={handleClose}
            >
              关闭
            </button>
          ) : (
            <>
              <button
                className="px-3 py-2 text-sm rounded-[6px] border border-[var(--vscode-input-border)] text-[var(--vscode-fg)] hover:bg-[var(--vscode-list-hover)] transition-none"
                onClick={resetState}
                disabled={saving}
              >
                取消
              </button>
              <button
                className="px-3 py-2 text-sm rounded-[6px] bg-[var(--vscode-list-active)] text-[var(--vscode-list-active-fg)] hover:opacity-90 transition-none disabled:opacity-60"
                onClick={mode === 'create' ? handleCreate : handleUpdate}
                disabled={saving}
              >
                {saving ? '处理中...' : '确认'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
