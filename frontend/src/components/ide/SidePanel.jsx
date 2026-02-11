import React from 'react';
import { useIDE } from '../../context/IDEContext';
import ExplorerPanel from './panels/ExplorerPanel';
import CardsPanel from './panels/CardsPanel';
import AgentsPanel from './panels/AgentsPanel';
import FanfictionPanel from './panels/FanfictionPanel';
import FactsEncyclopedia from './FactsEncyclopedia';

/**
 * SidePanel - 侧栏容器
 * 负责活动面板切换与宽度调整，不改变业务逻辑。
 */
export const SidePanel = () => {
  const { state, dispatch } = useIDE();
  const { sidePanelVisible, activeActivity, sidePanelWidth } = state;

  if (!sidePanelVisible) return null;

  return (
    <div
      className="h-full border-r border-[var(--vscode-sidebar-border)] bg-[var(--vscode-sidebar-bg)] flex flex-col relative group"
      style={{ width: sidePanelWidth, minWidth: 160, maxWidth: 600 }}
    >
      <div className="flex-1 overflow-hidden h-full flex flex-col">
        <div className="flex-1 overflow-hidden min-h-0 relative">
          {activeActivity === 'explorer' && <ExplorerPanel />}
          {activeActivity === 'facts' && (
            <div className="h-full overflow-hidden">
              <FactsEncyclopedia />
            </div>
          )}
          {activeActivity === 'cards' && <CardsPanel />}
          {activeActivity === 'agents' && <AgentsPanel mode="config" />}
          {activeActivity === 'fanfiction' && <FanfictionPanel />}
        </div>
      </div>

      <div
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/30 transition-colors z-50"
        onMouseDown={(e) => {
          e.preventDefault();
          const startX = e.pageX;
          const startWidth = sidePanelWidth;

          const handleMouseMove = (moveEvent) => {
            const newWidth = Math.max(160, Math.min(600, startWidth + (moveEvent.pageX - startX)));
            dispatch({ type: 'SET_PANEL_WIDTH', payload: newWidth });
          };

          const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
          };

          document.addEventListener('mousemove', handleMouseMove);
          document.addEventListener('mouseup', handleMouseUp);
        }}
      />
    </div>
  );
};
