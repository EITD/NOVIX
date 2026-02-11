import React from 'react';

/**
 * ErrorBoundary - 错误边界组件
 * 捕获 React 组件错误并显示备用界面。
 */
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null
        };
    }

    static getDerivedStateFromError(error) {
        // 更新状态以展示降级界面
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        // 记录错误详情
        console.error('[ErrorBoundary] Component error:', error, errorInfo);

        this.setState({
            error,
            errorInfo
        });

        // 可选：上报监控服务（如 Sentry）
        // reportErrorToService(error, errorInfo);
    }

    handleReload = () => {
        window.location.reload();
    };

    handleReset = () => {
        this.setState({
            hasError: false,
            error: null,
            errorInfo: null
        });
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-[var(--vscode-bg)] p-4 text-[var(--vscode-fg)]">
                    <div className="max-w-md w-full bg-[var(--vscode-bg)] rounded-[6px] shadow-none border border-[var(--vscode-sidebar-border)] p-8 text-center">
                        <div className="mb-6">
                            <div className="w-16 h-16 mx-auto bg-red-50 rounded-full flex items-center justify-center mb-4 border border-red-100">
                                <svg
                                    className="w-8 h-8 text-red-600"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                                    />
                                </svg>
                            </div>
                            <h1 className="text-2xl font-bold text-[var(--vscode-fg)] mb-2">
                                抱歉，出现了错误
                            </h1>
                            <p className="text-[var(--vscode-fg-subtle)] text-sm mb-4">
                                应用遇到了意外问题。请尝试刷新页面。
                            </p>
                        </div>

                        {/* 开发环境：展示错误详情 */}
                        {process.env.NODE_ENV === 'development' && this.state.error && (
                            <details className="mb-6 text-left">
                                <summary className="cursor-pointer text-sm font-medium text-[var(--vscode-fg)] hover:text-[var(--vscode-fg)] mb-2">
                                    查看详细信息
                                </summary>
                                <div className="bg-[var(--vscode-input-bg)] rounded-[6px] p-3 text-xs font-mono text-[var(--vscode-fg)] overflow-auto max-h-40 border border-[var(--vscode-sidebar-border)]">
                                    <p className="font-bold mb-1">错误：</p>
                                    <p className="mb-2">{this.state.error.toString()}</p>
                                    {this.state.errorInfo && (
                                        <>
                                            <p className="font-bold mb-1">堆栈：</p>
                                            <pre className="whitespace-pre-wrap">
                                                {this.state.errorInfo.componentStack}
                                            </pre>
                                        </>
                                    )}
                                </div>
                            </details>
                        )}

                        <div className="flex gap-3 justify-center">
                            <button
                                onClick={this.handleReset}
                                className="px-4 py-2 bg-[var(--vscode-list-hover)] hover:opacity-90 text-[var(--vscode-fg)] rounded-[6px] transition-colors text-sm font-medium"
                            >
                                尝试恢复
                            </button>
                            <button
                                onClick={this.handleReload}
                                className="px-4 py-2 bg-[var(--vscode-list-active)] hover:opacity-90 text-[var(--vscode-list-active-fg)] rounded-[6px] transition-colors text-sm font-medium"
                            >
                                刷新页面
                            </button>
                        </div>

                        <p className="mt-6 text-xs text-[var(--vscode-fg-subtle)]">
                            如果问题持续出现，请联系技术支持
                        </p>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
