import React, { useState, useEffect } from 'react';
import { cardsAPI } from '../../api';
import { Button, Card } from '../ui/core';
import { RefreshCw, Feather, Sparkles, Save } from 'lucide-react';

/**
 * StyleView - 文风设定视图
 * 负责文风输入与提炼操作。
 */
export function StyleView({ projectId }) {
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [formData, setFormData] = useState({
    style: ''
  });
  const [sampleText, setSampleText] = useState('');
  const styleTextareaRef = React.useRef(null);
  const sampleTextareaRef = React.useRef(null);

  const autoResizeTextarea = React.useMemo(() => {
    return (el) => {
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    };
  }, []);

  useEffect(() => {
    loadStyle();
  }, [projectId]);

  useEffect(() => {
    autoResizeTextarea(styleTextareaRef.current);
  }, [autoResizeTextarea, formData.style]);

  useEffect(() => {
    autoResizeTextarea(sampleTextareaRef.current);
  }, [autoResizeTextarea, sampleText]);

  const loadStyle = async () => {
    setLoading(true);
    try {
      const response = await cardsAPI.getStyle(projectId);
      if (response.data) {
        setFormData(response.data);
      }
    } catch (error) {
      console.error('Failed to load style:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await cardsAPI.updateStyle(projectId, { style: formData.style || '' });
      alert('文风设定更新成功');
    } catch (error) {
      alert('更新文风失败: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleExtract = async () => {
    if (!sampleText.trim()) {
      alert('请先粘贴用于提炼的文本');
      return;
    }
    setExtracting(true);
    try {
      const response = await cardsAPI.extractStyle(projectId, { content: sampleText });
      const style = response.data?.style || '';
      setFormData({ style });
      await cardsAPI.updateStyle(projectId, { style });
    } catch (error) {
      alert('提炼失败: ' + (error.response?.data?.detail || error.message));
    } finally {
      setExtracting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-140px)]">
      <div className="lg:col-span-8 lg:col-start-3 flex flex-col gap-6">
        <Card className="flex-1 flex flex-col overflow-hidden bg-[var(--vscode-bg)] shadow-none">
          <div className="p-6 border-b border-[var(--vscode-sidebar-border)] bg-[var(--vscode-sidebar-bg)] flex flex-row items-center justify-between">
            <h3 className="font-bold text-lg text-[var(--vscode-fg)] flex items-center gap-2">
              <Feather size={18} className="text-[var(--vscode-fg-subtle)]" /> 文风设定
            </h3>
            <Button variant="ghost" size="sm" onClick={loadStyle} disabled={loading}>
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-8">
            <form id="style-form" onSubmit={handleSubmit} className="space-y-6 max-w-3xl mx-auto">
              <div className="space-y-2">
                <label className="text-xs font-bold text-[var(--vscode-fg-subtle)] uppercase">文风</label>
                <textarea
                  ref={styleTextareaRef}
                  value={formData.style || ''}
                  onChange={(e) => {
                    setFormData({ style: e.target.value });
                    autoResizeTextarea(e.target);
                  }}
                  className="w-full min-h-[220px] text-sm bg-[var(--vscode-input-bg)] border border-[var(--vscode-input-border)] rounded-[6px] px-3 py-2 text-[var(--vscode-fg)] focus:outline-none focus:border-[var(--vscode-focus-border)] resize-none overflow-hidden"
                  placeholder="写作风格、叙事视角、节奏、用词、氛围等"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[var(--vscode-fg-subtle)] uppercase">AI 文风提炼</label>
                  <Button type="button" variant="ghost" size="sm" onClick={handleExtract} disabled={extracting}>
                    <Sparkles size={16} className={extracting ? 'animate-pulse' : ''} />
                    <span className="ml-2">{extracting ? '提炼中...' : '提炼并覆盖'}</span>
                  </Button>
                </div>
                <textarea
                  ref={sampleTextareaRef}
                  value={sampleText}
                  onChange={(e) => {
                    setSampleText(e.target.value);
                    autoResizeTextarea(e.target);
                  }}
                  className="w-full min-h-[160px] text-sm bg-[var(--vscode-input-bg)] border border-[var(--vscode-input-border)] rounded-[6px] px-3 py-2 text-[var(--vscode-fg)] focus:outline-none focus:border-[var(--vscode-focus-border)] resize-none overflow-hidden"
                  placeholder="粘贴你喜欢的文本片段，点击提炼生成文风"
                />
              </div>
            </form>
          </div>
          <div className="p-4 border-t border-[var(--vscode-sidebar-border)] bg-[var(--vscode-sidebar-bg)] flex justify-end">
            <Button form="style-form" type="submit" disabled={loading} className="w-full md:w-auto">
              <Save size={16} className="mr-2" /> 保存文风设定
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
