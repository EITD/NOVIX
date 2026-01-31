import React, { useState, useEffect } from 'react';
import { cardsAPI } from '../../api';
import { Card, Button, Input } from '../ui/core';
import { Plus, Globe, X, Save } from 'lucide-react';

export function WorldView({ projectId }) {
  const [cards, setCards] = useState([]);
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState({ name: '', description: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadCards();
  }, [projectId]);

  const loadCards = async () => {
    setLoading(true);
    try {
      const response = await cardsAPI.listWorld(projectId);
      const names = response.data || [];
      const loaded = [];
      for (const name of names) {
        try {
          const cardRes = await cardsAPI.getWorld(projectId, name);
          loaded.push(cardRes.data);
        } catch {
          // ignore
        }
      }
      setCards(loaded);
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (card = {}) => {
    setEditing(card);
    setFormData({
      name: card.name || '',
      description: card.description || ''
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    const payload = {
      name: formData.name.trim(),
      description: (formData.description || '').trim()
    };

    if (editing?.name) {
      await cardsAPI.updateWorld(projectId, editing.name, payload);
    } else {
      await cardsAPI.createWorld(projectId, payload);
    }

    setEditing(null);
    setFormData({ name: '', description: '' });
    await loadCards();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-140px)]">
      <div className="lg:col-span-4 flex flex-col gap-4 overflow-hidden">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-bold text-ink-900">世界设定</h3>
          <Button size="sm" onClick={() => startEdit({})}>
            <Plus size={16} className="mr-2" /> 新建
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto space-y-3 pr-2">
          {cards.map((card) => (
            <div
              key={card.name}
              onClick={() => startEdit(card)}
              className={`p-4 rounded-lg border cursor-pointer transition-all shadow-sm ${
                editing?.name === card.name
                  ? 'bg-primary text-white border-primary shadow-md'
                  : 'bg-surface border-border text-ink-500 hover:border-primary/50 hover:text-ink-900 hover:shadow-md'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold font-serif text-lg">{card.name}</span>
                <Globe size={14} className="opacity-70" />
              </div>
              <div className={`text-xs opacity-90 line-clamp-2 ${editing?.name === card.name ? 'text-white' : 'text-ink-400'}`}>
                {card.description || '暂无描述'}
              </div>
            </div>
          ))}
          {!loading && cards.length === 0 && (
            <div className="text-xs text-ink-400">暂无设定卡</div>
          )}
        </div>
      </div>

      <Card className="lg:col-span-8 bg-surface border border-border rounded-lg overflow-hidden flex flex-col shadow-paper">
        {editing ? (
          <div className="flex-1 flex flex-col">
            <div className="flex flex-row items-center justify-between p-6 border-b border-border bg-gray-50/50">
              <h3 className="font-bold text-lg text-ink-900 flex items-center gap-2">
                <Globe className="text-primary" size={18} />
                {editing.name ? `编辑: ${editing.name}` : '新建设定'}
              </h3>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                  <X size={16} />
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-8">
              <form id="world-form" onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-ink-500 uppercase">名称</label>
                  <Input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="设定名称"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-ink-500 uppercase">描述</label>
                  <textarea
                    className="flex min-h-[200px] w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm placeholder:text-ink-400 focus-visible:outline-none focus-visible:border-ink-900 transition-colors"
                    value={formData.description || ''}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="用途、背景、规则、氛围等"
                  />
                </div>
              </form>
            </div>
            <div className="p-4 border-t border-border bg-gray-50 flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setEditing(null)}>取消</Button>
              <Button form="world-form" type="submit">
                <Save size={16} className="mr-2" /> 保存设定
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-ink-400">
            <Globe size={64} className="mb-4 opacity-20" />
            <div className="font-serif text-lg">选择或创建设定以开始编辑</div>
          </div>
        )}
      </Card>
    </div>
  );
}
