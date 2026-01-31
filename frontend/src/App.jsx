/**
 * NOVIX App - 主路由配置
 * 
 * IDE-First 设计：用户进入应用直接进入 IDE
 * - / : 自动重定向到最近项目的 IDE，或显示项目选择器
 * - /project/:projectId/session : IDE 主界面
 */
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import WritingSession from './pages/WritingSession';
import ErrorBoundary from './components/ErrorBoundary';
import { projectsAPI } from './api';

// 自动重定向到最近项目或创建新项目
function AutoRedirect() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const redirect = async () => {
      try {
        const res = await projectsAPI.list();
        const projects = res.data;

        if (projects && projects.length > 0) {
          // 有项目：进入第一个（最近的）项目
          navigate(`/project/${projects[0].id}/session`, { replace: true });
        } else {
          // 没有项目：创建默认项目并进入
          const newProject = await projectsAPI.create({ name: '我的第一个项目' });
          navigate(`/project/${newProject.data.id}/session`, { replace: true });
        }
      } catch (err) {
        console.error('Failed to load projects:', err);
        setError(err.message);
        setLoading(false);
      }
    };
    redirect();
  }, [navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="text-center p-8">
          <h1 className="text-xl font-bold text-red-600 mb-2">加载失败</h1>
          <p className="text-ink-500">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-primary text-white rounded"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-ink-500 text-sm">正在加载...</p>
      </div>
    </div>
  );
}

// 旧路由重定向
function RedirectToSession() {
  return <Navigate to="session" replace />;
}

function App() {
  return (
    <ErrorBoundary>
      <Routes>
        {/* 根路由：自动重定向到最近项目 */}
        <Route path="/" element={<AutoRedirect />} />

        {/* IDE 主路由 */}
        <Route path="/project/:projectId/session" element={<WritingSession />} />

        {/* 兼容性重定向 */}
        <Route path="/project/:projectId" element={<RedirectToSession />} />
        <Route path="/project/:projectId/fanfiction" element={<RedirectToSession />} />
        <Route path="/agents" element={<Navigate to="/" replace />} />
        <Route path="/system" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
