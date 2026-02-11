import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  Layout, 
  BookOpen, 
  PenTool, 
  Settings, 
  ChevronLeft, 
  ChevronRight,
  Cpu
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Logo } from '../ui/Logo';

/**
 * AppShell - 应用外壳布局
 * 负责侧栏导航与主区域容器，不改变业务逻辑。
 */
export function AppShell({ children }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const location = useLocation();

  return (
    <div className="anti-theme min-h-screen bg-[var(--vscode-bg)] text-[var(--vscode-fg)] flex overflow-hidden font-sans">
      {/* Sidebar */}
      <aside 
        className={cn(
          "relative border-r border-[var(--vscode-sidebar-border)] bg-[var(--vscode-sidebar-bg)] transition-all duration-300 ease-in-out flex flex-col",
          sidebarCollapsed ? "w-16" : "w-56"
        )}
      >
        {/* Logo Area */}
        <div className="h-16 flex items-center px-4 border-b border-[var(--vscode-sidebar-border)]">
          <Logo size={sidebarCollapsed ? 'small' : 'default'} showText={!sidebarCollapsed} />
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-6 px-2 space-y-2">
          <NavItem 
            to="/" 
            icon={<Layout size={20} />} 
            label="项目" 
            collapsed={sidebarCollapsed}
            active={location.pathname === '/' || location.pathname.startsWith('/project')}
          />
          <div className="my-4 border-t border-[var(--vscode-sidebar-border)] mx-2" />
          <NavItem 
            to="/agents" 
            icon={<Cpu size={20} />} 
            label="智能体" 
            collapsed={sidebarCollapsed}
            active={location.pathname.startsWith('/agents')}
          />
          <NavItem 
            to="/system" 
            icon={<Settings size={20} />} 
            label="系统" 
            collapsed={sidebarCollapsed}
            active={location.pathname.startsWith('/system')}
          />
        </nav>

        {/* Collapse Toggle */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="absolute -right-3 top-20 bg-[var(--vscode-bg)] border border-[var(--vscode-sidebar-border)] rounded-full p-1 text-[var(--vscode-fg-subtle)] hover:text-[var(--vscode-fg)] transition-colors"
        >
          {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        {/* Footer Status */}
        <div className="p-4 border-t border-[var(--vscode-sidebar-border)] bg-[var(--vscode-sidebar-bg)]">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="h-2 w-2 rounded-full bg-[var(--vscode-focus-border)] animate-pulse-slow flex-shrink-0" />
            <span className={cn(
              "text-sm text-[var(--vscode-fg-subtle)] font-mono transition-opacity duration-300 whitespace-nowrap",
              sidebarCollapsed ? "opacity-0 w-0" : "opacity-100"
            )}>
              系统在线
            </span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[var(--vscode-bg)] relative">
        <div className="absolute inset-0 opacity-[0.02] pointer-events-none" />
        {children}
      </main>
    </div>
  );
}

function NavItem({ to, icon, label, collapsed, active }) {
  return (
    <Link
      to={to}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-[6px] transition-colors group",
        active 
          ? "bg-[var(--vscode-list-active)] text-[var(--vscode-list-active-fg)] border border-[var(--vscode-sidebar-border)]" 
          : "text-[var(--vscode-fg-subtle)] hover:text-[var(--vscode-fg)] hover:bg-[var(--vscode-list-hover)]"
      )}
      title={collapsed ? label : undefined}
    >
      <div className={cn(
        "flex-shrink-0 transition-colors duration-200",
        active ? "text-[var(--vscode-list-active-fg)]" : "group-hover:text-[var(--vscode-fg)]"
      )}>
        {icon}
      </div>
      <span className={cn(
        "font-medium whitespace-nowrap transition-all duration-300 overflow-hidden",
        collapsed ? "w-0 opacity-0" : "w-auto opacity-100"
      )}>
        {label}
      </span>
    </Link>
  );
}
