import { cn } from "../../lib/utils";

/**
 * Badge - 轻量徽标
 * 用于状态或分类提示。
 */
export function Badge({ className, variant = "default", children, ...props }) {
  const variants = {
    default: "bg-[var(--vscode-list-hover)] text-[var(--vscode-fg)] border-[var(--vscode-sidebar-border)]",
    secondary: "bg-[var(--vscode-input-bg)] text-[var(--vscode-fg-subtle)] border-[var(--vscode-input-border)]",
    outline: "text-[var(--vscode-fg)] border-[var(--vscode-input-border)]",
    destructive: "bg-red-50 text-red-600 border-red-200",
  };

  return (
    <div className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-1 focus:ring-[var(--vscode-focus-border)] focus:ring-offset-2", variants[variant], className)} {...props}>
      {children}
    </div>
  );
}
