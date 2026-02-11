/**
 * CardsPanel - 设定卡片面板
 * 仅做视觉一致性优化，不改变数据与交互逻辑。
 */
import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useIDE } from '../../../context/IDEContext';
import { useParams } from 'react-router-dom';
import { cardsAPI } from '../../../api';
import { Plus, RefreshCw, User, Globe, Trash2, FileText, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '../../ui/core';

const normalizeStars = (value) => {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) return 1;
  return Math.max(1, Math.min(parsed, 3));
};

const compareByStarsThenName = (a, b) => {
  const starDiff = normalizeStars(b?.stars) - normalizeStars(a?.stars);
  if (starDiff !== 0) return starDiff;
  return String(a?.name || '').localeCompare(String(b?.name || ''), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
};

export default function CardsPanel() {
  const { projectId } = useParams();
  const { state, dispatch } = useIDE();
  const [entities, setEntities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState('character');

  const [styleCard, setStyleCard] = useState({ style: '' });
  const [styleExpanded, setStyleExpanded] = useState(true);
  const [styleSample, setStyleSample] = useState('');
  const [styleExtracting, setStyleExtracting] = useState(false);

  useEffect(() => {
    loadEntities();
  }, [projectId, state.lastSavedAt]);

  const loadEntities = async () => {
    setLoading(true);
    try {
      const [charsResp, worldsResp, styleResp] = await Promise.allSettled([
        cardsAPI.listCharacters(projectId),
        cardsAPI.listWorld(projectId),
        cardsAPI.getStyle(projectId)
      ]);

      const chars = charsResp.status === 'fulfilled' ? (Array.isArray(charsResp.value.data) ? charsResp.value.data : []) : [];
      const worlds = worldsResp.status === 'fulfilled' ? (Array.isArray(worldsResp.value.data) ? worldsResp.value.data : []) : [];
      const style = styleResp.status === 'fulfilled' ? styleResp.value.data : null;

      const characterDetails = await Promise.allSettled(
        chars.map((name) => cardsAPI.getCharacter(projectId, name))
      );
      const worldDetails = await Promise.allSettled(
        worlds.map((name) => cardsAPI.getWorld(projectId, name))
      );

      const characterMap = new Map();
      for (const result of characterDetails) {
        if (result.status === 'fulfilled') {
          const card = result.value?.data;
          if (card?.name) {
            characterMap.set(card.name, card);
          }
        }
      }

      const worldMap = new Map();
      for (const result of worldDetails) {
        if (result.status === 'fulfilled') {
          const card = result.value?.data;
          if (card?.name) {
            worldMap.set(card.name, card);
          }
        }
      }

      const combined = [
        ...chars.map(name => ({
          name,
          type: 'character',
          stars: normalizeStars(characterMap.get(name)?.stars)
        })),
        ...worlds.map(name => ({
          name,
          type: 'world',
          stars: normalizeStars(worldMap.get(name)?.stars)
        }))
      ];

      setEntities(combined);
      setStyleCard(style || { style: '' });
    } catch (e) {
      console.error('Failed to load cards', e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCard = () => {
    if (typeFilter === 'style') return;
    const newCard = { name: '', type: typeFilter, isNew: true };
    dispatch({
      type: 'SET_ACTIVE_DOCUMENT',
      payload: { type: typeFilter, id: '', data: newCard, isNew: true }
    });
  };

  const handleDeleteCard = async (entity, e) => {
    e.stopPropagation();
    if (!confirm(`确定要删除“${entity.name}”吗？此操作不可撤销。`)) return;

    try {
      if (entity.type === 'character') {
        await cardsAPI.deleteCharacter(projectId, entity.name);
      } else if (entity.type === 'world') {
        await cardsAPI.deleteWorld(projectId, entity.name);
      }

      await loadEntities();

      if (state.activeDocument?.id === entity.name) {
        dispatch({ type: 'CLEAR_ACTIVE_DOCUMENT' });
      }
    } catch (error) {
      console.error('Failed to delete card:', error);
      alert('删除失败：' + (error.response?.data?.detail || error.message));
    }
  };

  const handleSaveStyle = async () => {
    try {
      await cardsAPI.updateStyle(projectId, { style: styleCard.style || '' });
    } catch (error) {
      console.error('Failed to save style card:', error);
    }
  };

  const handleExtractStyle = async () => {
    if (!styleSample.trim()) {
      alert('请先粘贴用于提炼的文本');
      return;
    }
    setStyleExtracting(true);
    try {
      const resp = await cardsAPI.extractStyle(projectId, { content: styleSample });
      const style = resp.data?.style || '';
      setStyleCard({ style });
      await cardsAPI.updateStyle(projectId, { style });
    } catch (error) {
      alert('提炼失败：' + (error.response?.data?.detail || error.message));
    } finally {
      setStyleExtracting(false);
    }
  };

  const filteredEntities = useMemo(() => {
    return entities
      .filter((entity) => entity.type === typeFilter)
      .slice()
      .sort(compareByStarsThenName);
  }, [entities, typeFilter]);

  const getCardIcon = (type) => {
    switch (type) {
      case 'character':
        return <User size={14} className="text-[var(--vscode-fg-subtle)]" />;
      case 'world':
        return <Globe size={14} className="text-[var(--vscode-fg-subtle)]" />;
      case 'style':
        return <FileText size={14} className="text-[var(--vscode-fg-subtle)]" />;
      default:
        return <FileText size={14} className="text-[var(--vscode-fg-subtle)]" />;
    }
  };

  const typeOptions = [
    { id: 'character', label: '角色', icon: User },
    { id: 'world', label: '设定', icon: Globe },
    { id: 'style', label: '文风', icon: FileText }
  ];

  const currentIndex = typeOptions.findIndex(opt => opt.id === typeFilter);

  return (
    <div className="anti-theme h-full flex flex-col bg-[var(--vscode-bg)] text-[var(--vscode-fg)]">
      <div className="p-2 border-b border-[var(--vscode-sidebar-border)] bg-[var(--vscode-sidebar-bg)]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold uppercase tracking-wider pl-2 text-[var(--vscode-fg-subtle)]">卡片库</span>
          <div className="flex gap-1">
            <button onClick={loadEntities} className="p-1 hover:bg-[var(--vscode-list-hover)] rounded-[4px]" title="刷新">
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            </button>
            {typeFilter !== 'style' && (
              <button
                onClick={handleCreateCard}
                className="p-1 hover:bg-[var(--vscode-list-hover)] rounded-[4px]"
                title="新建卡片"
              >
                <Plus size={12} />
              </button>
            )}
          </div>
        </div>

        <div className="px-1 py-1">
          <div className="relative bg-[var(--vscode-bg)] rounded-[6px] p-0.5 border border-[var(--vscode-sidebar-border)]">
            <motion.div
              className="absolute top-0.5 bottom-0.5 bg-[var(--vscode-list-active)] rounded-[4px]"
              initial={false}
              animate={{
                left: `calc(${currentIndex * 33.333}% + 2px)`,
                width: 'calc(33.333% - 4px)'
              }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />

            <div className="relative flex">
              {typeOptions.map((opt) => {
                const Icon = opt.icon;
                const isActive = typeFilter === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => setTypeFilter(opt.id)}
                    className={cn(
                      'flex-1 relative z-10 py-1 px-2 text-[10px] font-medium rounded-[4px] transition-none',
                      isActive ? 'text-[var(--vscode-list-active-fg)]' : 'text-[var(--vscode-fg-subtle)] hover:text-[var(--vscode-fg)]'
                    )}
                  >
                    <div className="flex items-center justify-center gap-1">
                      <Icon size={10} className={isActive ? 'opacity-90' : 'opacity-60'} />
                      <span>{opt.label}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {typeFilter === 'style' && (
          <div className="space-y-2">
            <div
              onClick={() => setStyleExpanded(!styleExpanded)}
              className="flex items-center gap-2 p-2 rounded-[6px] cursor-pointer hover:bg-[var(--vscode-list-hover)] transition-none"
            >
              {styleExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <FileText size={14} className="text-[var(--vscode-fg-subtle)]" />
              <span className="text-sm font-medium flex-1">文风设定</span>
            </div>

            {styleExpanded && (
              <div className="pl-6 pr-2 space-y-3 pb-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[var(--vscode-fg-subtle)] uppercase">文风</label>
                  <textarea
                    value={styleCard.style || ''}
                    onChange={e => {
                      setStyleCard(prev => ({ ...prev, style: e.target.value }));
                      e.target.style.height = 'auto';
                      e.target.style.height = e.target.scrollHeight + 'px';
                    }}
                    onBlur={handleSaveStyle}
                    onFocus={e => {
                      e.target.style.height = 'auto';
                      e.target.style.height = e.target.scrollHeight + 'px';
                    }}
                    className="w-full text-xs p-2 border border-[var(--vscode-input-border)] rounded-[6px] bg-[var(--vscode-input-bg)] text-[var(--vscode-fg)] focus:border-[var(--vscode-focus-border)] focus:ring-1 focus:ring-[var(--vscode-focus-border)] min-h-[120px] resize-none overflow-hidden"
                    placeholder="写作风格要求..."
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-[var(--vscode-fg-subtle)] uppercase">文风提炼</label>
                    <button
                      type="button"
                      onClick={handleExtractStyle}
                      className="text-[10px] px-2 py-1 rounded-[4px] border border-[var(--vscode-input-border)] text-[var(--vscode-fg)] hover:bg-[var(--vscode-list-hover)] disabled:opacity-60"
                      disabled={styleExtracting}
                    >
                      {styleExtracting ? '提炼中...' : '提炼并覆盖'}
                    </button>
                  </div>
                  <textarea
                    value={styleSample}
                    onChange={e => setStyleSample(e.target.value)}
                    className="w-full text-xs p-2 border border-[var(--vscode-input-border)] rounded-[6px] bg-[var(--vscode-input-bg)] text-[var(--vscode-fg)] focus:border-[var(--vscode-focus-border)] focus:ring-1 focus:ring-[var(--vscode-focus-border)] min-h-[90px] resize-none overflow-hidden"
                    placeholder="粘贴喜欢的文本片段"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {typeFilter !== 'style' && (
          <>
            {filteredEntities.length === 0 && !loading && (
              <div className="text-center text-xs text-[var(--vscode-fg-subtle)] py-8">
                <p>暂无{typeOptions.find(opt => opt.id === typeFilter)?.label}卡片</p>
                <p className="text-[10px] mt-2 opacity-60">点击右上角 + 创建卡片</p>
              </div>
            )}

            <div className="space-y-1">
              <AnimatePresence>
                {filteredEntities.map((entity, idx) => (
                  <motion.div
                    key={entity.id || entity.name || idx}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2, delay: idx * 0.05 }}
                    onClick={() => dispatch({
                      type: 'SET_ACTIVE_DOCUMENT',
                      payload: { type: entity.type || 'card', id: entity.name, data: entity }
                    })}
                    className={cn(
                      'flex items-start gap-2 px-2 py-2 rounded-[6px] cursor-pointer hover:bg-[var(--vscode-list-hover)] group border border-transparent transition-none',
                      state.activeDocument?.id === entity.name && state.activeDocument?.type === (entity.type || 'card')
                        ? 'bg-[var(--vscode-list-active)] text-[var(--vscode-list-active-fg)]'
                        : ''
                    )}
                  >
                    <div className="mt-0.5 opacity-60">
                      {getCardIcon(entity.type)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium leading-none mb-1">{entity.name}</div>
                        <div className="text-[10px] opacity-70">{`${normalizeStars(entity.stars)}星`}</div>
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleDeleteCard(entity, e)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 rounded-[4px] text-[var(--vscode-fg-subtle)] hover:text-red-500 transition-none"
                      title="删除卡片"
                    >
                      <Trash2 size={12} />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
