import React from 'react';
import { Card } from '../ui/core';
import { Activity, Users, BookOpen, RefreshCw } from 'lucide-react';
import { Button } from '../ui/core';

/**
 * DashboardView - 项目仪表盘
 * 展示关键指标与最近事实。
 */
export function DashboardView({ dashboard, loading, error, onRefresh }) {
  const stats = dashboard?.stats || {};
  const chapters = dashboard?.chapters || [];
  const recentFacts = dashboard?.recent?.facts || [];

  if (loading) {
    return <div className="text-sm text-[var(--vscode-fg-subtle)] p-8 flex items-center gap-2"><RefreshCw className="animate-spin h-4 w-4" /> 加载系统指标中...</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-serif font-bold text-[var(--vscode-fg)]">系统状态</h2>
          <p className="text-[var(--vscode-fg-subtle)] text-sm">概览与指标</p>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh}>
          <RefreshCw className="mr-2 h-4 w-4" />
          刷新
        </Button>
      </div>

      {error && (
        <div className="p-4 rounded-[6px] border border-red-200 bg-red-50 text-red-600 text-sm font-mono">
          错误: {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          icon={<BookOpen className="text-[var(--vscode-fg-subtle)]" />}
          label="总字数"
          value={stats.total_word_count ?? '-'}
          subValue={`已完成: ${stats.completed_chapters || 0} 章`}
        />
        <StatCard
          icon={<Users className="text-blue-500" />}
          label="角色数"
          value={stats.character_count ?? '-'}
        />
        <StatCard
          icon={<Activity className="text-yellow-600" />}
          label="实体数"
          value={(stats.fact_count || 0) + (stats.timeline_event_count || 0) + (stats.character_state_count || 0)}
          subValue="事实 / 事件 / 状态"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 bg-[var(--vscode-bg)]">
          <div className="p-4 border-b border-[var(--vscode-sidebar-border)] bg-[var(--vscode-sidebar-bg)]">
            <h3 className="font-bold text-[var(--vscode-fg)] flex items-center gap-2">
              <BookOpen size={18} className="text-[var(--vscode-fg-subtle)]" /> 章节状态
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-[var(--vscode-sidebar-bg)] text-[var(--vscode-fg-subtle)] font-mono text-xs uppercase">
                <tr>
                  <th className="px-6 py-3 font-medium">章节</th>
                  <th className="px-6 py-3 font-medium">字数</th>
                  <th className="px-6 py-3 font-medium">摘要</th>
                  <th className="px-6 py-3 font-medium">冲突</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--vscode-sidebar-border)]">
                {chapters.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-[var(--vscode-fg-subtle)] font-serif italic">
                      暂无数据
                    </td>
                  </tr>
                ) : (
                  chapters.map((ch) => (
                    <tr key={ch.chapter} className="hover:bg-[var(--vscode-list-hover)] transition-colors">
                      <td className="px-6 py-4 font-bold text-[var(--vscode-fg)] font-mono">{ch.chapter}</td>
                      <td className="px-6 py-4 text-[var(--vscode-fg-subtle)] font-mono">
                        {ch.has_final ? ch.final_word_count : '-'}
                      </td>
                      <td className="px-6 py-4">
                        {ch.has_summary ? (
                          <div className="max-w-[200px]">
                            <div className="font-medium text-[var(--vscode-fg)] truncate">{ch.summary_title || ch.chapter}</div>
                          </div>
                        ) : (
                          <span className="text-[var(--vscode-fg-subtle)]">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {(ch.conflict_count || 0) > 0 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-600 border border-red-200">
                            {ch.conflict_count} 冲突
                          </span>
                        ) : (
                          <span className="text-green-600/70 text-xs font-mono font-medium">正常</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="bg-[var(--vscode-bg)]">
            <div className="p-4 border-b border-[var(--vscode-sidebar-border)] bg-[var(--vscode-sidebar-bg)]">
              <h3 className="font-bold text-[var(--vscode-fg)] flex items-center gap-2">
                <Activity size={18} className="text-[var(--vscode-fg-subtle)]" /> 近期事实
              </h3>
            </div>
            <div className="p-4 space-y-4">
              {recentFacts.length === 0 ? (
                <div className="text-sm text-[var(--vscode-fg-subtle)] font-serif italic">暂无近期事实更新</div>
              ) : (
                recentFacts.map((f, idx) => (
                  <div key={idx} className="text-sm border-l-2 border-[var(--vscode-focus-border)] pl-3 py-1">
                    <div className="font-mono text-xs font-bold text-[var(--vscode-focus-border)] mb-1">{f.id}</div>
                    <div className="text-[var(--vscode-fg)] text-sm line-clamp-2 leading-relaxed">{f.statement}</div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, subValue }) {
  return (
    <div className="bg-[var(--vscode-bg)] border border-[var(--vscode-sidebar-border)] p-6 rounded-[6px] relative overflow-hidden group transition-colors hover:bg-[var(--vscode-list-hover)]">
      <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-100 transition-opacity">
        {icon}
      </div>
      <div className="text-xs font-medium text-[var(--vscode-fg-subtle)] uppercase tracking-wider mb-2">{label}</div>
      <div className="text-3xl font-serif font-bold text-[var(--vscode-fg)]">{value}</div>
      {subValue && <div className="text-xs text-[var(--vscode-fg-subtle)] mt-2">{subValue}</div>}
    </div>
  );
}
