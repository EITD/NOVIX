import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * cn - 类名合并工具
 * 负责组合 Tailwind 与条件类名。
 */
export function cn(...inputs) {
    return twMerge(clsx(inputs));
}


/**
 * Button - 基础按钮组件
 * 仅负责样式与交互态，不改变业务语义。
 */
export const Button = React.forwardRef(({ className, variant = 'default', size = 'default', ...props }, ref) => {
    const variants = {
        default: 'bg-[var(--vscode-list-active)] text-[var(--vscode-list-active-fg)] border border-[var(--vscode-input-border)] hover:opacity-90 shadow-none',
        ghost: 'bg-transparent text-[var(--vscode-fg)] hover:bg-[var(--vscode-list-hover)]',
        outline: 'bg-transparent border border-[var(--vscode-input-border)] text-[var(--vscode-fg)] hover:bg-[var(--vscode-list-hover)]',
        link: 'text-[var(--vscode-focus-border)] underline-offset-4 hover:underline',
    };

    const sizes = {
        default: 'h-10 px-4',
        sm: 'h-9 px-3',
        lg: 'h-11 px-6',
        icon: 'h-10 w-10',
    };

    return (
        <button
            className={cn(
                'inline-flex items-center justify-center whitespace-nowrap rounded-[4px] text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--vscode-focus-border)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none',
                variants[variant],
                sizes[size],
                className
            )}
            ref={ref}
            {...props}
        />
    );
});
Button.displayName = "Button";

/**
 * Input - 基础输入组件
 * 仅负责输入样式与焦点态。
 */
export const Input = React.forwardRef(({ className, type, ...props }, ref) => {
    return (
        <input
            type={type}
            className={cn(
                "flex h-10 w-full rounded-[4px] border border-[var(--vscode-input-border)] bg-[var(--vscode-input-bg)] px-3 text-sm text-[var(--vscode-fg)] ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-[var(--vscode-fg-subtle)] focus-visible:outline-none focus-visible:border-[var(--vscode-focus-border)] focus-visible:ring-1 focus-visible:ring-[var(--vscode-focus-border)] disabled:cursor-not-allowed disabled:opacity-50 transition-colors",
                className
            )}
            ref={ref}
            {...props}
        />
    );
});
Input.displayName = "Input";

/**
 * Card - 基础容器组件
 * 提供统一边界与背景层级。
 */
export const Card = React.forwardRef(({ className, ...props }, ref) => {
    return (
        <div
            ref={ref}
            className={cn(
                "rounded-[4px] bg-[var(--vscode-bg)] text-[var(--vscode-fg)] border border-[var(--vscode-sidebar-border)] shadow-none",
                className
            )}
            {...props}
        />
    );
});
Card.displayName = "Card";
