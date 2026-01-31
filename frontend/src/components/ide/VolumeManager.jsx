import React, { useState } from 'react';
import useSWR from 'swr';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { volumesAPI } from '../../api';

/**
 * VolumeManager - 分卷管理组件
 *
 * 职责：
 * - 展示分卷列表
 * - 创建/编辑/删除分卷
 */
const VolumeManager = ({ projectId, onVolumeSelect, onRefresh }) => {
  const [isCreating, setIsCreating] = useState(false);
  const [editingVolume, setEditingVolume] = useState(null);
  const [newVolume, setNewVolume] = useState({ title: '', summary: '' });

  const { data: volumes = [], mutate, isLoading } = useSWR(
    projectId ? [projectId, 'volumes'] : null,
    () => volumesAPI.list(projectId).then((res) => res.data),
    { revalidateOnFocus: false }
  );

  const handleCreateVolume = async () => {
    if (!newVolume.title.trim()) {
      alert('请输入分卷标题');
      return;
    }

    try {
      const response = await volumesAPI.create(projectId, newVolume);
      mutate([...volumes, response.data]);
      setNewVolume({ title: '', summary: '' });
      setIsCreating(false);
      onRefresh?.();
    } catch (error) {
      console.error('Failed to create volume:', error);
      alert('创建分卷失败');
    }
  };

  const handleUpdateVolume = async () => {
    if (!editingVolume.title.trim()) {
      alert('请输入分卷标题');
      return;
    }

    try {
      const response = await volumesAPI.update(projectId, editingVolume.id, {
        title: editingVolume.title,
        summary: editingVolume.summary,
        order: editingVolume.order,
      });
      mutate(volumes.map((volume) => (volume.id === editingVolume.id ? response.data : volume)));
      setEditingVolume(null);
      onRefresh?.();
    } catch (error) {
      console.error('Failed to update volume:', error);
      alert('更新分卷失败');
    }
  };

  const handleDeleteVolume = async (volumeId) => {
    if (volumeId === 'V1') {
      alert('默认分卷 V1 不可删除');
      return;
    }
    if (!window.confirm('确定要删除该分卷吗？')) {
      return;
    }

    try {
      await volumesAPI.delete(projectId, volumeId);
      mutate(volumes.filter((volume) => volume.id !== volumeId));
      onRefresh?.();
    } catch (error) {
      console.error('Failed to delete volume:', error);
      alert('删除分卷失败');
    }
  };

  if (isLoading) {
    return <div className="text-xs text-ink-400 px-3 py-4">加载分卷中...</div>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <div className="text-xs font-bold text-ink-500 uppercase tracking-wider">分卷</div>
        <button
          className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80"
          onClick={() => setIsCreating(true)}
        >
          <Plus size={12} /> 新建
        </button>
      </div>

      <div className="space-y-1.5">
        {volumes.length === 0 ? (
          <div className="p-3 text-center text-xs text-ink-400 border border-dashed border-border rounded">
            暂无分卷
          </div>
        ) : (
          volumes.map((volume) => (
            <div
              key={volume.id}
              className="flex items-center justify-between gap-2 px-3 py-2 border border-border rounded bg-surface hover:border-primary/40 transition-colors"
            >
              <button
                className="flex-1 min-w-0 text-left"
                onClick={() => onVolumeSelect?.(volume.id)}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-primary">{volume.id}</span>
                  <span className="text-xs font-medium text-ink-800 truncate">
                    {volume.title}
                  </span>
                </div>
                {volume.summary && (
                  <div className="text-[11px] text-ink-400 mt-0.5 line-clamp-1">
                    {volume.summary}
                  </div>
                )}
              </button>
              <div className="flex items-center gap-1">
                <button
                  className="p-1 rounded hover:bg-ink-100 text-ink-500"
                  onClick={() => setEditingVolume(volume)}
                  title="编辑分卷"
                >
                  <Pencil size={12} />
                </button>
                <button
                  className="p-1 rounded hover:bg-red-50 text-red-500 disabled:opacity-40"
                  onClick={() => handleDeleteVolume(volume.id)}
                  title="删除分卷"
                  disabled={volume.id === 'V1'}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {isCreating && (
        <Modal
          title="创建新分卷"
          onClose={() => setIsCreating(false)}
          onConfirm={handleCreateVolume}
          confirmText="创建"
        >
          <InputField
            label="分卷标题"
            value={newVolume.title}
            onChange={(value) => setNewVolume({ ...newVolume, title: value })}
            placeholder="例如：第一卷"
          />
          <TextAreaField
            label="分卷摘要（可选）"
            value={newVolume.summary}
            onChange={(value) => setNewVolume({ ...newVolume, summary: value })}
            placeholder="一句话概述分卷内容"
          />
        </Modal>
      )}

      {editingVolume && (
        <Modal
          title="编辑分卷"
          onClose={() => setEditingVolume(null)}
          onConfirm={handleUpdateVolume}
          confirmText="保存"
        >
          <InputField
            label="分卷标题"
            value={editingVolume.title}
            onChange={(value) => setEditingVolume({ ...editingVolume, title: value })}
          />
          <TextAreaField
            label="分卷摘要（可选）"
            value={editingVolume.summary || ''}
            onChange={(value) => setEditingVolume({ ...editingVolume, summary: value })}
          />
        </Modal>
      )}
    </div>
  );
};

const Modal = ({ title, onClose, onConfirm, confirmText, children }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-lg shadow-2xl w-full max-w-md p-4 space-y-3">
        <div className="text-sm font-bold text-ink-900">{title}</div>
        <div className="space-y-3">{children}</div>
        <div className="flex justify-end gap-2 pt-1">
          <button
            className="px-3 py-1.5 text-xs rounded border border-border text-ink-600 hover:bg-ink-50"
            onClick={onClose}
          >
            取消
          </button>
          <button
            className="px-3 py-1.5 text-xs rounded bg-primary text-white hover:bg-primary/90"
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

const InputField = ({ label, value, onChange, placeholder }) => {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-semibold text-ink-500 uppercase">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-xs rounded border border-border bg-white focus:outline-none focus:border-primary"
      />
    </label>
  );
};

const TextAreaField = ({ label, value, onChange, placeholder }) => {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-semibold text-ink-500 uppercase">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-xs rounded border border-border bg-white focus:outline-none focus:border-primary"
        rows={4}
      />
    </label>
  );
};

export default VolumeManager;
