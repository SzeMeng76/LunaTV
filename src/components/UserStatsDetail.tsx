'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Clock, PlayCircle, User } from 'lucide-react';
import { UserPlayStat, PlayRecord } from '@/lib/types';
import { ImagePlaceholder } from './ImagePlaceholder';

interface UserStatsDetailProps {
  userStats: UserPlayStat[];
  className?: string;
}

const formatTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}时${minutes}分`;
  } else if (minutes > 0) {
    return `${minutes}分钟`;
  } else {
    return `${seconds}秒`;
  }
};

const formatDate = (timestamp: number): string => {
  return new Date(timestamp).toLocaleString('zh-CN');
};

const getProgressPercentage = (playTime: number, totalTime: number): number => {
  if (totalTime === 0) return 0;
  return Math.min((playTime / totalTime) * 100, 100);
};

export default function UserStatsDetail({ userStats, className = '' }: UserStatsDetailProps) {
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());

  const toggleUserExpanded = (username: string) => {
    const newExpanded = new Set(expandedUsers);
    if (newExpanded.has(username)) {
      newExpanded.delete(username);
    } else {
      newExpanded.add(username);
    }
    setExpandedUsers(newExpanded);
  };

  if (!userStats.length) {
    return (
      <div className={`bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700 ${className}`}>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          用户详细统计
        </h3>
        <div className="text-center text-gray-500 dark:text-gray-400 py-8">
          暂无用户数据
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700 ${className}`}>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        用户详细统计 ({userStats.length} 位用户)
      </h3>

      <div className="space-y-4">
        {userStats.map((user, index) => {
          const isExpanded = expandedUsers.has(user.username);

          return (
            <div key={user.username} className="border border-gray-200 dark:border-gray-700 rounded-lg">
              {/* 用户概览 */}
              <div
                className="p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-750 flex items-center justify-between"
                onClick={() => toggleUserExpanded(user.username)}
              >
                <div className="flex items-center space-x-3">
                  <div className="flex-shrink-0">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    )}
                  </div>

                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                      <User className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    </div>

                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-medium text-gray-900 dark:text-white">
                          {user.username}
                        </span>
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          #{index + 1}
                        </span>
                      </div>

                      <div className="flex items-center space-x-4 text-sm text-gray-500 dark:text-gray-400">
                        <div className="flex items-center space-x-1">
                          <Clock className="w-3 h-3" />
                          <span>{formatTime(user.totalWatchTime)}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <PlayCircle className="w-3 h-3" />
                          <span>{user.totalPlays} 次播放</span>
                        </div>
                        {user.mostWatchedSource && (
                          <span>主要来源: {user.mostWatchedSource}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    平均观看: {formatTime(user.avgWatchTime)}
                  </div>
                  {user.lastPlayTime > 0 && (
                    <div className="text-xs text-gray-400">
                      最后活动: {formatDate(user.lastPlayTime)}
                    </div>
                  )}
                </div>
              </div>

              {/* 展开的播放记录 */}
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-gray-200 dark:border-gray-700">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 my-3">
                    最近播放记录 ({user.recentRecords.length} 条)
                  </h4>

                  {user.recentRecords.length === 0 ? (
                    <div className="text-center text-gray-500 dark:text-gray-400 py-4">
                      暂无播放记录
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {user.recentRecords.map((record, recordIndex) => {
                        const progress = getProgressPercentage(record.play_time, record.total_time);

                        return (
                          <div
                            key={recordIndex}
                            className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-gray-750 rounded-lg"
                          >
                            <div className="flex-shrink-0 w-16 h-12 bg-gray-200 dark:bg-gray-600 rounded overflow-hidden">
                              <ImagePlaceholder
                                src={record.cover}
                                alt={record.title}
                                width={64}
                                height={48}
                                className="w-full h-full object-cover"
                              />
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                    {record.title}
                                  </p>
                                  <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {record.source_name} • {record.year} • 第{record.index}集/{record.total_episodes}集
                                  </p>
                                </div>
                              </div>

                              <div className="mt-2">
                                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                                  <span>播放进度</span>
                                  <span>{progress.toFixed(1)}% • {formatTime(record.play_time)}/{formatTime(record.total_time)}</span>
                                </div>
                                <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1.5">
                                  <div
                                    className="bg-blue-500 h-1.5 rounded-full transition-all"
                                    style={{ width: `${progress}%` }}
                                  />
                                </div>
                              </div>

                              <div className="flex items-center justify-between mt-2 text-xs text-gray-400">
                                <span>保存时间: {formatDate(record.save_time)}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}