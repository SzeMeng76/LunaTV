'use client';

import React from 'react';
import { BarChart3, Clock, PlayCircle, TrendingUp, Users } from 'lucide-react';

interface PlayStatsCardProps {
  icon: 'users' | 'watchTime' | 'plays' | 'avgTime' | 'trend';
  title: string;
  value: string | number;
  subtitle?: string;
  className?: string;
}

const formatTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  } else if (minutes > 0) {
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  } else {
    return `${remainingSeconds}秒`;
  }
};

const formatNumber = (num: number): string => {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  } else if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
};

export default function PlayStatsCard({
  icon,
  title,
  value,
  subtitle,
  className = ''
}: PlayStatsCardProps) {
  const getIcon = () => {
    const iconProps = { className: 'w-6 h-6' };

    switch (icon) {
      case 'users':
        return <Users {...iconProps} />;
      case 'watchTime':
        return <Clock {...iconProps} />;
      case 'plays':
        return <PlayCircle {...iconProps} />;
      case 'avgTime':
        return <BarChart3 {...iconProps} />;
      case 'trend':
        return <TrendingUp {...iconProps} />;
      default:
        return <BarChart3 {...iconProps} />;
    }
  };

  const getFormattedValue = () => {
    if (typeof value === 'number') {
      if (icon === 'watchTime' || icon === 'avgTime') {
        return formatTime(value);
      } else {
        return formatNumber(value);
      }
    }
    return value;
  };

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg text-blue-600 dark:text-blue-400">
            {getIcon()}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {title}
            </p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {getFormattedValue()}
            </p>
            {subtitle && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {subtitle}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}