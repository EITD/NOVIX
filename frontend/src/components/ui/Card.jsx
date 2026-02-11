import { cn } from "../../lib/utils";

/**
 * Card - 基础卡片容器
 * 提供统一背景与边界层级。
 */
export function Card({ className, children, ...props }) {
  return (
    <div className={cn("bg-[var(--vscode-bg)] text-[var(--vscode-fg)] border border-[var(--vscode-sidebar-border)] rounded-[4px] overflow-hidden", className)} {...props}>
      {children}
    </div>
  );
}

/**
 * CardHeader - 卡片头部
 */
export function CardHeader({ className, children, ...props }) {
  return (
    <div className={cn("px-6 py-4 border-b border-[var(--vscode-sidebar-border)] bg-[var(--vscode-sidebar-bg)]", className)} {...props}>
      {children}
    </div>
  );
}

/**
 * CardTitle - 卡片标题
 */
export function CardTitle({ className, children, ...props }) {
  return (
    <h3 className={cn("text-lg font-bold text-[var(--vscode-fg)] tracking-tight flex items-center gap-2", className)} {...props}>
      {children}
    </h3>
  );
}

/**
 * CardContent - 卡片内容区
 */
export function CardContent({ className, children, ...props }) {
  return (
    <div className={cn("p-6", className)} {...props}>
      {children}
    </div>
  );
}
