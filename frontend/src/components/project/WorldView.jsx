import React, { useState, useEffect } from 'react';
import { cardsAPI } from '../../api';
import { Card, Button, Input } from '../ui/core';
import { Plus, Globe, X, Save } from 'lucide-react';

const normalizeStars = (value) => {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) return 1;
  return Math.max(1, Math.min(parsed, 3));
};

const formatAliases = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean).join('，');
  return value || '';
};

const parseListInput = (value) => {
  return String(value || '')
    .split(/[,，;；\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const formatRulesInput = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean).join('\n');
  return value || '';
};

/**
 * WorldView - 世界设定视图
 * 负责设定卡列表与编辑表单展示。
 */
export function WorldView({ projectId }) {
  const [cards, setCards] = useState([]);
  const [editing, setEditing] = useState(null);
  const sortedCards = React.useMemo(() => {
    const list = Array.isArray(cards) ? cards.slice() : [];
    list.sort((a, b) => {
      const starDiff = normalizeStars(b?.stars) - normalizeStars(a?.stars);
      if (starDiff !== 0) return starDiff;
      return String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { numeric: true, sensitivity: 'base' });
    });
    return list;
  }, [cards]);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    aliases: '',
    category: '',
    rules: '',
    immutable: 'unset',
    stars: 1
  });
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
      description: card.description || '',
      aliases: formatAliases(card.aliases),
      category: card.category || '',
      rules: formatRulesInput(card.rules),
      immutable: card.immutable === true ? 'true' : card.immutable === false ? 'false' : 'unset',
      stars: normalizeStars(card.stars)
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    const rules = parseListInput(formData.rules);
    const aliases = parseListInput(formData.aliases);
    const immutableValue =
      formData.immutable === 'true' ? true : formData.immutable === 'false' ? false : undefined;
    const payload = {
      name: formData.name.trim(),
      description: (formData.description || '').trim(),
      aliases,
      category: (formData.category || '').trim(),
      rules,
      stars: normalizeStars(formData.stars)
    };
    if (immutableValue !== undefined) {
      payload.immutable = immutableValue;
    }

    if (editing?.name) {
      await cardsAPI.updateWorld(projectId, editing.name, payload);
    } else {
      await cardsAPI.createWorld(projectId, payload);
    }

    setEditing(null);
    setFormData({
      name: '',
      description: '',
      aliases: '',
      category: '',
      rules: '',
      immutable: 'unset',
      stars: 1
    });
    await loadCards();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-140px)]">
      <div className="lg:col-span-4 flex flex-col gap-4 overflow-hidden">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-bold text-[var(--vscode-fg)]">世界设定</h3>
          <Button size="sm" onClick={() => startEdit({})}>
            <Plus size={16} className="mr-2" /> 新建
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto space-y-3 pr-2">
          {sortedCards.map((card) => (
            <div
              key={card.name}
              onClick={() => startEdit(card)}
              className={`p-4 rounded-[6px] border cursor-pointer transition-colors ${
                editing?.name === card.name
                  ? 'bg-[var(--vscode-list-active)] text-[var(--vscode-list-active-fg)] border-[var(--vscode-input-border)]'
                  : 'bg-[var(--vscode-bg)] border-[var(--vscode-sidebar-border)] text-[var(--vscode-fg-subtle)] hover:bg-[var(--vscode-list-hover)] hover:text-[var(--vscode-fg)]'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold font-serif text-lg">{card.name}</span>
                <div className="flex items-center gap-2 text-[10px] opacity-80">
                  <span>{`${normalizeStars(card.stars)}星`}</span>
                  <Globe size={14} className="opacity-70" />
                </div>
              </div>
              <div className={`text-xs opacity-90 line-clamp-2 ${editing?.name === card.name ? 'text-[var(--vscode-list-active-fg)]' : 'text-[var(--vscode-fg-subtle)]'}`}>
                {card.description || '暂无描述'}
              </div>
            </div>
          ))}
          {!loading && cards.length === 0 && (
            <div className="text-xs text-[var(--vscode-fg-subtle)]">暂无设定卡</div>
          )}
        </div>
      </div>

      <Card className="lg:col-span-8 bg-[var(--vscode-bg)] border border-[var(--vscode-sidebar-border)] rounded-[6px] overflow-hidden flex flex-col shadow-none">
        {editing ? (
          <div className="flex-1 flex flex-col">
            <div className="flex flex-row items-center justify-between p-6 border-b border-[var(--vscode-sidebar-border)] bg-[var(--vscode-sidebar-bg)]">
              <h3 className="font-bold text-lg text-[var(--vscode-fg)] flex items-center gap-2">
                <Globe className="text-[var(--vscode-fg-subtle)]" size={18} />
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
                  <label className="text-xs font-bold text-[var(--vscode-fg-subtle)] uppercase">名称</label>
                  <Input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="设定名称"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-[var(--vscode-fg-subtle)] uppercase">星级</label>
                  <select
                    value={formData.stars}
                    onChange={(e) => setFormData({ ...formData, stars: normalizeStars(e.target.value) })}
                    className="w-full h-10 px-3 rounded-[6px] border border-[var(--vscode-input-border)] bg-[var(--vscode-input-bg)] text-sm text-[var(--vscode-fg)] focus-visible:outline-none focus-visible:border-[var(--vscode-focus-border)] transition-colors"
                  >
                    <option value={3}>三星（必须关注）</option>
                    <option value={2}>二星（重要）</option>
                    <option value={1}>一星（可选）</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-[var(--vscode-fg-subtle)] uppercase">别名</label>
                  <Input
                    type="text"
                    value={formData.aliases || ''}
                    onChange={(e) => setFormData({ ...formData, aliases: e.target.value })}
                    placeholder="别名（用逗号分隔，可留空）"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-[var(--vscode-fg-subtle)] uppercase">类别</label>
                  <Input
                    type="text"
                    value={formData.category || ''}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    placeholder="类别/名词解释"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-[var(--vscode-fg-subtle)] uppercase">规则</label>
                  <textarea
                    className="flex min-h-[160px] w-full rounded-[6px] border border-[var(--vscode-input-border)] bg-[var(--vscode-input-bg)] px-3 py-2 text-sm text-[var(--vscode-fg)] placeholder:text-[var(--vscode-fg-subtle)] focus-visible:outline-none focus-visible:border-[var(--vscode-focus-border)] transition-colors resize-none"
                    value={formData.rules || ''}
                    onChange={(e) => setFormData({ ...formData, rules: e.target.value })}
                    placeholder="每行一条规则"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-[var(--vscode-fg-subtle)] uppercase">不可变</label>
                  <select
                    value={formData.immutable}
                    onChange={(e) => setFormData({ ...formData, immutable: e.target.value })}
                    className="w-full h-10 px-3 rounded-[6px] border border-[var(--vscode-input-border)] bg-[var(--vscode-input-bg)] text-sm text-[var(--vscode-fg)] focus-visible:outline-none focus-visible:border-[var(--vscode-focus-border)] transition-colors"
                  >
                    <option value="unset">未设置</option>
                    <option value="true">不可变</option>
                    <option value="false">可变</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-[var(--vscode-fg-subtle)] uppercase">描述</label>
                  <textarea
                    className="flex min-h-[200px] w-full rounded-[6px] border border-[var(--vscode-input-border)] bg-[var(--vscode-input-bg)] px-3 py-2 text-sm text-[var(--vscode-fg)] placeholder:text-[var(--vscode-fg-subtle)] focus-visible:outline-none focus-visible:border-[var(--vscode-focus-border)] transition-colors"
                    value={formData.description || ''}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="用途、背景、规则、氛围等"
                  />
                </div>
              </form>
            </div>
            <div className="p-4 border-t border-[var(--vscode-sidebar-border)] bg-[var(--vscode-sidebar-bg)] flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setEditing(null)}>取消</Button>
              <Button form="world-form" type="submit">
                <Save size={16} className="mr-2" /> 保存设定
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-[var(--vscode-fg-subtle)]">
            <Globe size={64} className="mb-4 opacity-20" />
            <div className="font-serif text-lg">选择或创建设定以开始编辑</div>
          </div>
        )}
      </Card>
    </div>
  );
}
