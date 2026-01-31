import React from 'react';
import { Card } from '../ui/core';
import { Activity, Users, MapPin, Zap } from 'lucide-react';

/**
 * EntityActivityDashboard Component
 * Displays activity and statistics for entities (characters, locations, etc.)
 */
export default function EntityActivityDashboard({ data = {} }) {
  const {
    characters = [],
    locations = [],
    events = [],
    relationships = []
  } = data;

  const stats = [
    {
      label: 'Characters',
      value: characters.length,
      icon: Users,
      color: 'text-blue-600'
    },
    {
      label: 'Locations',
      value: locations.length,
      icon: MapPin,
      color: 'text-green-600'
    },
    {
      label: 'Events',
      value: events.length,
      icon: Zap,
      color: 'text-yellow-600'
    },
    {
      label: 'Relationships',
      value: relationships.length,
      icon: Activity,
      color: 'text-purple-600'
    }
  ];

  return (
    <div className="space-y-4">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        {stats.map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <Card key={idx} className="p-4 bg-white border border-gray-200 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">{stat.label}</p>
                  <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                </div>
                <Icon size={24} className={stat.color} />
              </div>
            </Card>
          );
        })}
      </div>

      {/* Characters List */}
      {characters.length > 0 && (
        <Card className="p-4 bg-white border border-gray-200 rounded-lg">
          <h3 className="font-semibold text-gray-900 mb-3">Active Characters</h3>
          <div className="space-y-2">
            {characters.slice(0, 5).map((char, idx) => (
              <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                <span className="text-sm text-gray-700">{char.name || char}</span>
                {char.mentions && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                    {char.mentions} mentions
                  </span>
                )}
              </div>
            ))}
            {characters.length > 5 && (
              <p className="text-xs text-gray-500 pt-2">
                +{characters.length - 5} more characters
              </p>
            )}
          </div>
        </Card>
      )}

      {/* Locations List */}
      {locations.length > 0 && (
        <Card className="p-4 bg-white border border-gray-200 rounded-lg">
          <h3 className="font-semibold text-gray-900 mb-3">Locations</h3>
          <div className="space-y-2">
            {locations.slice(0, 5).map((loc, idx) => (
              <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                <span className="text-sm text-gray-700">{loc.name || loc}</span>
                {loc.mentions && (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                    {loc.mentions} mentions
                  </span>
                )}
              </div>
            ))}
            {locations.length > 5 && (
              <p className="text-xs text-gray-500 pt-2">
                +{locations.length - 5} more locations
              </p>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
