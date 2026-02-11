import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useSWR from 'swr';
import { useNavigate, useParams } from 'react-router-dom';
import { projectsAPI, cardsAPI } from '../api';
import { CharacterView } from '../components/project/CharacterView';
import { DraftsView } from '../components/project/DraftsView';

import FanfictionView from './FanfictionView';
import { WorldView } from '../components/project/WorldView';
import { StyleView } from '../components/project/StyleView';
import { Button } from '../components/ui/Button';
import {
  Users,
  BookOpen,
  PenTool,
  Globe,
  FileText,
  ArrowLeft,
  Library
} from 'lucide-react';
import { cn } from '../lib/utils';

const fetcher = (fn) => fn().then((res) => res.data);

/**
 * ProjectDetail - 项目详情页
 * 负责切换各功能视图，不改变数据结构与交互语义。
 */
function ProjectDetail() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('fanfiction');

  const { data: project } = useSWR(
    projectId ? `project-${projectId}` : null,
    () => fetcher(() => projectsAPI.get(projectId)),
    { revalidateOnFocus: false }
  );

  const tabLabels = {
    writing: '写作会话',
    fanfiction: '同人创作',
    characters: '角色',
    world: '世界观',
    style: '文风设定',
    drafts: '档案库'
  };

  const [characters, setCharacters] = useState([]);
  const [editingCharacter, setEditingCharacter] = useState(null);

  useEffect(() => {
    if (activeTab === 'characters') loadCharacters();
  }, [projectId, activeTab]);

  const loadCharacters = async () => {
    try {
      const names = await cardsAPI.listCharacters(projectId);
      const chars = [];
      for (const name of names.data) {
        const char = await cardsAPI.getCharacter(projectId, name);
        chars.push(char.data);
      }
      setCharacters(chars);
    } catch (error) {
      console.error('Failed to load characters:', error);
    }
  };

  const saveCharacter = async (character) => {
    try {
      if (editingCharacter?.name && editingCharacter.name !== '') {
        await cardsAPI.updateCharacter(projectId, editingCharacter.name, character);
      } else {
        await cardsAPI.createCharacter(projectId, character);
      }
      await loadCharacters();
      setEditingCharacter(null);
    } catch (error) {
      alert(`保存失败: ${error.response?.data?.detail || error.message}`);
    }
  };

  return (
    <div className="anti-theme flex h-screen bg-[var(--vscode-bg)] text-[var(--vscode-fg)] overflow-hidden">
      <motion.div
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="w-64 border-r border-[var(--vscode-sidebar-border)] bg-[var(--vscode-sidebar-bg)] flex flex-col"
      >
        <div className="p-4 border-b border-[var(--vscode-sidebar-border)]">
          <Button
            variant="ghost"
            onClick={() => navigate('/')}
            className="w-full justify-start text-sm"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回作品列表
          </Button>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <h2 className="mt-4 text-xl font-serif font-bold text-[var(--vscode-fg)] truncate">
              {project?.name || '加载中...'}
            </h2>
          </motion.div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          <NavButton
            active={activeTab === 'writing'}
            onClick={() => navigate(`/project/${projectId}/session`)}
            icon={<PenTool size={18} />}
            label={tabLabels.writing}
            highlight
          />
          <NavButton
            active={activeTab === 'fanfiction'}
            onClick={() => setActiveTab('fanfiction')}
            icon={<BookOpen size={18} />}
            label={tabLabels.fanfiction}
          />
          <NavButton
            active={activeTab === 'characters'}
            onClick={() => setActiveTab('characters')}
            icon={<Users size={18} />}
            label={tabLabels.characters}
          />
          <NavButton
            active={activeTab === 'world'}
            onClick={() => setActiveTab('world')}
            icon={<Globe size={18} />}
            label={tabLabels.world}
          />
          <NavButton
            active={activeTab === 'style'}
            onClick={() => setActiveTab('style')}
            icon={<FileText size={18} />}
            label={tabLabels.style}
          />
          <NavButton
            active={activeTab === 'drafts'}
            onClick={() => setActiveTab('drafts')}
            icon={<Library size={18} />}
            label={tabLabels.drafts}
          />
        </nav>
      </motion.div>

      <div className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="h-full"
          >
            {activeTab === 'fanfiction' && (
              <FanfictionView />
            )}
            {activeTab === 'characters' && (
              <CharacterView
                characters={characters}
                onSave={saveCharacter}
                onEdit={setEditingCharacter}
                editingCharacter={editingCharacter}
              />
            )}
            {activeTab === 'world' && (
              <WorldView projectId={projectId} />
            )}
            {activeTab === 'style' && (
              <StyleView projectId={projectId} />
            )}
            {activeTab === 'drafts' && (
              <DraftsView projectId={projectId} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function NavButton({ active, onClick, icon, label, highlight }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 rounded-[6px] text-sm font-medium transition-colors",
        active
          ? "bg-[var(--vscode-list-active)] text-[var(--vscode-list-active-fg)]"
          : "text-[var(--vscode-fg-subtle)] hover:bg-[var(--vscode-list-hover)] hover:text-[var(--vscode-fg)]",
        highlight && !active && "text-[var(--vscode-focus-border)]"
      )}
    >
      <span className={active ? "text-[var(--vscode-list-active-fg)]" : "text-[var(--vscode-fg-subtle)]"}>
        {icon}
      </span>
      {label}
      {highlight && !active && (
        <span className="ml-auto h-2 w-2 rounded-full bg-[var(--vscode-focus-border)]" />
      )}
    </button>
  );
}

export default ProjectDetail;
