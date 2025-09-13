'use client';

import React, { useEffect, useState } from 'react';
import { AlertCircle, BarChart3, RefreshCw } from 'lucide-react';
import PlayStatsCard from '@/components/PlayStatsCard';
import StatsChart from '@/components/StatsChart';
import TopContentList from '@/components/TopContentList';
import UserStatsDetail from '@/components/UserStatsDetail';
import { PlayStatsResult } from '@/lib/types';

interface ErrorInfo {
  error: string;
  supportedTypes?: string[];
}

export default function PlayStatsPage() {
  const [stats, setStats] = useState<PlayStatsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorInfo | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = async (showRefreshing = false) => {
    if (showRefreshing) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const response = await fetch('/api/admin/play-stats');
      const data = await response.json();

      if (!response.ok) {
        setError(data);
        setStats(null);
      } else {
        setStats(data);
        setError(null);
      }
    } catch (err) {
      console.error('获取播放统计失败:', err);
      setError({ error: '网络错误，请稍后重试' });
      setStats(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleRefresh = () => {
    fetchStats(true);
  };

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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-2 text-gray-600 dark:text-gray-400">加载中...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-8 shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="flex items-center space-x-3 text-red-600 dark:text-red-400 mb-4">
              <AlertCircle className="w-6 h-6" />
              <h2 className="text-lg font-semibold">无法加载播放统计</h2>
            </div>

            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {error.error}
            </p>

            {error.supportedTypes && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
                <h3 className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">
                  支持的存储类型:
                </h3>
                <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                  {error.supportedTypes.map((type) => (
                    <li key={type}>• {type}</li>
                  ))}
                </ul>
              </div>
            )}

            <button
              onClick={handleRefresh}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              重试
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">
            <p className="text-gray-600 dark:text-gray-400">暂无数据</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* 标题和刷新按钮 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center space-x-2">
              <BarChart3 className="w-6 h-6" />
              <span>播放统计</span>
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              全站播放数据分析与用户行为统计
            </p>
          </div>

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? '刷新中...' : '刷新数据'}</span>
          </button>
        </div>

        {/* 概览卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <PlayStatsCard
            icon="users"
            title="总用户数"
            value={stats.totalUsers}
            subtitle="注册用户总数"
          />
          <PlayStatsCard
            icon="watchTime"
            title="总观看时长"
            value={stats.totalWatchTime}
            subtitle="累计播放时间"
          />
          <PlayStatsCard
            icon="plays"
            title="总播放次数"
            value={stats.totalPlays}
            subtitle="所有播放记录"
          />
          <PlayStatsCard
            icon="avgTime"
            title="人均观看时长"
            value={Math.round(stats.avgWatchTimePerUser)}
            subtitle="平均每位用户"
          />
          <PlayStatsCard
            icon="trend"
            title="人均播放次数"
            value={Math.round(stats.avgPlaysPerUser * 10) / 10}
            subtitle="平均每位用户"
          />
        </div>

        {/* 图表和热门内容 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <StatsChart dailyStats={stats.dailyStats} />
          <TopContentList topSources={stats.topSources} />
        </div>

        {/* 用户详细统计 */}
        <UserStatsDetail userStats={stats.userStats} />

        {/* 数据说明 */}
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-2">
            数据说明
          </h3>
          <ul className="text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
            <li>• 统计数据每30分钟更新一次，可手动刷新获取最新数据</li>
            <li>• 观看时长为用户实际播放进度，不包含暂停时间</li>
            <li>• 近7天统计为简化计算，实际部署时建议实现更精确的日期统计</li>
            <li>• 仅支持 Redis、Upstash、Kvrocks 存储类型，LocalStorage 不支持统计功能</li>
          </ul>
        </div>
      </div>
    </div>
  );
}