/**
 * DiffViewer Component / 智能 Diff 查看器
 * 
 * 展示 Editor Agent 的修改，支持高亮和结构化对比
 * Visualizes changes made by Editor Agent with highlighting
 */

import React from 'react';
import { motion } from 'framer-motion';

const DiffViewer = ({
    original = "",
    modified = "",
    diffs = [], // [{ type: 'add'|'remove'|'change', line: 10, content: '...' }]
    filename = "draft.md"
}) => {
    return (
        <div style={{
            backgroundColor: '#1a1a2e',
            borderRadius: '12px',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            border: '1px solid rgba(255,255,255,0.1)'
        }}>
            {/* 标题栏 */}
            <div style={{
                padding: '10px 15px',
                backgroundColor: 'rgba(255,255,255,0.05)',
                borderBottom: '1px solid rgba(255,255,255,0.1)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#e5e7eb' }}>
                        📝 Diff: {filename}
                    </span>
                </div>

                <div style={{ display: 'flex', gap: '15px', fontSize: '12px' }}>
                    <span style={{ color: '#ef4444' }}>- 删除</span>
                    <span style={{ color: '#10b981' }}>+ 新增</span>
                </div>
            </div>

            {/* Diff 内容 */}
            <div style={{
                flex: 1,
                overflow: 'auto',
                padding: '15px',
                fontFamily: 'monospace',
                fontSize: '13px',
                lineHeight: '1.6',
                backgroundColor: '#0f172a'
            }}>
                {/* 如果提供了结构化的 diffs 列表 */}
                {diffs.length > 0 ? (
                    diffs.map((diff, idx) => (
                        <DiffChange key={idx} diff={diff} />
                    ))
                ) : (
                    // 否则简单的并排对比（简化版）
                    <SimpleDiff original={original} modified={modified} />
                )}
            </div>
        </div>
    );
};

// 单个变更项
const DiffChange = ({ diff }) => {
    const { type, content, line } = diff;

    let bgColor = 'transparent';
    let textColor = '#d1d5db';
    let indicator = ' ';

    if (type === 'add') {
        bgColor = 'rgba(16, 185, 129, 0.15)';
        textColor = '#a7f3d0';
        indicator = '+';
    } else if (type === 'remove') {
        bgColor = 'rgba(239, 68, 68, 0.15)';
        textColor = '#fca5a5';
        indicator = '-';
    }

    return (
        <div style={{
            display: 'flex',
            backgroundColor: bgColor,
            borderLeft: type === 'add' ? '3px solid #10b981' : type === 'remove' ? '3px solid #ef4444' : '3px solid transparent'
        }}>
            <div style={{
                width: '30px',
                textAlign: 'right',
                paddingRight: '10px',
                color: '#6b7280',
                userSelect: 'none'
            }}>
                {line}
            </div>
            <div style={{
                width: '20px',
                color: textColor,
                userSelect: 'none'
            }}>
                {indicator}
            </div>
            <div style={{
                flex: 1,
                color: textColor,
                whiteSpace: 'pre-wrap'
            }}>
                {content}
            </div>
        </div>
    );
};

// 简化的文本对比实现
const SimpleDiff = ({ original, modified }) => {
    // 这里仅作示意，实际应使用 diff 库如 diff-match-patch
    // 简单显示修改后的内容
    return (
        <div style={{ color: '#d1d5db' }}>
            {modified || original || "无内容"}
        </div>
    );
};

export default DiffViewer;
