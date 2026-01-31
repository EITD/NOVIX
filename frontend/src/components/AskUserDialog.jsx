import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from './ui/core';
import { X } from 'lucide-react';

/**
 * AskUserDialog Component
 * Modal dialog for asking user questions during writing session
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
          {/* Backdrop */}
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
            className="fixed inset-0 flex items-center justify-center z-50 p-4"
          >
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
              {/* Header */}
              <div className="flex justify-between items-center p-6 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
                <button
                  onClick={handleCancel}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <X size={20} className="text-gray-500" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6">
                <p className="text-gray-700 mb-6">{message}</p>

                {options.length > 0 && (
                  <div className="space-y-2 mb-6">
                    {options.map((option, idx) => (
                      <label key={idx} className="flex items-center p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                        <input
                          type="radio"
                          name="option"
                          value={option.value || option}
                          checked={selectedOption === (option.value || option)}
                          onChange={(e) => setSelectedOption(e.target.value)}
                          className="mr-3"
                        />
                        <span className="text-gray-700">
                          {option.label || option}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-3 p-6 border-t border-gray-200">
                <Button
                  variant="outline"
                  onClick={handleCancel}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleConfirm}
                  disabled={options.length > 0 && !selectedOption}
                >
                  Confirm
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
