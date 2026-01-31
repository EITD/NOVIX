import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useIDE } from '../../../context/IDEContext';
import { useParams } from 'react-router-dom';
import { cardsAPI } from '../../../api';
import { Plus, RefreshCw, User, Globe, Trash2, FileText, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '../../ui/core';

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
  }, [projectId]);

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

      const combined = [
        ...chars.map(name => ({ name, type: 'character' })),
        ...worlds.map(name => ({ name, type: 'world' }))
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

  const filteredEntities = entities.filter(e => e.type === typeFilter);

  const getCardIcon = (type) => {
    switch (type) {
      case 'character':
        return <User size={14} className="text-indigo-500" />;
      case 'world':
        return <Globe size={14} className="text-emerald-500" />;
      case 'style':
        return <FileText size={14} className="text-amber-500" />;
      default:
        return <FileText size={14} className="text-ink-400" />;
    }
  };

  const typeOptions = [
    { id: 'character', label: '角色', icon: User },
    { id: 'world', label: '设定', icon: Globe },
    { id: 'style', label: '文风', icon: FileText }
  ];

  const currentIndex = typeOptions.findIndex(opt => opt.id === typeFilter);

  return (
    <div className="h-full flex flex-col">
      <div className="p-2 border-b border-border/50">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold uppercase tracking-wider pl-2 text-ink-500">卡片库</span>
          <div className="flex gap-1">
            <button onClick={loadEntities} className="p-1 hover:bg-black/5 rounded" title="刷新">
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            </button>
            {typeFilter !== 'style' && (
              <button
                onClick={handleCreateCard}
                className="p-1 hover:bg-black/5 rounded"
                title="新建卡片"
              >
                <Plus size={12} />
              </button>
            )}
          </div>
        </div>

        <div className="px-1 py-1">
          <div className="relative bg-ink-50 rounded-full p-0.5 border border-border/30">
            <motion.div
              className="absolute top-0.5 bottom-0.5 bg-primary rounded-full shadow-sm"
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
                      'flex-1 relative z-10 py-1 px-2 text-[10px] font-medium rounded-full transition-colors duration-200',
                      isActive ? 'text-white' : 'text-ink-500 hover:text-ink-700'
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
              className="flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-ink-50 transition-colors"
            >
              {styleExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <FileText size={14} className="text-amber-500" />
              <span className="text-sm font-medium flex-1">文风设定</span>
            </div>

            {styleExpanded && (
              <div className="pl-6 pr-2 space-y-3 pb-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-ink-500 uppercase">文风</label>
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
                    className="w-full text-xs p-2 border border-border rounded bg-surface/50 focus:border-primary focus:ring-1 focus:ring-primary/20 min-h-[120px] resize-none overflow-hidden"
                    placeholder="写作风格要求..."
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-ink-500 uppercase">AI 文风提炼</label>
                    <button
                      type="button"
                      onClick={handleExtractStyle}
                      className="text-[10px] px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-60"
                      disabled={styleExtracting}
                    >
                      {styleExtracting ? '提炼中...' : '提炼并覆盖'}
                    </button>
                  </div>
                  <textarea
                    value={styleSample}
                    onChange={e => setStyleSample(e.target.value)}
                    className="w-full text-xs p-2 border border-border rounded bg-background focus:border-primary focus:ring-1 focus:ring-primary/20 min-h-[90px] resize-none overflow-hidden"
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
              <div className="text-center text-xs text-ink-400 py-8">
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
                      'flex items-start gap-2 px-2 py-2 rounded cursor-pointer hover:bg-ink-50 group border border-transparent hover:border-border/50 transition-all',
                      state.activeDocument?.id === entity.name && state.activeDocument?.type === (entity.type || 'card')
                        ? 'bg-primary/10 border-primary/20'
                        : ''
                    )}
                  >
                    <div className="mt-0.5 opacity-60">
                      {getCardIcon(entity.type)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-ink-700 leading-none mb-1">{entity.name}</div>
                    </div>
                    <button
                      onClick={(e) => handleDeleteCard(entity, e)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 rounded text-ink-400 hover:text-red-500 transition-all"
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
