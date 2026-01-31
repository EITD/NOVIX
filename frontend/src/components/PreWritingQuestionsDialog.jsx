import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button, Card, Input } from './ui/core';

/**
 * PreWritingQuestionsDialog
 * Shows dynamic pre-writing questions before the first draft.
 */
export default function PreWritingQuestionsDialog({ open, questions = [], onConfirm, onSkip }) {
    const [answers, setAnswers] = useState({});

    useEffect(() => {
        if (!open) return;
        const initial = {};
        questions.forEach((q) => {
            initial[q.type] = '';
        });
        setAnswers(initial);
    }, [open, questions]);

    const handleChange = (type, value) => {
        setAnswers((prev) => ({ ...prev, [type]: value }));
    };

    const handleConfirm = () => {
        if (onConfirm) {
            const payload = questions.map((q) => ({
                type: q.type,
                question: q.text,
                answer: answers[q.type] || '',
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
                        className="fixed inset-0 bg-black/60 z-40"
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.96 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4"
                    >
                        <Card className="w-full max-w-2xl p-6 space-y-5">
                            <div className="space-y-1">
                                <h2 className="text-xl font-bold text-ink-900">写作前确认</h2>
                                <p className="text-sm text-ink-500">
                                    先回答几个关键问题，帮助主笔精准开写。
                                </p>
                            </div>

                            <div className="space-y-4">
                                {questions.map((q) => (
                                    <div key={q.type} className="space-y-2">
                                        <div className="text-sm font-semibold text-ink-800">{q.text}</div>
                                        <Input
                                            value={answers[q.type] || ''}
                                            onChange={(e) => handleChange(q.type, e.target.value)}
                                            placeholder="可简要回答或留空"
                                            className="bg-surface/70"
                                        />
                                    </div>
                                ))}
                            </div>

                            <div className="flex justify-end gap-3 pt-2">
                                <Button variant="ghost" onClick={onSkip}>跳过</Button>
                                <Button onClick={handleConfirm}>开始撰写</Button>
                            </div>
                        </Card>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
