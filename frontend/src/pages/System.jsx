/**
 * 文枢 WenShape - 深度上下文感知的智能体小说创作系统
 * WenShape - Deep Context-Aware Agent-Based Novel Writing System
 *
 * Copyright © 2025-2026 WenShape Team
 * License: PolyForm Noncommercial License 1.0.0
 *
 * 模块说明 / Module Description:
 *   系统设置页面 - 占位符页面，预留未来功能扩展入口
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Settings } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';

/**
 * 系统设置页 / System Settings Page
 *
 * 当前为占位符实现，用于展示系统配置相关的提示信息。
 * 不改变任何业务逻辑，仅作为 UI 框架预留。
 *
 * 未来可扩展功能：
 * - 主题切换
 * - 快捷键配置
 * - 性能优化选项
 * - 数据导出/导入
 *
 * @component
 * @returns {JSX.Element} 系统设置页面容器
 */
function System() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="anti-theme p-6 bg-[var(--vscode-bg)] text-[var(--vscode-fg)]"
    >
      <Card className="ws-paper">
        <CardHeader>
          <CardTitle>
            <Settings size={18} /> 系统
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-[var(--vscode-fg-subtle)]">
            该功能正在开发中。
          </div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="mt-4 p-4 rounded-[6px] border border-[var(--vscode-sidebar-border)] bg-[var(--vscode-sidebar-bg)]"
          >
            <div className="text-sm text-[var(--vscode-fg)] font-semibold">提示</div>
            <div className="text-sm text-[var(--vscode-fg-subtle)] mt-1">
              目前模型（LLM）配置会在页面加载时自动提示，如需手动调整，可在后续版本加入系统设置入口。
            </div>
          </motion.div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default System;
