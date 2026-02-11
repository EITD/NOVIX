import { cn } from "../../lib/utils";
import { Loader2 } from "lucide-react";

/**
 * Button - 轻量按钮组件
 * 仅处理样式与加载态，不改变业务语义。
 */
export function Button({ className, variant = "primary", size = "default", isLoading, children, ...props }) {
  const variants = {
    primary: "bg-[var(--vscode-list-active)] text-[var(--vscode-list-active-fg)] border border-[var(--vscode-input-border)] hover:opacity-90",
    secondary: "bg-[var(--vscode-input-bg)] text-[var(--vscode-fg)] hover:bg-[var(--vscode-list-hover)] border border-[var(--vscode-input-border)]",
    outline: "bg-transparent border border-[var(--vscode-input-border)] text-[var(--vscode-fg)] hover:bg-[var(--vscode-list-hover)]",
    ghost: "bg-transparent hover:bg-[var(--vscode-list-hover)] text-[var(--vscode-fg-subtle)] hover:text-[var(--vscode-fg)]",
    destructive: "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"
  };

  const sizes = {
    sm: "h-8 px-3 text-xs",
    default: "h-10 px-4 py-2",
    lg: "h-12 px-8 text-base",
    icon: "h-10 w-10 p-0 flex items-center justify-center"
  };

  return (
    <button 
      className={cn(
        "inline-flex items-center justify-center rounded-[6px] text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--vscode-focus-border)] disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className
      )}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}
