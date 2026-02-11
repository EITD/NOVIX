import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button, Card, Input } from './ui/core';

/**
 * PreWritingQuestionsDialog - 写作前问题确认
 * 在首稿开始前收集关键信息。
 */
export default function PreWritingQuestionsDialog({
    open,
    questions = [],
    onConfirm,
    onSkip,
    title = '写作前确认',
    subtitle = '先回答几个关键问题，帮助主笔精准开写。',
    confirmText = '开始撰写',
    skipText = '跳过',
}) {
    const [answers, setAnswers] = useState([]);

    useEffect(() => {
        if (!open) return;
        setAnswers((questions || []).map(() => ''));
    }, [open, questions]);

    const handleChange = (index, value) => {
        setAnswers((prev) => {
            const next = [...(prev || [])];
            next[index] = value;
            return next;
        });
    };

    const handleConfirm = () => {
        if (onConfirm) {
            const payload = questions.map((q, index) => ({
                type: q.type,
                question: q.text,
                key: q.key,
                answer: answers[index] || '',
            }));
            onConfirm(payload);
        }
    };

    return (
        <AnimatePresence>
            {open && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/30 z-40"
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.96 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 anti-theme"
                    >
                        <Card className="w-full max-w-2xl p-6 space-y-5">
                            <div className="space-y-1">
                                <h2 className="text-xl font-bold text-[var(--vscode-fg)]">{title}</h2>
                                <p className="text-sm text-[var(--vscode-fg-subtle)]">
                                    {subtitle}
                                </p>
                            </div>

                            <div className="space-y-4">
                                {questions.map((q, index) => (
                                    <div key={`${q.type || 'q'}-${index}`} className="space-y-2">
                                        <div className="text-sm font-semibold text-[var(--vscode-fg)]">{q.text}</div>
                                        {q.reason && (
                                            <div className="text-xs text-[var(--vscode-fg-subtle)]">原因：{q.reason}</div>
                                        )}
                                        <Input
                                            value={answers[index] || ''}
                                            onChange={(e) => handleChange(index, e.target.value)}
                                            placeholder="可简要回答或留空"
                                            className="bg-[var(--vscode-input-bg)]"
                                        />
                                    </div>
                                ))}
                            </div>

                            <div className="flex justify-end gap-3 pt-2">
                                <Button variant="ghost" onClick={onSkip}>{skipText}</Button>
                                <Button onClick={handleConfirm}>{confirmText}</Button>
                            </div>
                        </Card>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
