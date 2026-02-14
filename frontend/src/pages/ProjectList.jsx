/**
 * 文枢 WenShape - 深度上下文感知的智能体小说创作系统
 * WenShape - Deep Context-Aware Agent-Based Novel Writing System
 *
 * Copyright © 2025-2026 WenShape Team
 * License: PolyForm Noncommercial License 1.0.0
 */

import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import { projectsAPI } from '../api';
import { Button, Input, Card } from '../components/ui/core';
import { Plus, Book, Clock, ChevronRight, RotateCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const fetcher = (fn) => fn().then((res) => res.data);

/**
 * ProjectCardSkeleton - 作品卡片加载骨架屏
 * 显示加载中的卡片占位符，改善用户加载体验。
 */
const ProjectCardSkeleton = () => (
  <div className="bg-[var(--vscode-bg)] border border-[var(--vscode-sidebar-border)] rounded-[6px] p-6 animate-pulse">
    <div className="h-6 w-3/4 bg-[var(--vscode-list-hover)] rounded mb-2" />
    <div className="h-4 w-full bg-[var(--vscode-list-hover)] rounded mb-2 opacity-70" />
    <div className="h-4 w-2/3 bg-[var(--vscode-list-hover)] rounded mb-6 opacity-60" />
    <div className="h-3 w-1/3 bg-[var(--vscode-list-hover)] rounded opacity-80" />
  </div>
);

/**
 * ProjectList - 作品列表页
 *
 * 展示用户的所有小说项目列表，支持创建新项目和项目管理。
 * 使用 SWR 进行数据获取和缓存，提供骨架屏加载体验和空状态处理。
 *
 * @component
 * @param {Function} [onSelectProject] - 选择项目后的回调，若提供则不导航
 * @returns {JSX.Element} 项目列表页面
 *
 * @example
 * <ProjectList onSelectProject={(project) => handleSelect(project)} />
 */
function ProjectList({ onSelectProject }) {
  const navigate = useNavigate();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newProject, setNewProject] = useState({ name: '', description: '' });
  const [loading, setLoading] = useState(false);

  const { data: projects = [], isLoading } = useSWR(
    'projects-list',
    () => fetcher(projectsAPI.list),
    { revalidateOnFocus: false }
  );

  const handleCreate = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      // 调用 API 创建新项目
      const response = await projectsAPI.create(newProject);
      // 更新项目列表缓存
      mutate('projects-list');
      setShowCreateForm(false);
      setNewProject({ name: '', description: '' });
      if (onSelectProject) {
        onSelectProject(response.data);
      } else {
        navigate(`/project/${response.data.id}`);
      }
    } catch (error) {
      alert('创建失败：' + (error.response?.data?.detail || error.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="anti-theme min-h-full p-8 max-w-5xl mx-auto flex flex-col gap-10 bg-[var(--vscode-bg)] text-[var(--vscode-fg)]">
      <div className="flex justify-between items-end pb-4 border-b border-[var(--vscode-sidebar-border)]">
        <div>
          <h2 className="text-2xl font-serif font-bold text-ink-900 tracking-tight">我的作品</h2>
          <p className="text-ink-500 mt-2 text-sm">选择一部小说继续创作，或开启新的篇章。</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => mutate('projects-list')} disabled={isLoading}>
            <RotateCcw size={16} className={isLoading ? 'animate-spin mr-2' : 'mr-2'} />
            刷新
          </Button>
          <Button onClick={() => setShowCreateForm(true)}>
            <Plus size={16} className="mr-2" />
            新建作品
          </Button>
        </div>
      </div>

      {/* ========================================================================
          创建表单区域 / Create Form Section
          ======================================================================== */}
      {showCreateForm && (
        <div className="mb-6">
          <Card className="ws-paper">
            <div className="p-6">
              <h3 className="text-lg font-medium text-ink-900 mb-4 flex items-center">
                <Book size={18} className="mr-2 text-ink-500" /> 初始化新书
              </h3>
              <form onSubmit={handleCreate} className="space-y-4 max-w-lg">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-ink-500">书名</label>
                  <Input
                    type="text"
                    value={newProject.name}
                    onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                    placeholder="例如：此时此刻"
                    required
                    className="bg-[var(--vscode-input-bg)]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-ink-500">简介</label>
                  <textarea
                    value={newProject.description}
                    onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                    className="flex min-h-[80px] w-full rounded-[6px] border border-[var(--vscode-input-border)] bg-[var(--vscode-input-bg)] px-3 py-2 text-sm ring-offset-background placeholder:text-ink-400 focus-visible:outline-none focus-visible:border-[var(--vscode-focus-border)] disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                    placeholder="简要描述..."
                  />
                </div>
                <div className="flex space-x-3 pt-2">
                  <Button type="submit" disabled={loading}>
                    创建
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setShowCreateForm(false)}
                  >
                    取消
                  </Button>
                </div>
              </form>
            </div>
          </Card>
        </div>
      )}

      {/* ========================================================================
          项目网格区域 / Projects Grid Section
          ======================================================================== */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* 加载骨架屏 - Skeleton Loading */}
        {isLoading && (
          <>
            <ProjectCardSkeleton />
            <ProjectCardSkeleton />
            <ProjectCardSkeleton />
          </>
        )}

        {/* 空状态 - Empty State */}
        {!isLoading && projects.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center py-24 border border-dashed border-[var(--vscode-sidebar-border)] rounded-[6px] bg-[var(--vscode-bg)]">
            <Book className="h-12 w-12 text-ink-400 mb-4 opacity-50" />
            <p className="text-ink-500">暂无作品</p>
            <Button variant="link" onClick={() => setShowCreateForm(true)} className="mt-2 text-ink-900">
              开始创作
            </Button>
          </div>
        )}

        {/* 项目卡片列表 - Project Cards */}
        {!isLoading && projects.map((project) => (
            <div key={project.id}>
              <Card
                onClick={() => onSelectProject ? onSelectProject(project) : navigate(`/project/${project.id}`)}
                className="group cursor-pointer transition-colors bg-[var(--vscode-bg)] border border-[var(--vscode-sidebar-border)] hover:bg-[var(--vscode-list-hover)] hover:border-[var(--vscode-focus-border)] h-full"
              >
                <div className="p-6 h-full flex flex-col relative">
                  <h3 className="text-lg font-serif font-bold text-ink-900 mb-2 group-hover:text-[var(--vscode-fg)] transition-colors pr-6">
                    {project.name}
                  </h3>
                  <p className="text-sm text-ink-500 mb-6 line-clamp-2 flex-1">
                    {project.description || '暂无简介'}
                  </p>
                  <div className="flex items-center text-xs text-ink-400 mt-auto pt-4 border-t border-[var(--vscode-sidebar-border)]">
                    <Clock size={12} className="mr-2" />
                    {new Date(project.created_at).toLocaleDateString('zh-CN')}
                  </div>

                  <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ChevronRight className="text-ink-400 h-5 w-5" />
                  </div>
                </div>
              </Card>
            </div>
          ))}
      </div>
    </div>
  );
}

export default ProjectList;
