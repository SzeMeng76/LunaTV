'use client';

import { ChevronUp } from 'lucide-react';
import { useRouter } from 'next/navigation';
import React, { useCallback, useEffect, useState } from 'react';

import { getAuthInfoFromBrowserCookie } from '@/lib/auth';
import { LiveStatsResult } from '@/lib/types';

import PageLayout from '@/components/PageLayout';

const LiveStatsPage: React.FC = () => {
  const router = useRouter();
  const [statsData, setStatsData] = useState<LiveStatsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [authInfo, setAuthInfo] = useState<{
    username?: string;
    role?: string;
  } | null>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);

  // 检查用户权限
  useEffect(() => {
    const auth = getAuthInfoFromBrowserCookie();
    if (!auth || !auth.username) {
      router.push('/login');
      return;
    }

    // 检查是否为管理员
    if (auth.role !== 'admin' && auth.role !== 'owner') {
      router.push('/');
      return;
    }

    setAuthInfo(auth);
  }, [router]);

  // 时间格式化函数
  const formatTime = (seconds: number): string => {
    if (seconds === 0) return '00:00';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.round(seconds % 60);

    if (hours === 0) {
      return `${minutes.toString().padStart(2, '0')}:${remainingSeconds
        .toString()
        .padStart(2, '0')}`;
    } else {
      return `${hours.toString().padStart(2, '0')}:${minutes
        .toString()
        .padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
  };

  const formatDateTime = (timestamp: number): string => {
    if (!timestamp) return '未知时间';

    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return '时间格式错误';

    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  // 获取统计数据
  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/live-stats');

      if (response.status === 401) {
        router.push('/login');
        return;
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      setStatsData(data);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : '获取直播统计失败';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [router]);

  // 处理刷新按钮点击
  const handleRefreshClick = async () => {
    await fetchStats();
  };

  // 切换用户详情展开状态
  const toggleUserExpanded = (username: string) => {
    setExpandedUsers((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(username)) {
        newSet.delete(username);
      } else {
        newSet.add(username);
      }
      return newSet;
    });
  };

  // 检查是否支持统计
  const storageType =
    typeof window !== 'undefined' &&
    (window as Record<string, unknown>).RUNTIME_CONFIG?.STORAGE_TYPE
      ? (
          (window as Record<string, unknown>).RUNTIME_CONFIG as Record<
            string,
            unknown
          >
        ).STORAGE_TYPE
      : 'localstorage';

  useEffect(() => {
    if (authInfo) {
      fetchStats();
    }
  }, [authInfo, fetchStats]);

  // 监听滚动位置，显示/隐藏回到顶部按钮
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop =
        document.body.scrollTop || document.documentElement.scrollTop || 0;
      setShowBackToTop(scrollTop > 300);
    };

    document.body.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      document.body.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // 返回顶部功能
  const scrollToTop = () => {
    try {
      document.body.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    } catch (error) {
      document.body.scrollTop = 0;
    }
  };

  // 未授权时显示加载
  if (!authInfo) {
    return (
      <PageLayout activePath='/admin/live-stats'>
        <div className='text-center py-12'>
          <div className='inline-flex items-center space-x-2 text-gray-600 dark:text-gray-400'>
            <svg
              className='w-6 h-6 animate-spin'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth='2'
                d='M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15'
              />
            </svg>
            <span>检查权限中...</span>
          </div>
        </div>
      </PageLayout>
    );
  }

  if (loading) {
    return (
      <PageLayout activePath='/admin/live-stats'>
        <div className='text-center py-12'>
          <div className='inline-flex items-center space-x-2 text-gray-600 dark:text-gray-400'>
            <svg
              className='w-6 h-6 animate-spin'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth='2'
                d='M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15'
              />
            </svg>
            <span>正在加载直播统计...</span>
          </div>
        </div>
      </PageLayout>
    );
  }

  if (storageType === 'localstorage') {
    return (
      <PageLayout activePath='/admin/live-stats'>
        <div className='max-w-6xl mx-auto px-4 py-8'>
          <div className='mb-8'>
            <h1 className='text-3xl font-bold text-gray-900 dark:text-white'>
              直播统计
            </h1>
            <p className='text-gray-600 dark:text-gray-400 mt-2'>
              查看用户直播观看情况
            </p>
          </div>

          <div className='p-6 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800'>
            <div className='flex items-center space-x-3'>
              <div className='text-yellow-600 dark:text-yellow-400'>
                <svg
                  className='w-6 h-6'
                  fill='none'
                  stroke='currentColor'
                  viewBox='0 0 24 24'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth='2'
                    d='M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z'
                  />
                </svg>
              </div>
              <div>
                <h3 className='text-lg font-semibold text-yellow-800 dark:text-yellow-300'>
                  统计功能不可用
                </h3>
                <p className='text-yellow-700 dark:text-yellow-400 mt-1'>
                  当前使用本地存储模式（localStorage），不支持统计功能。
                  <br />
                  如需使用此功能，请配置 Redis 或 Upstash 数据库存储。
                </p>
              </div>
            </div>
          </div>
        </div>
      </PageLayout>
    );
  }

  if (!statsData) {
    return (
      <PageLayout activePath='/admin/live-stats'>
        <div className='max-w-6xl mx-auto px-4 py-8'>
          <div className='text-center py-12'>
            {error ? (
              <div className='text-red-600 dark:text-red-400'>{error}</div>
            ) : (
              <div className='text-gray-600 dark:text-gray-400'>
                加载直播统计中...
              </div>
            )}
          </div>
        </div>
      </PageLayout>
    );
  }

  // 计算每个用户观看的频道统计
  const getUserChannelStats = (username: string) => {
    const userStat = statsData.userStats.find((u) => u.username === username);
    if (!userStat || !userStat.recentRecords) return [];

    const channelMap: Record<
      string,
      { name: string; duration: number; count: number }
    > = {};

    userStat.recentRecords.forEach((record) => {
      const key = record.channelName;
      if (!channelMap[key]) {
        channelMap[key] = { name: record.channelName, duration: 0, count: 0 };
      }
      channelMap[key].duration += record.duration;
      channelMap[key].count += 1;
    });

    return Object.values(channelMap).sort((a, b) => b.duration - a.duration);
  };

  return (
    <PageLayout activePath='/admin/live-stats'>
      <div className='max-w-7xl mx-auto px-4 py-8'>
        {/* 页面标题和刷新按钮 */}
        <div className='flex justify-between items-start mb-8'>
          <div>
            <h1 className='text-3xl font-bold text-gray-900 dark:text-white'>
              直播统计
            </h1>
            <p className='text-gray-600 dark:text-gray-400 mt-2'>
              查看用户直播观看情况
            </p>
          </div>
          <button
            onClick={handleRefreshClick}
            disabled={loading}
            className='px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm rounded-lg transition-colors flex items-center space-x-2'
          >
            <svg
              className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth='2'
                d='M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15'
              />
            </svg>
            <span>{loading ? '刷新中...' : '刷新数据'}</span>
          </button>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className='mb-8 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800'>
            <div className='flex items-center space-x-3'>
              <div className='text-red-600 dark:text-red-400'>
                <svg
                  className='w-5 h-5'
                  fill='none'
                  stroke='currentColor'
                  viewBox='0 0 24 24'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth='2'
                    d='M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
                  />
                </svg>
              </div>
              <div>
                <h4 className='text-sm font-medium text-red-800 dark:text-red-300'>
                  获取统计数据失败
                </h4>
                <p className='text-red-700 dark:text-red-400 text-sm mt-1'>
                  {error}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 全站统计概览 */}
        <div className='grid grid-cols-1 md:grid-cols-3 gap-4 mb-8'>
          <div className='p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800'>
            <div className='text-2xl font-bold text-blue-800 dark:text-blue-300'>
              {statsData.totalUsers}
            </div>
            <div className='text-sm text-blue-600 dark:text-blue-400'>
              观看用户数
            </div>
          </div>
          <div className='p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800'>
            <div className='text-2xl font-bold text-green-800 dark:text-green-300'>
              {formatTime(statsData.totalWatchTime)}
            </div>
            <div className='text-sm text-green-600 dark:text-green-400'>
              总观看时长
            </div>
          </div>
          <div className='p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800'>
            <div className='text-2xl font-bold text-purple-800 dark:text-purple-300'>
              {statsData.totalViews}
            </div>
            <div className='text-sm text-purple-600 dark:text-purple-400'>
              总观看次数
            </div>
          </div>
        </div>

        {/* 用户直播观看统计 */}
        <div>
          <h3 className='text-xl font-semibold text-gray-900 dark:text-white mb-6'>
            用户直播观看统计
          </h3>
          <div className='space-y-4'>
            {statsData.userStats.map((userStat) => {
              const channelStats = getUserChannelStats(userStat.username);

              return (
                <div
                  key={userStat.username}
                  className='border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800'
                >
                  {/* 用户概览行 */}
                  <div
                    className='p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors'
                    onClick={() => toggleUserExpanded(userStat.username)}
                  >
                    <div className='flex items-center justify-between'>
                      <div className='flex items-center space-x-4'>
                        <div className='flex-shrink-0'>
                          <div className='w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center'>
                            <span className='text-sm font-medium text-blue-600 dark:text-blue-400'>
                              {userStat.username.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        </div>
                        <div>
                          <h5 className='text-sm font-medium text-gray-900 dark:text-gray-100'>
                            {userStat.username}
                          </h5>
                          <p className='text-xs text-gray-500 dark:text-gray-400'>
                            最后观看:{' '}
                            {userStat.lastViewTime
                              ? formatDateTime(userStat.lastViewTime)
                              : '从未观看'}
                          </p>
                        </div>
                      </div>
                      <div className='flex items-center space-x-6'>
                        <div className='text-right'>
                          <div className='text-sm font-medium text-gray-900 dark:text-gray-100'>
                            {formatTime(userStat.totalWatchTime)}
                          </div>
                          <div className='text-xs text-gray-500 dark:text-gray-400'>
                            总观看时长
                          </div>
                        </div>
                        <div className='text-right'>
                          <div className='text-sm font-medium text-gray-900 dark:text-gray-100'>
                            {userStat.totalViews}
                          </div>
                          <div className='text-xs text-gray-500 dark:text-gray-400'>
                            观看次数
                          </div>
                        </div>
                        <div className='flex-shrink-0'>
                          <svg
                            className={`w-5 h-5 text-gray-400 transition-transform ${
                              expandedUsers.has(userStat.username)
                                ? 'rotate-180'
                                : ''
                            }`}
                            fill='none'
                            stroke='currentColor'
                            viewBox='0 0 24 24'
                          >
                            <path
                              strokeLinecap='round'
                              strokeLinejoin='round'
                              strokeWidth='2'
                              d='M19 9l-7 7-7-7'
                            />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 展开的频道详情 */}
                  {expandedUsers.has(userStat.username) && (
                    <div className='p-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700'>
                      {channelStats.length > 0 ? (
                        <>
                          <h6 className='text-sm font-medium text-gray-700 dark:text-gray-300 mb-4'>
                            观看的频道列表
                          </h6>
                          <div className='space-y-3'>
                            {channelStats.map((channel, index) => (
                              <div
                                key={`${channel.name}-${index}`}
                                className='flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg'
                              >
                                <div className='flex items-center space-x-3'>
                                  <div className='w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center'>
                                    <svg
                                      className='w-4 h-4 text-blue-600 dark:text-blue-400'
                                      fill='none'
                                      stroke='currentColor'
                                      viewBox='0 0 24 24'
                                    >
                                      <path
                                        strokeLinecap='round'
                                        strokeLinejoin='round'
                                        strokeWidth='2'
                                        d='M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z'
                                      />
                                    </svg>
                                  </div>
                                  <div>
                                    <div className='text-sm font-medium text-gray-900 dark:text-gray-100'>
                                      {channel.name}
                                    </div>
                                    <div className='text-xs text-gray-500 dark:text-gray-400'>
                                      观看 {channel.count} 次
                                    </div>
                                  </div>
                                </div>
                                <div className='text-sm font-medium text-gray-900 dark:text-gray-100'>
                                  {formatTime(channel.duration)}
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                      ) : (
                        <div className='text-center py-8 text-gray-500 dark:text-gray-400'>
                          <svg
                            className='w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600'
                            fill='none'
                            stroke='currentColor'
                            viewBox='0 0 24 24'
                          >
                            <path
                              strokeLinecap='round'
                              strokeLinejoin='round'
                              strokeWidth='2'
                              d='M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z'
                            />
                          </svg>
                          <p>该用户暂无直播观看记录</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 返回顶部按钮 */}
      <button
        onClick={scrollToTop}
        className={`fixed bottom-20 md:bottom-6 right-6 z-[500] w-12 h-12 bg-green-500/90 hover:bg-green-500 text-white rounded-full shadow-lg backdrop-blur-sm transition-all duration-300 ease-in-out flex items-center justify-center group ${
          showBackToTop
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 translate-y-4 pointer-events-none'
        }`}
        aria-label='返回顶部'
      >
        <ChevronUp className='w-6 h-6 transition-transform group-hover:scale-110' />
      </button>
    </PageLayout>
  );
};

export default LiveStatsPage;
