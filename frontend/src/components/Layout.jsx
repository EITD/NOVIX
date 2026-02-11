import React, { useMemo, useState } from 'react';
import { BookOpen, Bot, ChevronLeft, Menu } from 'lucide-react';
import { Button, cn } from './ui/core';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

/**
 * Layout - 应用主布局
 * 负责侧栏与主区域布局，不改变业务逻辑。
 */
export const Layout = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  const activeKey = useMemo(() => {
    if (location.pathname.startsWith('/agents')) return 'agents';
    return 'home';
  }, [location.pathname]);

  return (
    <div className="anti-theme flex h-screen w-full bg-[var(--vscode-bg)] overflow-hidden font-sans text-[var(--vscode-fg)]">
      <aside
        className={cn(
          'flex-shrink-0 h-full bg-[var(--vscode-sidebar-bg)] border-r border-[var(--vscode-sidebar-border)] transition-all duration-300 ease-in-out relative z-20',
          isSidebarOpen ? 'w-64' : 'w-16'
        )}
      >
        <div className="flex flex-col h-full p-3">
          <div className={cn('flex items-center mb-8', isSidebarOpen ? 'justify-between px-2' : 'justify-center')}>
            {isSidebarOpen ? (
              <div className="flex flex-col leading-none">
                <span className="brand-logo text-xl text-[var(--vscode-fg)]">文枢</span>
              </div>
            ) : null}

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsSidebarOpen((v) => !v)}
              className="rounded-[6px]"
              title={isSidebarOpen ? '折叠侧栏' : '展开侧栏'}
            >
              {isSidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </Button>
          </div>

          <nav className="space-y-1 flex-1">
            <NavItem
              icon={<BookOpen className="h-4 w-4" />}
              label="小说管理"
              collapsed={!isSidebarOpen}
              active={activeKey === 'home'}
              onClick={() => navigate('/')}
            />
            <NavItem
              icon={<Bot className="h-4 w-4" />}
              label="智能体配置"
              collapsed={!isSidebarOpen}
              active={activeKey === 'agents'}
              onClick={() => navigate('/agents')}
            />
          </nav>
        </div>
      </aside>

      <main className="flex-1 h-full overflow-hidden relative flex flex-col">
        <Outlet />
      </main>
    </div>
  );
};

const NavItem = ({ icon, label, collapsed, active, onClick }) => (
  <button
    onClick={onClick}
    className={cn(
      'flex items-center w-full p-2 rounded-[6px] transition-colors group select-none',
      active
        ? 'bg-[var(--vscode-list-active)] text-[var(--vscode-list-active-fg)]'
        : 'text-[var(--vscode-fg-subtle)] hover:bg-[var(--vscode-list-hover)] hover:text-[var(--vscode-fg)]',
      collapsed ? 'justify-center' : 'space-x-3'
    )}
  >
    {icon}
    {!collapsed && <span className="text-sm font-medium">{label}</span>}
  </button>
);
