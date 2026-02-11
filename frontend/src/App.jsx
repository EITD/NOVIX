/**
 * WenShape App - 主路由配置
 *
 * IDE-First 设计：用户进入应用后直接进入 IDE 工作区。
 * - / : 自动重定向到最近项目的 IDE，或创建默认项目
 * - /project/:projectId/session : IDE 主界面
 * - /agents : 智能体配置（当前从入口回到首页）
 */
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import WritingSession from './pages/WritingSession';
import ErrorBoundary from './components/ErrorBoundary';
import { projectsAPI } from './api';

function AutoRedirect() {
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    const redirect = async () => {
      try {
        const res = await projectsAPI.list();
        const projects = res.data;

        if (projects && projects.length > 0) {
          navigate(`/project/${projects[0].id}/session`, { replace: true });
          return;
        }

        const newProject = await projectsAPI.create({ name: '我的第一个项目' });
        navigate(`/project/${newProject.data.id}/session`, { replace: true });
      } catch (err) {
        console.error('Failed to load projects:', err);
        setError(err?.message || String(err));
      }
    };

    redirect();
  }, [navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--vscode-bg)] text-[var(--vscode-fg)]">
        <div className="ws-paper p-8 text-center max-w-md">
          <h1 className="text-lg font-bold text-red-600 mb-2">加载失败</h1>
          <p className="text-[var(--vscode-fg-subtle)] text-sm break-words">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 px-4 h-10 bg-[var(--vscode-list-active)] text-[var(--vscode-list-active-fg)] rounded-[6px] border border-[var(--vscode-input-border)] hover:opacity-90 transition-colors"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--vscode-bg)] text-[var(--vscode-fg)]">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-[var(--vscode-focus-border)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-[var(--vscode-fg-subtle)] text-sm">正在加载...</p>
      </div>
    </div>
  );
}

function RedirectToSession() {
  return <Navigate to="session" replace />;
}

function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<AutoRedirect />} />
        <Route path="/project/:projectId/session" element={<WritingSession />} />

        {/* 兼容旧路径 */}
        <Route path="/project/:projectId" element={<RedirectToSession />} />
        <Route path="/project/:projectId/fanfiction" element={<RedirectToSession />} />

        {/* 当前入口统一回到首页 */}
        <Route path="/agents" element={<Navigate to="/" replace />} />
        <Route path="/system" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
