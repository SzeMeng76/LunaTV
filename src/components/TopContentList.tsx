'use client';

import React from 'react';

interface TopSource {
  source: string;
  count: number;
}

interface TopContentListProps {
  topSources: TopSource[];
  className?: string;
}

export default function TopContentList({ topSources, className = '' }: TopContentListProps) {
  if (!topSources.length) {
    return (
      <div className={`bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700 ${className}`}>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          热门来源
        </h3>
        <div className="text-center text-gray-500 dark:text-gray-400 py-8">
          暂无数据
        </div>
      </div>
    );
  }

  const maxCount = Math.max(...topSources.map(item => item.count));

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700 ${className}`}>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        热门来源 (Top {topSources.length})
      </h3>

      <div className="space-y-4">
        {topSources.map((item, index) => {
          const percentage = maxCount > 0 ? (item.count / maxCount) * 100 : 0;

          return (
            <div key={index} className="flex items-center space-x-3">
              <div className="flex-shrink-0 w-6 text-center">
                <span className={`text-sm font-medium ${
                  index === 0 ? 'text-yellow-600' :
                  index === 1 ? 'text-gray-500' :
                  index === 2 ? 'text-amber-600' : 'text-gray-400'
                }`}>
                  #{index + 1}
                </span>
              </div>

              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {item.source}
                  </span>
                  <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">
                    {item.count}
                  </span>
                </div>

                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-300 ${
                      index === 0 ? 'bg-yellow-500' :
                      index === 1 ? 'bg-gray-400' :
                      index === 2 ? 'bg-amber-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {topSources.length === 0 && (
        <div className="text-center py-8">
          <div className="text-gray-400 dark:text-gray-600 mb-2">
            📊
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            还没有播放数据
          </p>
        </div>
      )}
    </div>
  );
}