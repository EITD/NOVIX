import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useIDE } from '../../context/IDEContext';
import useSWR, { mutate } from 'swr';
import { projectsAPI } from '../../api';
import { Bot, X, ChevronDown, Folder, Plus, Check, Trash2, Home } from 'lucide-react';
import { cn } from '../ui/core';

const fetcher = (fn) => fn().then((res) => res.data);

export function TitleBar({ projectName, chapterTitle, rightActions }) {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const { state, dispatch } = useIDE();
  const [menuOpen, setMenuOpen] = useState(false);
  const [createMode, setCreateMode] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [creating, setCreating] = useState(false);
  const menuRef = useRef(null);

  const { data: projects = [] } = useSWR(
    'all-projects',
    () => fetcher(projectsAPI.list),
    { revalidateOnFocus: false }
  );

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
        setCreateMode(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    setCreating(true);
    try {
      const res = await projectsAPI.create({ name: newProjectName.trim() });
      mutate('all-projects');
      setNewProjectName('');
      setCreateMode(false);
      setMenuOpen(false);
      navigate(`/project/${res.data.id}/session`);
    } catch (error) {
      console.error('Failed to create project:', error);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteProject = async (id, e) => {
    e.stopPropagation();
    if (!confirm('确定要删除此项目吗？此操作不可撤销。')) return;
    try {
      await projectsAPI.delete(id);
      mutate('all-projects');
      if (id === projectId) {
        navigate('/');
      }
    } catch (error) {
      console.error('Failed to delete project:', error);
    }
  };

  return (
    <div className="h-10 min-h-[40px] bg-surface border-b border-border flex items-center justify-between px-4 select-none flex-shrink-0">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/')}
          className="font-serif font-bold text-xl tracking-tight text-ink-900 hover:text-primary transition-colors"
          title="返回首页"
        >
          NOVIX
        </button>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors',
              menuOpen
                ? 'bg-primary text-white'
                : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900'
            )}
          >
            <Folder size={14} />
            <span className="max-w-[120px] truncate">{projectName || '选择项目'}</span>
            <ChevronDown size={12} className={cn('transition-transform', menuOpen && 'rotate-180')} />
          </button>

          {menuOpen && (
            <div className="absolute left-0 top-full mt-1 w-64 bg-surface border border-border rounded-lg shadow-lg py-1 z-50 animate-in fade-in slide-in-from-top-2">
              <div className="px-3 py-2 text-xs font-bold text-ink-400 uppercase">我的项目</div>

              <div className="max-h-48 overflow-y-auto">
                {projects.map((project) => (
                  <div
                    key={project.id}
                    onClick={() => {
                      navigate(`/project/${project.id}/session`);
                      setMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-ink-700 hover:bg-ink-50 transition-colors cursor-pointer group"
                  >
                    <Folder size={14} className="text-ink-400 flex-shrink-0" />
                    <span className="flex-1 text-left truncate">{project.name}</span>
                    {project.id === projectId && (
                      <Check size={14} className="text-primary flex-shrink-0" />
                    )}
                    <button
                      onClick={(e) => handleDeleteProject(project.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 rounded text-ink-400 hover:text-red-500 transition-all flex-shrink-0"
                      title="删除项目"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="border-t border-border my-1" />

              {createMode ? (
                <div className="px-3 py-2">
                  <input
                    type="text"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
                    placeholder="输入项目名称..."
                    className="w-full text-xs py-1.5 px-2 border border-border rounded focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none"
                    autoFocus
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={handleCreateProject}
                      disabled={creating || !newProjectName.trim()}
                      className="flex-1 py-1.5 bg-primary text-white text-xs rounded hover:bg-primary/90 disabled:opacity-50"
                    >
                      {creating ? '创建中...' : '创建'}
                    </button>
                    <button
                      onClick={() => {
                        setCreateMode(false);
                        setNewProjectName('');
                      }}
                      className="py-1.5 px-3 text-xs text-ink-600 hover:bg-ink-50 rounded"
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setCreateMode(true)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-ink-700 hover:bg-ink-50 transition-colors"
                >
                  <Plus size={14} className="text-ink-400" />
                  <span>新建项目...</span>
                </button>
              )}

              <button
                onClick={() => {
                  navigate('/');
                  setMenuOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-ink-700 hover:bg-ink-50 transition-colors"
              >
                <Home size={14} className="text-ink-400" />
                <span>返回首页</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center gap-2 text-sm">
        {state.unsavedChanges && <span className="text-yellow-500 text-lg">•</span>}
        {chapterTitle && <span className="text-ink-900 font-medium">{chapterTitle}</span>}
      </div>

      <div className="flex items-center gap-2">
        {rightActions}
        <button
          onClick={() => dispatch({ type: 'TOGGLE_RIGHT_PANEL' })}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors',
            state.rightPanelVisible
              ? 'bg-primary text-white'
              : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900'
          )}
          title={state.rightPanelVisible ? '关闭 AI 助手' : '打开 AI 助手'}
        >
          {state.rightPanelVisible ? (
            <>
              <Bot size={14} />
              <span>AI 助手</span>
              <X size={12} />
            </>
          ) : (
            <>
              <Bot size={14} />
              <span>AI 助手</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
