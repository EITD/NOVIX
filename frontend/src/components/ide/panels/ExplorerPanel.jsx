/**
 * ExplorerPanel - 资源管理器面板
 * 仅负责资源树与相关对话框容器，不改变业务逻辑。
 */
import { useState } from 'react';
import { useIDE } from '../../../context/IDEContext';
import { bindingsAPI, draftsAPI, evidenceAPI, sessionAPI, textChunksAPI } from '../../../api';
import AnalysisSyncDialog from '../AnalysisSyncDialog';
import AnalysisReviewDialog from '../../writing/AnalysisReviewDialog';
import VolumeManageDialog from '../VolumeManageDialog';
import VolumeTree from '../VolumeTree';
import { Layers, RefreshCw, Plus, ArrowUpDown } from 'lucide-react';
import { cn } from '../../ui/core';

export default function ExplorerPanel({ className }) {
  const { state, dispatch } = useIDE();
  const [syncOpen, setSyncOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewItems, setReviewItems] = useState([]);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncResults, setSyncResults] = useState([]);
  const [syncError, setSyncError] = useState('');
  const [indexRebuildLoading, setIndexRebuildLoading] = useState(false);
  const [indexRebuildError, setIndexRebuildError] = useState('');
  const [indexRebuildSuccess, setIndexRebuildSuccess] = useState(false);
  const [volumeManageOpen, setVolumeManageOpen] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);

  const handleSyncConfirm = async (selectedChapters) => {
    if (selectedChapters.length === 0 || !state.activeProjectId) return;
    setSyncError('');
    setSyncResults([]);
    setSyncLoading(true);
    try {
      const res = await sessionAPI.analyzeSync(state.activeProjectId, { chapters: selectedChapters });
      const payload = Array.isArray(res.data)
        ? { success: true, results: res.data }
        : (res.data || {});
      if (!payload?.success) {
        throw new Error(payload?.error || payload?.detail || '同步失败');
      }
      const results = Array.isArray(payload?.results) ? payload.results : [];
      const bindingResults = await Promise.all(
        results.map(async (item) => {
          const chapter = item?.chapter;
          if (!chapter) return null;
          try {
            const bindingResp = await bindingsAPI.get(state.activeProjectId, chapter);
            return { ...item, binding: bindingResp.data?.binding || null };
          } catch (error) {
            return {
              ...item,
              binding_error: error?.response?.data?.detail || error?.message || '读取绑定失败',
            };
          }
        })
      );
      setSyncResults(bindingResults.filter(Boolean));
    } catch (err) {
      console.error(err);
      const detail = err?.response?.data?.detail || err?.response?.data?.error;
      setSyncError(detail || err?.message || '同步失败');
    } finally {
      setSyncLoading(false);
    }
  };

  const handleRebuildBindings = async (selectedChapters) => {
    if (!state.activeProjectId) return;
    setSyncError('');
    setSyncResults([]);
    setSyncLoading(true);
    try {
      const res = await bindingsAPI.rebuildBatch(state.activeProjectId, {
        chapters: selectedChapters.length > 0 ? selectedChapters : undefined
      });
      if (!res.data?.success) {
        throw new Error(res.data?.error || '重建失败');
      }
      const results = Array.isArray(res.data?.results) ? res.data.results : [];
      setSyncResults(results);
    } catch (err) {
      console.error(err);
      setSyncError(err?.message || '重建失败');
    } finally {
      setSyncLoading(false);
    }
  };

  const handleRebuildIndexes = async () => {
    if (!state.activeProjectId) return;
    setIndexRebuildError('');
    setIndexRebuildSuccess(false);
    setIndexRebuildLoading(true);
    try {
      await evidenceAPI.rebuild(state.activeProjectId);
      await textChunksAPI.rebuild(state.activeProjectId);
      setIndexRebuildSuccess(true);
    } catch (err) {
      console.error(err);
      const detail = err?.response?.data?.detail || err?.response?.data?.error;
      setIndexRebuildError(detail || err?.message || '重建失败');
    } finally {
      setIndexRebuildLoading(false);
    }
  };

  const handleReviewSave = async (updatedAnalyses) => {
    setReviewSaving(true);
    try {
      await draftsAPI.saveAnalyses(state.activeProjectId, updatedAnalyses);
      setReviewOpen(false);
    } catch (err) {
      console.error(err);
    } finally {
      setReviewSaving(false);
    }
  };

  const handleChapterSelect = (chapter) => {
    dispatch({ type: 'SET_ACTIVE_DOCUMENT', payload: { ...chapter, type: 'chapter' } });
  };

  // 通用操作按钮组件
  const ActionButton = ({ onClick, icon: Icon, title }) => (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={cn(
        "p-1 rounded-[2px] text-[var(--vscode-fg)] hover:bg-[var(--vscode-list-hover)] transition-none outline-none focus:ring-1 focus:ring-[var(--vscode-focus-border)]",
        "opacity-70 hover:opacity-100 focus:opacity-100",
        "flex items-center justify-center w-6 h-6"
      )}
    >
      <Icon size={14} strokeWidth={1.5} />
    </button>
  );

  return (
    <div className={cn('anti-theme explorer-panel flex flex-col h-full bg-[var(--vscode-bg)] text-[var(--vscode-fg)] select-none', className)}>
      {/* VS Code 风格工具栏 */}
      <div className="flex items-center h-[35px] px-4 font-sans text-[11px] font-bold tracking-wide text-[var(--vscode-fg-subtle)] uppercase bg-[var(--vscode-sidebar-bg)] border-b border-[var(--vscode-sidebar-border)]">
        <span>资源管理器</span>
        <div className="flex-1" />

        {/* 右侧工具按钮 */}
        <div className="flex items-center gap-0.5">
          <ActionButton
            onClick={() => setReorderMode((prev) => !prev)}
            icon={ArrowUpDown}
            title={reorderMode ? "完成排序" : "调整顺序"}
          />
          <ActionButton
            onClick={() => dispatch({ type: 'OPEN_CREATE_CHAPTER_DIALOG', payload: { volumeId: state.selectedVolumeId } })}
            icon={Plus}
            title="新建章节"
          />
          <ActionButton
            onClick={() => {
              setSyncError('');
              setSyncResults([]);
              setIndexRebuildError('');
              setIndexRebuildSuccess(false);
              setSyncOpen(true);
            }}
            icon={RefreshCw}
            title="同步分析"
          />
          <ActionButton
            onClick={() => setVolumeManageOpen(true)}
            icon={Layers}
            title="分卷管理"
          />
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
        <div className="absolute inset-0 overflow-y-auto custom-scrollbar">
          <VolumeTree
            projectId={state.activeProjectId}
            onChapterSelect={handleChapterSelect}
            selectedChapter={state.activeDocument?.id}
            reorderMode={reorderMode}
          />
        </div>
      </div>

      <AnalysisSyncDialog
        open={syncOpen}
        projectId={state.activeProjectId}
        loading={syncLoading}
        results={syncResults}
        error={syncError}
        indexRebuildLoading={indexRebuildLoading}
        indexRebuildError={indexRebuildError}
        indexRebuildSuccess={indexRebuildSuccess}
        onClose={() => setSyncOpen(false)}
        onConfirm={handleSyncConfirm}
        onRebuild={handleRebuildBindings}
        onRebuildIndexes={handleRebuildIndexes}
      />

      <AnalysisReviewDialog
        open={reviewOpen}
        analyses={reviewItems}
        onCancel={() => setReviewOpen(false)}
        onSave={handleReviewSave}
        saving={reviewSaving}
      />

      <VolumeManageDialog
        open={volumeManageOpen}
        projectId={state.activeProjectId}
        onClose={() => setVolumeManageOpen(false)}
      />
    </div>
  );
}
