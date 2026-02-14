/**
 * 文枢 WenShape - 深度上下文感知的智能体小说创作系统
 * WenShape - Deep Context-Aware Agent-Based Novel Writing System
 *
 * Copyright © 2025-2026 WenShape Team
 * License: PolyForm Noncommercial License 1.0.0
 */

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
import logger from '../utils/logger';

const fetcher = (fn) => fn().then((res) => res.data);

/**
 * ProjectDetail - 项目详情主页
 *
 * 项目管理中心，支持多个功能标签页的切换：同人导入、角色卡片、世界观、
 * 文风设定等。使用 React Context 和 SWR 管理数据和状态。
 *
 * @component
 * @returns {JSX.Element} 项目详情页布局
 *
 * 功能特性：
 * - 左侧导航栏：项目名称和功能标签
 * - 中央内容区：各功能模块的切换和展示
 * - 流畅的页面过渡动画
 */
function ProjectDetail() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('fanfiction');

  // 获取项目信息
  const { data: project } = useSWR(
    projectId ? `project-${projectId}` : null,
    () => fetcher(() => projectsAPI.get(projectId)),
    { revalidateOnFocus: false }
  );

  // 标签页标签和图标配置
  const tabLabels = {
    writing: '写作会话',
    fanfiction: '同人创作',
    characters: '角色',
    world: '世界观',
    style: '文风设定',
    drafts: '档案库'
  };

  // 角色管理状态
  const [characters, setCharacters] = useState([]);
  const [editingCharacter, setEditingCharacter] = useState(null);

  // 加载角色列表
  useEffect(() => {
    if (activeTab === 'characters') loadCharacters();
  }, [projectId, activeTab]);

  /**
   * 从 API 加载角色列表
   */
  const loadCharacters = async () => {
    try {
      const response = await cardsAPI.listCharactersIndex(projectId);
      const loaded = Array.isArray(response.data) ? response.data : [];
      setCharacters(loaded);
    } catch (error) {
      logger.error('Failed to load characters:', error);
    }
  };

  /**
   * 保存或更新角色卡片
   * @param {CharacterCard} character - 角色卡片数据
   */
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
      {/* ========================================================================
          左侧导航栏 / Left Navigation Sidebar
          ======================================================================== */}
      <motion.div
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="w-64 border-r border-[var(--vscode-sidebar-border)] bg-[var(--vscode-sidebar-bg)] flex flex-col"
      >
        {/* 项目头部 - Project Header */}
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

        {/* 导航菜单 - Navigation Menu */}
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

      {/* ========================================================================
          中央内容区 / Main Content Area
          ======================================================================== */}
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
  /**
   * 导航按钮组件
   *
   * 项目详情页左侧导航栏的单个导航项，支持激活状态、悬停效果和高亮提示。
   *
   * @param {boolean} active - 是否为激活状态
   * @param {Function} onClick - 点击处理函数
   * @param {JSX.Element} icon - 图标元素
   * @param {string} label - 按钮标签文本
   * @param {boolean} [highlight] - 是否显示高亮指示器
   */
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
