import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from './ui/core';
import { X } from 'lucide-react';

/**
 * AskUserDialog - 用户确认弹窗
 * 用于写作过程中的问题确认与选项选择。
 */
export default function AskUserDialog({
  isOpen,
  title,
  message,
  options = [],
  onConfirm,
  onCancel
}) {
  const [selectedOption, setSelectedOption] = useState(null);

  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm(selectedOption);
    }
    setSelectedOption(null);
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
    setSelectedOption(null);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 背景遮罩 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleCancel}
            className="fixed inset-0 bg-black bg-opacity-50 z-40"
          />

          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 flex items-center justify-center z-50 p-4 anti-theme"
          >
            <div className="bg-[var(--vscode-bg)] text-[var(--vscode-fg)] border border-[var(--vscode-sidebar-border)] rounded-[6px] shadow-none max-w-md w-full">
              {/* 头部 */}
              <div className="flex justify-between items-center p-6 border-b border-[var(--vscode-sidebar-border)] bg-[var(--vscode-sidebar-bg)]">
                <h2 className="text-lg font-semibold text-[var(--vscode-fg)]">{title}</h2>
                <button
                  onClick={handleCancel}
                  className="p-1 hover:bg-[var(--vscode-list-hover)] rounded-[6px]"
                >
                  <X size={20} className="text-[var(--vscode-fg-subtle)]" />
                </button>
              </div>

              {/* 内容 */}
              <div className="p-6">
                <p className="text-[var(--vscode-fg)] mb-6">{message}</p>

                {options.length > 0 && (
                  <div className="space-y-2 mb-6">
                    {options.map((option, idx) => (
                      <label key={idx} className="flex items-center p-3 border border-[var(--vscode-sidebar-border)] rounded-[6px] cursor-pointer hover:bg-[var(--vscode-list-hover)]">
                        <input
                          type="radio"
                          name="option"
                          value={option.value || option}
                          checked={selectedOption === (option.value || option)}
                          onChange={(e) => setSelectedOption(e.target.value)}
                          className="mr-3"
                        />
                        <span className="text-[var(--vscode-fg)]">
                          {option.label || option}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* 底部 */}
              <div className="flex justify-end gap-3 p-6 border-t border-[var(--vscode-sidebar-border)] bg-[var(--vscode-sidebar-bg)]">
                <Button
                  variant="ghost"
                  onClick={handleCancel}
                >
                  取消
                </Button>
                <Button
                  onClick={handleConfirm}
                  disabled={options.length > 0 && !selectedOption}
                >
                  确认
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
