'use client';

import React from 'react';

interface DailyStats {
  date: string;
  watchTime: number;
  plays: number;
}

interface StatsChartProps {
  dailyStats: DailyStats[];
  className?: string;
}

export default function StatsChart({ dailyStats, className = '' }: StatsChartProps) {
  if (!dailyStats.length) {
    return (
      <div className={`bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700 ${className}`}>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          近7天统计趋势
        </h3>
        <div className="flex items-center justify-center h-40 text-gray-500 dark:text-gray-400">
          暂无数据
        </div>
      </div>
    );
  }

  const maxWatchTime = Math.max(...dailyStats.map(d => d.watchTime));
  const maxPlays = Math.max(...dailyStats.map(d => d.plays));

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    if (hours > 0) {
      return `${hours}h`;
    } else {
      const minutes = Math.floor(seconds / 60);
      return `${minutes}m`;
    }
  };

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700 ${className}`}>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        近7天统计趋势
      </h3>

      <div className="space-y-6">
        {/* 观看时长图表 */}
        <div>
          <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3">
            观看时长
          </h4>
          <div className="flex items-end space-x-2 h-20">
            {dailyStats.map((stat, index) => {
              const height = maxWatchTime > 0 ? (stat.watchTime / maxWatchTime) * 100 : 0;
              return (
                <div key={index} className="flex-1 flex flex-col items-center">
                  <div className="w-full flex items-end justify-center h-16">
                    <div
                      className="w-full bg-blue-500 rounded-t-sm min-h-[2px] relative group"
                      style={{ height: `${Math.max(height, 2)}%` }}
                    >
                      <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                        {formatTime(stat.watchTime)}
                      </div>
                    </div>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {formatDate(stat.date)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 播放次数图表 */}
        <div>
          <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3">
            播放次数
          </h4>
          <div className="flex items-end space-x-2 h-20">
            {dailyStats.map((stat, index) => {
              const height = maxPlays > 0 ? (stat.plays / maxPlays) * 100 : 0;
              return (
                <div key={index} className="flex-1 flex flex-col items-center">
                  <div className="w-full flex items-end justify-center h-16">
                    <div
                      className="w-full bg-green-500 rounded-t-sm min-h-[2px] relative group"
                      style={{ height: `${Math.max(height, 2)}%` }}
                    >
                      <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                        {stat.plays}
                      </div>
                    </div>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {formatDate(stat.date)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 图例 */}
      <div className="flex items-center justify-center space-x-6 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-blue-500 rounded"></div>
          <span className="text-xs text-gray-600 dark:text-gray-400">观看时长</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-green-500 rounded"></div>
          <span className="text-xs text-gray-600 dark:text-gray-400">播放次数</span>
        </div>
      </div>
    </div>
  );
}