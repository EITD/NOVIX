/**
 * 文枢 WenShape - 深度上下文感知的智能体小说创作系统
 * WenShape - Deep Context-Aware Agent-Based Novel Writing System
 *
 * Copyright © 2025-2026 WenShape Team
 * License: PolyForm Noncommercial License 1.0.0
 *
 * 模块说明 / Module Description:
 *   卡片组件集合 - 提供卡片及其子组件（头部、标题、内容区）
 */

import { cn } from "../../lib/utils";

/**
 * 基础卡片容器 / Base Card Container
 *
 * 提供统一背景与边界的卡片容器。可与 CardHeader、CardContent 等子组件组合使用。
 *
 * @component
 * @param {Object} props - 组件 props
 * @param {string} [props.className] - 额外 CSS 类名 / Additional CSS classes
 * @param {React.ReactNode} props.children - 卡片内容 / Card content
 * @param {*} props.* - 其他 HTML div 原生属性 / Standard HTML div attributes
 * @returns {JSX.Element} 卡片容器
 *
 * @example
 * <Card>
 *   <CardHeader>
 *     <CardTitle>标题</CardTitle>
 *   </CardHeader>
 *   <CardContent>内容</CardContent>
 * </Card>
 */
export function Card({ className, children, ...props }) {
  return (
    <div className={cn("bg-[var(--vscode-bg)] text-[var(--vscode-fg)] border border-[var(--vscode-sidebar-border)] rounded-[4px] overflow-hidden", className)} {...props}>
      {children}
    </div>
  );
}


/**
 * 卡片头部 / Card Header
 *
 * 卡片的头部区域，通常包含标题。提供分隔线和不同背景色。
 *
 * @component
 * @param {Object} props - 组件 props
 * @param {string} [props.className] - 额外 CSS 类名 / Additional CSS classes
 * @param {React.ReactNode} props.children - 头部内容 / Header content
 * @param {*} props.* - 其他 HTML div 原生属性 / Standard HTML div attributes
 * @returns {JSX.Element} 卡片头部
 *
 * @example
 * <CardHeader>
 *   <CardTitle>章节管理</CardTitle>
 * </CardHeader>
 */
export function CardHeader({ className, children, ...props }) {
  return (
    <div className={cn("px-6 py-4 border-b border-[var(--vscode-sidebar-border)] bg-[var(--vscode-sidebar-bg)]", className)} {...props}>
      {children}
    </div>
  );
}

/**
 * 卡片标题 / Card Title
 *
 * 卡片标题文本，通常在 CardHeader 内使用。提供标题样式（大号、加粗）。
 *
 * @component
 * @param {Object} props - 组件 props
 * @param {string} [props.className] - 额外 CSS 类名 / Additional CSS classes
 * @param {React.ReactNode} props.children - 标题内容 / Title content
 * @param {*} props.* - 其他 HTML h3 原生属性 / Standard HTML h3 attributes
 * @returns {JSX.Element} 标题元素
 *
 * @example
 * <CardTitle>我的项目</CardTitle>
 */
export function CardTitle({ className, children, ...props }) {
  return (
    <h3 className={cn("text-lg font-bold text-[var(--vscode-fg)] tracking-tight flex items-center gap-2", className)} {...props}>
      {children}
    </h3>
  );
}

/**
 * 卡片内容区 / Card Content
 *
 * 卡片的主内容区域，提供内边距。通常包含卡片的主要信息或表单元素。
 *
 * @component
 * @param {Object} props - 组件 props
 * @param {string} [props.className] - 额外 CSS 类名 / Additional CSS classes
 * @param {React.ReactNode} props.children - 内容 / Content to display
 * @param {*} props.* - 其他 HTML div 原生属性 / Standard HTML div attributes
 * @returns {JSX.Element} 内容区容器
 *
 * @example
 * <CardContent>
 *   <p>卡片的主要内容放在这里</p>
 * </CardContent>
 */
export function CardContent({ className, children, ...props }) {
  return (
    <div className={cn("p-6", className)} {...props}>
      {children}
    </div>
  );
}
