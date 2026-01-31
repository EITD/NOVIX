import React from 'react';
import { Card } from './ui/core';
import { X } from 'lucide-react';

/**
 * ExtractionPreview Component
 * Displays extracted entities/facts from the writing session
 */
export default function ExtractionPreview({ data, onClose }) {
  if (!data) return null;

  return (
    <Card className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Extracted Entities</h3>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <X size={20} className="text-gray-500" />
          </button>
        )}
      </div>

      <div className="space-y-3">
        {data.characters && data.characters.length > 0 && (
          <div>
            <h4 className="font-medium text-gray-700 mb-2">Characters</h4>
            <div className="space-y-1">
              {data.characters.map((char, idx) => (
                <div key={idx} className="text-sm text-gray-600 pl-4">
                  • {char}
                </div>
              ))}
            </div>
          </div>
        )}

        {data.locations && data.locations.length > 0 && (
          <div>
            <h4 className="font-medium text-gray-700 mb-2">Locations</h4>
            <div className="space-y-1">
              {data.locations.map((loc, idx) => (
                <div key={idx} className="text-sm text-gray-600 pl-4">
                  • {loc}
                </div>
              ))}
            </div>
          </div>
        )}

        {data.facts && data.facts.length > 0 && (
          <div>
            <h4 className="font-medium text-gray-700 mb-2">Key Facts</h4>
            <div className="space-y-1">
              {data.facts.map((fact, idx) => (
                <div key={idx} className="text-sm text-gray-600 pl-4">
                  • {fact}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
