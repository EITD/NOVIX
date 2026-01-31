import React from 'react';
import { FileText, Plus } from 'lucide-react';
import { useIDE } from '../../../context/IDEContext';
import VolumeManager from '../VolumeManager';
import VolumeTree from '../VolumeTree';

/**
 * ExplorerPanel - 资源管理器面板
 *
 * 仅展示分卷与章节结构。
 */
export default function ExplorerPanel() {
  const { state, dispatch } = useIDE();

  const handleChapterClick = (chapterId) => {
    dispatch({ type: 'SET_ACTIVE_DOCUMENT', payload: { type: 'chapter', id: chapterId } });
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-border/50 flex items-center justify-between">
        <div className="flex items-center gap-2 text-ink-900 font-bold text-sm">
          <FileText size={14} className="text-primary" />
          <span>资源管理器</span>
        </div>
        <button
          onClick={() =>
            dispatch({
              type: 'OPEN_CREATE_CHAPTER_DIALOG',
              payload: { volumeId: state.selectedVolumeId },
            })
          }
          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80"
          title="新建章节"
        >
          <Plus size={12} />
          新建章节
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-4">
        <VolumeManager
          projectId={state.activeProjectId}
          onVolumeSelect={(volumeId) =>
            dispatch({ type: 'SET_SELECTED_VOLUME_ID', payload: volumeId })
          }
          onRefresh={() => {}}
        />

        <VolumeTree
          projectId={state.activeProjectId}
          onChapterSelect={handleChapterClick}
          selectedChapter={state.activeDocument?.id}
        />
      </div>
    </div>
  );
}
