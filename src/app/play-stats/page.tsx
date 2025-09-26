'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import React, { useCallback, useEffect, useState } from 'react';
import { ChevronUp } from 'lucide-react';

import { getAuthInfoFromBrowserCookie } from '@/lib/auth';
import { PlayRecord, ReleaseCalendarItem } from '@/lib/types';
import {
  getCachedWatchingUpdates,
  getDetailedWatchingUpdates,
  checkWatchingUpdates,
  markUpdatesAsViewed,
  type WatchingUpdate,
} from '@/lib/watching-updates';

import PageLayout from '@/components/PageLayout';
import VideoCard from '@/components/VideoCard';

import { PlayStatsResult } from '@/app/api/admin/play-stats/route';

const PlayStatsPage: React.FC = () => {
  const router = useRouter();
  const [statsData, setStatsData] = useState<PlayStatsResult | null>(null);
  const [userStats, setUserStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [authInfo, setAuthInfo] = useState<{ username?: string; role?: string } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [watchingUpdates, setWatchingUpdates] = useState<WatchingUpdate | null>(null);
  const [showWatchingUpdates, setShowWatchingUpdates] = useState(false);
  const [activeTab, setActiveTab] = useState<'admin' | 'personal'>('admin'); // 新增Tab状态
  const [upcomingReleases, setUpcomingReleases] = useState<ReleaseCalendarItem[]>([]);
  const [upcomingLoading, setUpcomingLoading] = useState(false);
  const [upcomingInitialized, setUpcomingInitialized] = useState(false);

  // 检查用户权限
  useEffect(() => {
    const auth = getAuthInfoFromBrowserCookie();
    if (!auth || !auth.username) {
      router.push('/login');
      return;
    }

    setAuthInfo(auth);
    const adminRole = auth.role === 'admin' || auth.role === 'owner';
    setIsAdmin(adminRole);
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

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
    });
  };

  // 获取管理员统计数据
  const fetchAdminStats = useCallback(async () => {
    try {
      console.log('开始获取管理员统计数据...');
      const response = await fetch('/api/admin/play-stats');

      if (response.status === 401) {
        router.push('/login');
        return;
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log('管理员统计数据获取成功:', data);
      setStatsData(data);
    } catch (err) {
      console.error('获取管理员统计数据失败:', err);
      const errorMessage =
        err instanceof Error ? err.message : '获取播放统计失败';
      setError(errorMessage);
    }
  }, [router]);

  // 获取用户个人统计数据
  const fetchUserStats = useCallback(async () => {
    try {
      console.log('开始获取用户个人统计数据...');
      const response = await fetch('/api/user/my-stats');

      if (response.status === 401) {
        router.push('/login');
        return;
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log('用户个人统计数据获取成功:', data);
      console.log('个人统计中的注册天数:', data.registrationDays);
      console.log('个人统计中的登录天数:', data.loginDays);
      setUserStats(data);
    } catch (err) {
      console.error('获取用户个人统计数据失败:', err);
      const errorMessage =
        err instanceof Error ? err.message : '获取个人统计失败';
      setError(errorMessage);
    }
  }, [router]);

  // 根据用户角色获取数据
  const fetchStats = useCallback(async () => {
    console.log('fetchStats 被调用, isAdmin:', isAdmin);
    setLoading(true);
    setError(null);

    if (isAdmin) {
      console.log('管理员模式，同时获取全站统计和个人统计');
      // 管理员同时获取全站统计和个人统计
      await Promise.all([fetchAdminStats(), fetchUserStats()]);
    } else {
      console.log('普通用户模式，只获取个人统计');
      // 普通用户只获取个人统计
      await fetchUserStats();
    }

    setLoading(false);
    console.log('fetchStats 完成');
  }, [isAdmin, fetchAdminStats, fetchUserStats]);

  // 清理过期缓存
  const cleanExpiredCache = useCallback(() => {
    const CACHE_DURATION = 2 * 60 * 60 * 1000; // 2小时
    const now = Date.now();

    // 检查即将上映缓存
    const cacheTimeKey = 'upcoming_releases_cache_time';
    const cachedTime = localStorage.getItem(cacheTimeKey);

    if (cachedTime) {
      const age = now - parseInt(cachedTime);
      if (age >= CACHE_DURATION) {
        localStorage.removeItem('upcoming_releases_cache');
        localStorage.removeItem(cacheTimeKey);
        console.log('已清理过期的即将上映缓存');
      }
    }

    // 清理其他可能过期的缓存项
    const keysToCheck = [
      'moontv_watching_updates',
      'moontv_last_update_check',
      'release_calendar_all_data',
      'release_calendar_all_data_time'
    ];

    // 检查追番更新缓存（这个有不同的过期时间）
    const watchingUpdateTime = localStorage.getItem('moontv_last_update_check');
    if (watchingUpdateTime) {
      const WATCHING_CACHE_DURATION = 30 * 60 * 1000; // 30分钟
      const age = now - parseInt(watchingUpdateTime);
      if (age >= WATCHING_CACHE_DURATION) {
        localStorage.removeItem('moontv_watching_updates');
        localStorage.removeItem('moontv_last_update_check');
        console.log('已清理过期的追番更新缓存');
      }
    }

    // 检查发布日历缓存
    keysToCheck.forEach(key => {
      if (key.endsWith('_time')) {
        const timeStr = localStorage.getItem(key);
        if (timeStr) {
          const age = now - parseInt(timeStr);
          if (age >= CACHE_DURATION) {
            const dataKey = key.replace('_time', '');
            localStorage.removeItem(dataKey);
            localStorage.removeItem(key);
            console.log(`已清理过期缓存: ${dataKey}`);
          }
        }
      }
    });
  }, []);

  // 获取即将上映的内容
  const fetchUpcomingReleases = useCallback(async () => {
    try {
      setUpcomingLoading(true);

      // 清理过期缓存
      cleanExpiredCache();

      // 检查本地缓存（2小时缓存）
      const cacheKey = 'upcoming_releases_cache';
      const cacheTimeKey = 'upcoming_releases_cache_time';
      const CACHE_DURATION = 2 * 60 * 60 * 1000; // 2小时

      const cachedData = localStorage.getItem(cacheKey);
      const cachedTime = localStorage.getItem(cacheTimeKey);

      if (cachedData && cachedTime) {
        const age = Date.now() - parseInt(cachedTime);
        if (age < CACHE_DURATION) {
          console.log('使用缓存的即将上映数据，缓存年龄:', Math.round(age / 1000 / 60), '分钟');
          setUpcomingReleases(JSON.parse(cachedData));
          setUpcomingLoading(false);
          setUpcomingInitialized(true); // 标记已经初始化完成
          return;
        }
      }

      // 获取未来2周的发布内容，包含更多电影
      const today = new Date();
      const twoWeeks = new Date(today);
      twoWeeks.setDate(today.getDate() + 14);

      const response = await fetch(
        `/api/release-calendar?dateFrom=${today.toISOString().split('T')[0]}&dateTo=${twoWeeks.toISOString().split('T')[0]}`
      );

      if (response.ok) {
        const data = await response.json();
        const items = data.items || [];
        setUpcomingReleases(items);

        // 缓存数据
        localStorage.setItem(cacheKey, JSON.stringify(items));
        localStorage.setItem(cacheTimeKey, Date.now().toString());

        console.log('获取即将上映内容成功:', items.length, '(从服务器)');
      } else {
        console.error('获取即将上映内容失败:', response.status);
        // API失败时设置空数组，确保UI仍然显示
        setUpcomingReleases([]);
      }
    } catch (error) {
      console.error('获取即将上映内容失败:', error);
      // 网络错误时设置空数组，确保UI仍然显示
      setUpcomingReleases([]);
    } finally {
      setUpcomingLoading(false);
      setUpcomingInitialized(true); // 标记已经初始化完成
    }
  }, [cleanExpiredCache]);

  // 处理刷新按钮点击
  const handleRefreshClick = async () => {
    console.log('刷新按钮被点击');
    setLoading(true);

    try {
      // 清除追番更新缓存
      localStorage.removeItem('moontv_watching_updates');
      localStorage.removeItem('moontv_last_update_check');

      // 清除即将上映缓存
      localStorage.removeItem('upcoming_releases_cache');
      localStorage.removeItem('upcoming_releases_cache_time');

      console.log('已清除所有缓存');

      // 重新检查追番更新
      await checkWatchingUpdates();
      console.log('已重新检查追番更新');

      // 重新获取统计数据
      await fetchStats();
      console.log('已重新获取统计数据');

      // 重新获取 watchingUpdates
      const details = getDetailedWatchingUpdates();
      setWatchingUpdates(details);

      // 重新获取即将上映内容
      await fetchUpcomingReleases();
      console.log('已重新获取即将上映内容');

    } catch (error) {
      console.error('刷新数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 切换用户详情展开状态（仅管理员）
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

  // 获取进度百分比
  const getProgressPercentage = (
    playTime: number,
    totalTime: number
  ): number => {
    if (!totalTime || totalTime === 0) return 0;
    return Math.min(Math.round((playTime / totalTime) * 100), 100);
  };

  // 跳转到播放页面
  const handlePlayRecord = (record: PlayRecord) => {
    const searchTitle = record.search_title || record.title;
    const params = new URLSearchParams({
      title: record.title,
      year: record.year,
      stitle: searchTitle,
      stype: record.total_episodes > 1 ? 'tv' : 'movie',
    });

    router.push(`/play?${params.toString()}`);
  };

  // 检查是否支持播放统计
  const storageType =
    typeof window !== 'undefined' && (window as any).RUNTIME_CONFIG?.STORAGE_TYPE
      ? (window as any).RUNTIME_CONFIG.STORAGE_TYPE
      : 'localstorage';

  useEffect(() => {
    if (authInfo) {
      fetchStats();
    }
  }, [authInfo, fetchStats]);

  // 获取即将上映内容
  useEffect(() => {
    if (authInfo) {
      fetchUpcomingReleases();
    }
  }, [authInfo, fetchUpcomingReleases]);

  // 追番更新检查
  useEffect(() => {
    if (authInfo) {
      const checkUpdates = async () => {
        const cached = getCachedWatchingUpdates();
        if (cached) {
          const details = getDetailedWatchingUpdates();
          setWatchingUpdates(details);
        } else {
          await checkWatchingUpdates();
          const details = getDetailedWatchingUpdates();
          setWatchingUpdates(details);
        }
      };

      checkUpdates();

      // 监听播放记录更新事件（修复删除记录后页面不立即更新的问题）
      const handlePlayRecordsUpdate = () => {
        console.log('播放记录更新，重新检查 watchingUpdates');
        // 强制清除缓存，确保立即更新
        localStorage.removeItem('moontv_watching_updates');
        localStorage.removeItem('moontv_last_update_check');
        // 重新检查追番更新状态
        checkWatchingUpdates().then(() => {
          const details = getDetailedWatchingUpdates();
          setWatchingUpdates(details);
          console.log('watchingUpdates 已更新:', details);
        });
      };

      // 监听播放记录更新事件
      window.addEventListener('playRecordsUpdated', handlePlayRecordsUpdate);

      return () => {
        window.removeEventListener('playRecordsUpdated', handlePlayRecordsUpdate);
      };
    }
  }, [authInfo]);

  // 处理追番更新卡片点击
  const handleWatchingUpdatesClick = () => {
    console.log('点击追番卡片，watchingUpdates:', watchingUpdates);
    console.log('updatedCount:', watchingUpdates?.updatedCount);
    console.log('continueWatchingCount:', watchingUpdates?.continueWatchingCount);

    if (watchingUpdates && ((watchingUpdates.updatedCount || 0) > 0 || (watchingUpdates.continueWatchingCount || 0) > 0)) {
      console.log('条件满足，显示弹窗');
      setShowWatchingUpdates(true);
      console.log('setShowWatchingUpdates(true) 已调用');

      // 强制刷新状态
      setTimeout(() => {
        setShowWatchingUpdates(prev => {
          console.log('强制状态更新，当前值:', prev);
          return true;
        });
      }, 100);
    } else {
      console.log('条件不满足，不显示弹窗');
    }
  };

  // 测试函数：强制显示弹窗
  const forceShowPopup = () => {
    console.log('强制显示弹窗');
    setShowWatchingUpdates(true);
  };

  // 关闭追番更新详情
  const handleCloseWatchingUpdates = () => {
    setShowWatchingUpdates(false);
    markUpdatesAsViewed();
    setWatchingUpdates(prev => prev ? { ...prev, hasUpdates: false, updatedCount: 0, continueWatchingCount: 0 } : null);
  };

  // 格式化更新时间
  const formatLastUpdate = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / (1000 * 60));

    if (minutes < 1) return '刚刚更新';
    if (minutes < 60) return `${minutes}分钟前`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}小时前`;

    const days = Math.floor(hours / 24);
    return `${days}天前`;
  };

  // 监听滚动位置，显示/隐藏回到顶部按钮
  useEffect(() => {
    // 获取滚动位置的函数
    const getScrollTop = () => {
      return document.body.scrollTop || document.documentElement.scrollTop || 0;
    };

    // 滚动事件处理
    const handleScroll = () => {
      const scrollTop = getScrollTop();
      setShowBackToTop(scrollTop > 300);
    };

    // 监听 body 元素的滚动事件（参考搜索页面的实现方式）
    document.body.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      document.body.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // 返回顶部功能
  const scrollToTop = () => {
    try {
      // 根据搜索页面的调试结果，真正的滚动容器是 document.body
      document.body.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    } catch (error) {
      // 如果平滑滚动完全失败，使用立即滚动
      document.body.scrollTop = 0;
    }
  };

  // 未授权时显示加载
  if (!authInfo) {
    return (
      <PageLayout activePath="/play-stats">
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
      <PageLayout activePath="/play-stats">
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
            <span>正在加载{isAdmin ? '播放统计' : '个人统计'}...</span>
          </div>
        </div>
      </PageLayout>
    );
  }

  if (storageType === 'localstorage') {
    return (
      <PageLayout activePath="/play-stats">
        <div className='max-w-6xl mx-auto px-4 py-8'>
          <div className='mb-8'>
            <h1 className='text-3xl font-bold text-gray-900 dark:text-white'>
              {isAdmin ? '播放统计' : '个人统计'}
            </h1>
            <p className='text-gray-600 dark:text-gray-400 mt-2'>
              {isAdmin ? '查看用户播放数据和趋势分析' : '查看您的个人播放记录和统计'}
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

  // 管理员统计页面渲染
  if (isAdmin && statsData && userStats) {
    return (
      <PageLayout activePath="/play-stats">
        <div className='max-w-7xl mx-auto px-4 py-8'>
          {/* 页面标题和描述 */}
          <div className='mb-6'>
            <h1 className='text-3xl font-bold text-gray-900 dark:text-white'>
              播放统计
            </h1>
            <p className='text-gray-600 dark:text-gray-400 mt-2'>
              {activeTab === 'admin' ? '查看全站播放数据和趋势分析' : '查看您的个人播放记录和统计'}
            </p>
          </div>

          {/* Tab切换和刷新按钮 */}
          <div className='flex justify-between items-end mb-8'>
            {/* Tab 切换 */}
            <div className='border-b border-gray-200 dark:border-gray-700'>
              <nav className='-mb-px flex space-x-8'>
                <button
                  onClick={() => setActiveTab('admin')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'admin'
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                  }`}
                >
                  全站统计
                </button>
                <button
                  onClick={() => setActiveTab('personal')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'personal'
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                  }`}
                >
                  我的统计
                </button>
              </nav>
            </div>

            {/* 刷新按钮 */}
            <button
              onClick={handleRefreshClick}
              disabled={loading}
              className='px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm rounded-lg transition-colors flex items-center space-x-2 mb-0.5'
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

          {/* Tab 内容 */}
          {activeTab === 'admin' ? (
            /* 全站统计内容 */
            <>
              {/* 全站统计概览 */}
              <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-4 mb-8'>
                <div className='p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800'>
                  <div className='text-2xl font-bold text-blue-800 dark:text-blue-300'>
                    {statsData.totalUsers}
                  </div>
                  <div className='text-sm text-blue-600 dark:text-blue-400'>
                    总用户数
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
                    {statsData.totalPlays}
                  </div>
                  <div className='text-sm text-purple-600 dark:text-purple-400'>
                    总播放次数
                  </div>
                </div>
                <div className='p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800'>
                  <div className='text-2xl font-bold text-orange-800 dark:text-orange-300'>
                    {formatTime(statsData.avgWatchTimePerUser)}
                  </div>
                  <div className='text-sm text-orange-600 dark:text-orange-400'>
                    人均观看时长
                  </div>
                </div>
                <div className='p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-800'>
                  <div className='text-2xl font-bold text-indigo-800 dark:text-indigo-300'>
                    {Math.round(statsData.avgPlaysPerUser)}
                  </div>
                  <div className='text-sm text-indigo-600 dark:text-indigo-400'>
                    人均播放次数
                  </div>
                </div>
                <div className='p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800'>
                  <div className='text-2xl font-bold text-red-800 dark:text-red-300'>
                    {statsData.registrationStats.todayNewUsers}
                  </div>
                  <div className='text-sm text-red-600 dark:text-red-400'>
                    今日新增用户
                  </div>
                </div>
                <div className='p-4 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg border border-cyan-200 dark:border-cyan-800'>
                  <div className='text-2xl font-bold text-cyan-800 dark:text-cyan-300'>
                    {statsData.activeUsers.daily}
                  </div>
                  <div className='text-sm text-cyan-600 dark:text-cyan-400'>
                    日活跃用户
                  </div>
                </div>
              </div>

              {/* 图表区域 */}
              <div className='grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 mb-8'>
                {/* 近7天播放趋势 */}
                <div className='p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700'>
                  <h3 className='text-lg font-semibold text-gray-900 dark:text-white mb-4'>
                    近7天播放趋势
                  </h3>
                  <div className='space-y-3'>
                    {statsData.dailyStats.map((stat) => (
                      <div key={stat.date} className='flex items-center justify-between'>
                        <span className='text-sm text-gray-600 dark:text-gray-400'>
                          {formatDate(stat.date)}
                        </span>
                        <div className='flex items-center space-x-4 text-sm'>
                          <span className='text-green-600 dark:text-green-400'>
                            {formatTime(stat.watchTime)}
                          </span>
                          <span className='text-purple-600 dark:text-purple-400'>
                            {stat.plays}次
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 近7天注册趋势 */}
                <div className='p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700'>
                  <h3 className='text-lg font-semibold text-gray-900 dark:text-white mb-4'>
                    近7天注册趋势
                  </h3>
                  <div className='space-y-3'>
                    {statsData.registrationStats.registrationTrend.map((stat) => (
                      <div key={stat.date} className='flex items-center justify-between'>
                        <span className='text-sm text-gray-600 dark:text-gray-400'>
                          {formatDate(stat.date)}
                        </span>
                        <div className='flex items-center space-x-2'>
                          <span className='text-sm text-blue-600 dark:text-blue-400'>
                            {stat.newUsers} 人
                          </span>
                          {stat.newUsers > 0 && (
                            <div className='w-2 h-2 bg-blue-500 rounded-full'></div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 用户活跃度统计 */}
                <div className='p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700'>
                  <h3 className='text-lg font-semibold text-gray-900 dark:text-white mb-4'>
                    用户活跃度统计
                  </h3>
                  <div className='space-y-4'>
                    <div className='flex items-center justify-between'>
                      <span className='text-sm text-gray-600 dark:text-gray-400'>日活跃用户</span>
                      <span className='text-lg font-semibold text-green-600 dark:text-green-400'>
                        {statsData.activeUsers.daily}
                      </span>
                    </div>
                    <div className='flex items-center justify-between'>
                      <span className='text-sm text-gray-600 dark:text-gray-400'>周活跃用户</span>
                      <span className='text-lg font-semibold text-blue-600 dark:text-blue-400'>
                        {statsData.activeUsers.weekly}
                      </span>
                    </div>
                    <div className='flex items-center justify-between'>
                      <span className='text-sm text-gray-600 dark:text-gray-400'>月活跃用户</span>
                      <span className='text-lg font-semibold text-purple-600 dark:text-purple-400'>
                        {statsData.activeUsers.monthly}
                      </span>
                    </div>
                    <div className='mt-4 pt-4 border-t border-gray-200 dark:border-gray-600'>
                      <div className='text-xs text-gray-500 dark:text-gray-400'>
                        活跃度 = 最近有播放记录的用户
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 热门来源统计 */}
              <div className='grid grid-cols-1 lg:grid-cols-1 gap-6 mb-8'>
                <div className='p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700'>
                  <h3 className='text-lg font-semibold text-gray-900 dark:text-white mb-4'>
                    热门视频来源
                  </h3>
                  <div className='space-y-3'>
                    {statsData.topSources.map((source, index) => (
                      <div key={source.source} className='flex items-center justify-between'>
                        <div className='flex items-center space-x-3'>
                          <span className='w-6 h-6 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300 rounded-full flex items-center justify-center text-xs font-bold'>
                            {index + 1}
                          </span>
                          <span className='text-sm text-gray-900 dark:text-white'>
                            {source.source}
                          </span>
                        </div>
                        <span className='text-sm text-gray-600 dark:text-gray-400'>
                          {source.count} 次
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 用户播放统计 */}
              <div>
                <h3 className='text-xl font-semibold text-gray-900 dark:text-white mb-6'>
                  用户播放统计
                </h3>
                <div className='space-y-4'>
                  {statsData.userStats.map((userStat) => (
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
                                最后播放:{' '}
                                {userStat.lastPlayTime
                                  ? formatDateTime(userStat.lastPlayTime)
                                  : '从未播放'}
                              </p>
                              <p className='text-xs text-gray-500 dark:text-gray-400'>
                                注册天数: {userStat.registrationDays} 天
                              </p>
                              <p className='text-xs text-gray-500 dark:text-gray-400'>
                                最后活跃:{' '}
                                {userStat.lastLoginTime !== userStat.createdAt
                                  ? formatDateTime(userStat.lastLoginTime)
                                  : '注册时'}
                              </p>
                              {userStat.mostWatchedSource && (
                                <p className='text-xs text-gray-500 dark:text-gray-400'>
                                  常用来源: {userStat.mostWatchedSource}
                                </p>
                              )}
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
                                {userStat.totalPlays}
                              </div>
                              <div className='text-xs text-gray-500 dark:text-gray-400'>
                                播放次数
                              </div>
                            </div>
                            <div className='text-right'>
                              <div className='text-sm font-medium text-gray-900 dark:text-gray-100'>
                                {formatTime(userStat.avgWatchTime)}
                              </div>
                              <div className='text-xs text-gray-500 dark:text-gray-400'>
                                平均时长
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

                      {/* 展开的播放记录详情 */}
                      {expandedUsers.has(userStat.username) && (
                        <div className='p-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700'>
                          {userStat.recentRecords.length > 0 ? (
                            <>
                              <h6 className='text-sm font-medium text-gray-700 dark:text-gray-300 mb-4'>
                                最近播放记录 (最多显示10条)
                              </h6>
                              <div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
                                {userStat.recentRecords.map((record: any) => (
                                  <div
                                    key={record.title + record.save_time}
                                    className='flex items-center space-x-4 p-3 bg-white dark:bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors'
                                    onClick={() => handlePlayRecord(record)}
                                  >
                                    <div className='flex-shrink-0 w-12 h-16 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden'>
                                      {record.cover ? (
                                        <Image
                                          src={record.cover}
                                          alt={record.title}
                                          width={48}
                                          height={64}
                                          className='w-full h-full object-cover'
                                          onError={(e) => {
                                            (
                                              e.target as HTMLImageElement
                                            ).style.display = 'none';
                                          }}
                                        />
                                      ) : (
                                        <div className='w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-500'>
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
                                              d='M7 4V2a1 1 0 011-1h8a1 1 0 011 1v2m0 0V1a1 1 0 011-1h2a1 1 0 011 1v18a1 1 0 01-1 1H4a1 1 0 01-1-1V1a1 1 0 011-1h2a1 1 0 011 1v3'
                                            />
                                          </svg>
                                        </div>
                                      )}
                                    </div>
                                    <div className='flex-1 min-w-0'>
                                      <h6 className='text-sm font-medium text-gray-900 dark:text-gray-100 truncate'>
                                        {record.title}
                                      </h6>
                                      <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                                        来源: {record.source_name} | 年份:{' '}
                                        {record.year}
                                      </p>
                                      <p className='text-xs text-gray-500 dark:text-gray-400'>
                                        第 {record.index} 集 / 共{' '}
                                        {record.total_episodes} 集
                                      </p>
                                      <div className='mt-2'>
                                        <div className='flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1'>
                                          <span>播放进度</span>
                                          <span>
                                            {formatTime(record.play_time)} /{' '}
                                            {formatTime(record.total_time)} (
                                            {getProgressPercentage(
                                              record.play_time,
                                              record.total_time
                                            )}
                                            %)
                                          </span>
                                        </div>
                                        <div className='w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5'>
                                          <div
                                            className='bg-blue-500 h-1.5 rounded-full transition-all duration-300'
                                            style={{
                                              width: `${getProgressPercentage(
                                                record.play_time,
                                                record.total_time
                                              )}%`,
                                            }}
                                          ></div>
                                        </div>
                                      </div>
                                    </div>
                                    <div className='flex-shrink-0 text-right'>
                                      <div className='text-xs text-gray-500 dark:text-gray-400'>
                                        {formatDateTime(record.save_time)}
                                      </div>
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
                                  d='M9.172 16.172a4 4 0 015.656 0M9 12h6m-6-4h6m2 5.291A7.962 7.962 0 0012 15c-2.239 0-4.236.18-6.101.532C4.294 15.661 4 16.28 4 16.917V19a2 2 0 002 2h12a2 2 0 002-2v-2.083c0-.636-.293-1.256-.899-1.385A7.962 7.962 0 0012 15z'
                                />
                              </svg>
                              <p>该用户暂无播放记录</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            /* 个人统计内容 */
            <>
              {/* 个人统计概览 */}
              <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-4 mb-8'>
                <div className='p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800'>
                  <div className='text-2xl font-bold text-blue-800 dark:text-blue-300'>
                    {formatTime(userStats.totalWatchTime)}
                  </div>
                  <div className='text-sm text-blue-600 dark:text-blue-400'>
                    总观看时长
                  </div>
                </div>
                <div className='p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800'>
                  <div className='text-2xl font-bold text-green-800 dark:text-green-300'>
                    {userStats.registrationDays || 0}
                  </div>
                  <div className='text-sm text-green-600 dark:text-green-400'>
                    注册天数
                  </div>
                </div>
                <div className='p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800'>
                  <div className='text-2xl font-bold text-orange-800 dark:text-orange-300'>
                    {userStats.loginDays || 0}
                  </div>
                  <div className='text-sm text-orange-600 dark:text-orange-400'>
                    登录天数
                  </div>
                </div>
                <div className='p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800'>
                  <div className='text-2xl font-bold text-purple-800 dark:text-purple-300'>
                    {userStats.totalMovies || userStats.totalPlays || 0}
                  </div>
                  <div className='text-sm text-purple-600 dark:text-purple-400'>
                    观看影片
                  </div>
                </div>
                <div className='p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-800'>
                  <div className='text-2xl font-bold text-indigo-800 dark:text-indigo-300'>
                    {userStats.totalPlays}
                  </div>
                  <div className='text-sm text-indigo-600 dark:text-indigo-400'>
                    总播放次数
                  </div>
                </div>
                <div className='p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800'>
                  <div className='text-2xl font-bold text-yellow-800 dark:text-yellow-300'>
                    {formatTime(userStats.avgWatchTime)}
                  </div>
                  <div className='text-sm text-yellow-600 dark:text-yellow-400'>
                    平均观看时长
                  </div>
                </div>
                <div className='p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800'>
                  <div className='text-2xl font-bold text-orange-800 dark:text-orange-300'>
                    {userStats.mostWatchedSource || '暂无'}
                  </div>
                  <div className='text-sm text-orange-600 dark:text-orange-400'>
                    常用来源
                  </div>
                </div>
              </div>

              {/* 即将上映卡片 */}
              {(upcomingInitialized || upcomingLoading) && (
                <div className="mb-8">
                  <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg p-6 text-white shadow-lg">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-bold flex items-center gap-2">
                          📅 即将上映
                        </h3>
                        <p className="text-purple-100 text-sm mt-1">
                          {upcomingLoading ? '正在获取最新内容...' : `未来两周将有 ${upcomingReleases.length} 部新内容上线`}
                        </p>
                      </div>
                      <button
                        onClick={() => router.push('/release-calendar')}
                        className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg text-sm transition-colors flex items-center gap-2"
                      >
                        <span>查看全部</span>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"/>
                        </svg>
                      </button>
                    </div>

                    {/* 横向滚动的发布项目 */}
                    <div className="flex space-x-4 overflow-x-auto pb-2 scrollbar-hide">
                      {upcomingLoading ? (
                        // Loading skeleton
                        Array.from({ length: 3 }).map((_, index) => (
                          <div key={`loading-${index}`} className="min-w-[140px] bg-white/10 backdrop-blur-sm rounded-lg p-3 border border-white/20 animate-pulse">
                            <div className="h-4 bg-white/20 rounded mb-2"></div>
                            <div className="h-3 bg-white/20 rounded mb-2 w-3/4"></div>
                            <div className="h-3 bg-white/20 rounded mb-2 w-1/2"></div>
                            <div className="h-3 bg-white/20 rounded w-2/3"></div>
                          </div>
                        ))
                      ) : (
                        <div className="flex flex-col gap-6">
                          {/* 电影部分 */}
                          {upcomingReleases.filter(item => item.type === 'movie').length > 0 && (
                            <div className="w-full">
                              <div className="text-sm font-medium text-purple-100 mb-3 flex items-center gap-2 border-b border-white/20 pb-2">
                                🎬 电影
                              </div>
                              <div className="flex space-x-3 overflow-x-auto pb-1 w-full">
                                {upcomingReleases.filter(item => item.type === 'movie').slice(0, 7).map(item => (
                                  <div key={item.id} className="min-w-[140px] bg-white/10 backdrop-blur-sm rounded-lg p-3 border border-white/20 flex-shrink-0">
                                    <div className="text-sm font-medium mb-1 line-clamp-2" title={item.title}>
                                      {item.title}
                                    </div>
                                    <div className="text-xs text-purple-200 mb-1">
                                      {new Date(item.releaseDate).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                                    </div>
                                    <div className="text-xs text-purple-200 truncate">
                                      {item.region}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* 电视剧部分 */}
                          {upcomingReleases.filter(item => item.type === 'tv').length > 0 && (
                            <div className="w-full">
                              <div className="text-sm font-medium text-purple-100 mb-3 flex items-center gap-2 border-b border-white/20 pb-2">
                                📺 电视剧
                              </div>
                              <div className="flex space-x-3 overflow-x-auto pb-1 w-full">
                                {upcomingReleases.filter(item => item.type === 'tv').slice(0, 7).map(item => (
                                  <div key={item.id} className="min-w-[140px] bg-white/10 backdrop-blur-sm rounded-lg p-3 border border-white/20 flex-shrink-0">
                                    <div className="text-sm font-medium mb-1 line-clamp-2" title={item.title}>
                                      {item.title}
                                    </div>
                                    <div className="text-xs text-purple-200 mb-1">
                                      {new Date(item.releaseDate).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                                    </div>
                                    <div className="text-xs text-purple-200 truncate">
                                      {item.region}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* 空状态提示 */}
                          {upcomingReleases.length === 0 && !upcomingLoading && upcomingInitialized && (
                            <div className="text-center py-6">
                              <div className="text-purple-100 text-sm mb-2">📅</div>
                              <div className="text-purple-100 text-sm">
                                暂无即将上映的内容
                              </div>
                              <div className="text-purple-200 text-xs mt-1">
                                数据获取可能失败，请尝试刷新
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* 有新集数的剧集 */}
              {watchingUpdates && watchingUpdates.updatedSeries.filter(series => series.hasNewEpisode).length > 0 && (
                <div className="mb-8">
                  <div className="flex items-center gap-2 mb-4">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                      有新集数
                    </h2>
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                      <span className="text-sm text-red-500 font-medium">
                        {watchingUpdates.updatedSeries.filter(series => series.hasNewEpisode).length}部剧集有更新
                      </span>
                    </div>
                  </div>

                  {/* 移动端网格布局 */}
                  <div className="sm:hidden">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-8 pt-4 pb-6">
                      {watchingUpdates.updatedSeries
                        .filter(series => series.hasNewEpisode)
                        .map((series, index) => (
                          <div key={`new-${series.title}_${series.year}_${index}`} className="relative w-full">
                            <div className="relative">
                              <VideoCard
                                title={series.title}
                                poster={series.cover || ''}
                                year={series.year}
                                from="playrecord"
                                progress={0}
                                currentEpisode={series.currentEpisode}
                                episodes={series.totalEpisodes}
                                source={series.sourceKey}
                                id={series.videoId}
                                onDelete={undefined}
                              />
                              {/* 新集数提示光环效果 */}
                              <div className="absolute inset-0 rounded-lg ring-2 ring-red-400 ring-opacity-50 animate-pulse pointer-events-none z-10"></div>
                            </div>
                            {/* 新集数徽章 */}
                            <div className="absolute -top-2 -right-2 bg-gradient-to-r from-red-500 to-pink-500 text-white text-xs px-2 py-1 rounded-full shadow-lg animate-bounce z-50">
                              +{series.newEpisodes}集
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>

                  {/* 桌面端网格布局 */}
                  <div className="hidden sm:block">
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-x-6 gap-y-10 pt-6 pb-8">
                      {watchingUpdates.updatedSeries
                        .filter(series => series.hasNewEpisode)
                        .map((series, index) => (
                          <div key={`new-${series.title}_${series.year}_${index}`} className="relative w-full">
                            <div className="relative">
                              <VideoCard
                                title={series.title}
                                poster={series.cover || ''}
                                year={series.year}
                                from="playrecord"
                                progress={0}
                                currentEpisode={series.currentEpisode}
                                episodes={series.totalEpisodes}
                                source={series.sourceKey}
                                id={series.videoId}
                                onDelete={undefined}
                              />
                              {/* 新集数提示光环效果 */}
                              <div className="absolute inset-0 rounded-lg ring-2 ring-red-400 ring-opacity-50 animate-pulse pointer-events-none z-10"></div>
                            </div>
                            {/* 新集数徽章 */}
                            <div className="absolute -top-2 -right-2 bg-gradient-to-r from-red-500 to-pink-500 text-white text-xs px-2 py-1 rounded-full shadow-lg animate-bounce z-50">
                              +{series.newEpisodes}集
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 继续观看的剧集 */}
              {watchingUpdates && watchingUpdates.updatedSeries.filter(series => series.hasContinueWatching && !series.hasNewEpisode).length > 0 && (
                <div className="mb-8">
                  <div className="flex items-center gap-2 mb-4">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                      继续观看
                    </h2>
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                      <span className="text-sm text-blue-500 font-medium">
                        {watchingUpdates.updatedSeries.filter(series => series.hasContinueWatching && !series.hasNewEpisode).length}部剧集待续看
                      </span>
                    </div>
                  </div>

                  {/* 移动端网格布局 */}
                  <div className="sm:hidden">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-8 pt-4 pb-6">
                      {watchingUpdates.updatedSeries
                        .filter(series => series.hasContinueWatching && !series.hasNewEpisode)
                        .map((series, index) => (
                          <div key={`continue-${series.title}_${series.year}_${index}`} className="relative w-full">
                            <div className="relative">
                              <VideoCard
                                title={series.title}
                                poster={series.cover || ''}
                                year={series.year}
                                from="playrecord"
                                progress={0}
                                currentEpisode={series.currentEpisode}
                                episodes={series.totalEpisodes}
                                source={series.sourceKey}
                                id={series.videoId}
                                onDelete={undefined}
                              />
                              {/* 继续观看提示光环效果 */}
                              <div className="absolute inset-0 rounded-lg ring-2 ring-blue-400 ring-opacity-50 animate-pulse pointer-events-none z-10"></div>
                            </div>
                            {/* 继续观看徽章 */}
                            <div className="absolute -top-2 -right-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-xs px-2 py-1 rounded-full shadow-lg animate-pulse z-50">
                              继续看
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>

                  {/* 桌面端网格布局 */}
                  <div className="hidden sm:block">
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-x-6 gap-y-10 pt-6 pb-8">
                      {watchingUpdates.updatedSeries
                        .filter(series => series.hasContinueWatching && !series.hasNewEpisode)
                        .map((series, index) => (
                          <div key={`continue-${series.title}_${series.year}_${index}`} className="relative w-full">
                            <div className="relative">
                              <VideoCard
                                title={series.title}
                                poster={series.cover || ''}
                                year={series.year}
                                from="playrecord"
                                progress={0}
                                currentEpisode={series.currentEpisode}
                                episodes={series.totalEpisodes}
                                source={series.sourceKey}
                                id={series.videoId}
                                onDelete={undefined}
                              />
                              {/* 继续观看提示光环效果 */}
                              <div className="absolute inset-0 rounded-lg ring-2 ring-blue-400 ring-opacity-50 animate-pulse pointer-events-none z-10"></div>
                            </div>
                            {/* 继续观看徽章 */}
                            <div className="absolute -top-2 -right-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-xs px-2 py-1 rounded-full shadow-lg animate-pulse z-50">
                              继续看
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 最近播放记录 */}
              <div>
                <h3 className='text-xl font-semibold text-gray-900 dark:text-white mb-6'>
                  最近播放记录
                </h3>
                {userStats.recentRecords && userStats.recentRecords.length > 0 ? (
                  <div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
                    {userStats.recentRecords.map((record: PlayRecord) => (
                      <div
                        key={record.title + record.save_time}
                        className='flex items-center space-x-4 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors'
                        onClick={() => handlePlayRecord(record)}
                      >
                        <div className='flex-shrink-0 w-16 h-20 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden'>
                          {record.cover ? (
                            <Image
                              src={record.cover}
                              alt={record.title}
                              width={64}
                              height={80}
                              className='w-full h-full object-cover'
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <div className='w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-500'>
                              <svg
                                className='w-8 h-8'
                                fill='none'
                                stroke='currentColor'
                                viewBox='0 0 24 24'
                              >
                                <path
                                  strokeLinecap='round'
                                  strokeLinejoin='round'
                                  strokeWidth='2'
                                  d='M7 4V2a1 1 0 011-1h8a1 1 0 011 1v2m0 0V1a1 1 0 011-1h2a1 1 0 011 1v18a1 1 0 01-1 1H4a1 1 0 01-1-1V1a1 1 0 011-1h2a1 1 0 011 1v3'
                                />
                              </svg>
                            </div>
                          )}
                        </div>
                        <div className='flex-1 min-w-0'>
                          <h6 className='text-sm font-medium text-gray-900 dark:text-gray-100 truncate mb-1'>
                            {record.title}
                          </h6>
                          <p className='text-xs text-gray-500 dark:text-gray-400 mb-2'>
                            来源: {record.source_name} | 年份: {record.year}
                          </p>
                          <p className='text-xs text-gray-500 dark:text-gray-400 mb-2'>
                            第 {record.index} 集 / 共 {record.total_episodes} 集
                          </p>
                          <div className='mt-2'>
                            <div className='flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1'>
                              <span>播放进度</span>
                              <span>
                                {formatTime(record.play_time)} / {formatTime(record.total_time)} (
                                {getProgressPercentage(record.play_time, record.total_time)}%)
                              </span>
                            </div>
                            <div className='w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5'>
                              <div
                                className='bg-blue-500 h-1.5 rounded-full transition-all duration-300'
                                style={{
                                  width: `${getProgressPercentage(
                                    record.play_time,
                                    record.total_time
                                  )}%`,
                                }}
                              ></div>
                            </div>
                          </div>
                          <div className='text-xs text-gray-500 dark:text-gray-400 mt-2'>
                            {formatDateTime(record.save_time)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className='text-center py-12 text-gray-500 dark:text-gray-400'>
                    <svg
                      className='w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600'
                      fill='none'
                      stroke='currentColor'
                      viewBox='0 0 24 24'
                    >
                      <path
                        strokeLinecap='round'
                        strokeLinejoin='round'
                        strokeWidth='2'
                        d='M9.172 16.172a4 4 0 015.656 0M9 12h6m-6-4h6m2 5.291A7.962 7.962 0 0012 15c-2.239 0-4.236.18-6.101.532C4.294 15.661 4 16.28 4 16.917V19a2 2 0 002 2h12a2 2 0 002-2v-2.083c0-.636-.293-1.256-.899-1.385A7.962 7.962 0 0012 15z'
                      />
                    </svg>
                    <p>暂无播放记录</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        <button
          onClick={scrollToTop}
          className={`fixed bottom-20 md:bottom-6 right-6 z-[500] w-12 h-12 bg-green-500/90 hover:bg-green-500 text-white rounded-full shadow-lg backdrop-blur-sm transition-all duration-300 ease-in-out flex items-center justify-center group ${showBackToTop
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 translate-y-4 pointer-events-none'
            }`}
          aria-label='返回顶部'
        >
          <ChevronUp className='w-6 h-6 transition-transform group-hover:scale-110' />
        </button>

      </PageLayout>
    );
  }

  // 渲染普通用户个人统计页面
  if (!isAdmin && userStats) {
    return (
      <PageLayout activePath="/play-stats">
        <div className='max-w-6xl mx-auto px-4 py-8'>
          {/* 页面标题和刷新按钮 */}
          <div className='flex justify-between items-start mb-8'>
            <div>
              <h1 className='text-3xl font-bold text-gray-900 dark:text-white'>
                个人统计
              </h1>
              <p className='text-gray-600 dark:text-gray-400 mt-2'>
                查看您的个人播放记录和统计数据
              </p>
            </div>
            <div className='mt-10'>
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
                    获取个人统计失败
                  </h4>
                  <p className='text-red-700 dark:text-red-400 text-sm mt-1'>
                    {error}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 个人统计概览 */}
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-4 mb-8'>
            <div className='p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800'>
              <div className='text-2xl font-bold text-blue-800 dark:text-blue-300'>
                {formatTime(userStats.totalWatchTime)}
              </div>
              <div className='text-sm text-blue-600 dark:text-blue-400'>
                总观看时长
              </div>
            </div>
            <div className='p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800'>
              <div className='text-2xl font-bold text-green-800 dark:text-green-300'>
                {userStats.registrationDays || 0}
              </div>
              <div className='text-sm text-green-600 dark:text-green-400'>
                注册天数
              </div>
            </div>
            <div className='p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800'>
              <div className='text-2xl font-bold text-orange-800 dark:text-orange-300'>
                {userStats.loginDays || 0}
              </div>
              <div className='text-sm text-orange-600 dark:text-orange-400'>
                登录天数
              </div>
            </div>
            <div className='p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800'>
              <div className='text-2xl font-bold text-purple-800 dark:text-purple-300'>
                {userStats.totalMovies || userStats.totalPlays || 0}
              </div>
              <div className='text-sm text-purple-600 dark:text-purple-400'>
                观看影片
              </div>
            </div>
            <div className='p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-800'>
              <div className='text-2xl font-bold text-indigo-800 dark:text-indigo-300'>
                {userStats.totalPlays}
              </div>
              <div className='text-sm text-indigo-600 dark:text-indigo-400'>
                总播放次数
              </div>
            </div>
            <div className='p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800'>
              <div className='text-2xl font-bold text-yellow-800 dark:text-yellow-300'>
                {formatTime(userStats.avgWatchTime)}
              </div>
              <div className='text-sm text-yellow-600 dark:text-yellow-400'>
                平均观看时长
              </div>
            </div>
            <div className='p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800'>
              <div className='text-2xl font-bold text-orange-800 dark:text-orange-300'>
                {userStats.mostWatchedSource || '暂无'}
              </div>
              <div className='text-sm text-orange-600 dark:text-orange-400'>
                常用来源
              </div>
            </div>
            {/* 新集数更新 */}
            <div
              className={`p-4 rounded-lg border transition-all ${
                (watchingUpdates?.updatedCount || 0) > 0
                  ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                  : 'bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800'
              }`}
            >
              <div className={`text-2xl font-bold ${
                (watchingUpdates?.updatedCount || 0) > 0
                  ? 'text-red-800 dark:text-red-300'
                  : 'text-gray-800 dark:text-gray-300'
              }`}>
                {watchingUpdates?.updatedCount || 0}
              </div>
              <div className={`text-sm ${
                (watchingUpdates?.updatedCount || 0) > 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-gray-600 dark:text-gray-400'
              }`}>
                新集数更新
              </div>
              {(watchingUpdates?.updatedCount || 0) > 0 && (
                <div className='text-xs text-red-500 dark:text-red-400 mt-1'>
                  有新集数发布！
                </div>
              )}
            </div>

            {/* 继续观看提醒 */}
            <div
              className={`p-4 rounded-lg border transition-all ${
                (watchingUpdates?.continueWatchingCount || 0) > 0
                  ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                  : 'bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800'
              }`}
            >
              <div className={`text-2xl font-bold ${
                (watchingUpdates?.continueWatchingCount || 0) > 0
                  ? 'text-blue-800 dark:text-blue-300'
                  : 'text-gray-800 dark:text-gray-300'
              }`}>
                {watchingUpdates?.continueWatchingCount || 0}
              </div>
              <div className={`text-sm ${
                (watchingUpdates?.continueWatchingCount || 0) > 0
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-gray-600 dark:text-gray-400'
              }`}>
                继续观看
              </div>
              {(watchingUpdates?.continueWatchingCount || 0) > 0 && (
                <div className='text-xs text-blue-500 dark:text-blue-400 mt-1'>
                  有剧集待续看！
                </div>
              )}
            </div>
          </div>

          {/* 即将上映卡片 */}
          {(upcomingInitialized || upcomingLoading) && (
            <div className="mb-8">
              <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg p-6 text-white shadow-lg">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-bold flex items-center gap-2">
                      📅 即将上映
                    </h3>
                    <p className="text-purple-100 text-sm mt-1">
                      {upcomingLoading ? '正在获取最新内容...' : `未来两周将有 ${upcomingReleases.length} 部新内容上线`}
                    </p>
                  </div>
                  <button
                    onClick={() => router.push('/release-calendar')}
                    className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg text-sm transition-colors flex items-center gap-2"
                  >
                    <span>查看全部</span>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"/>
                    </svg>
                  </button>
                </div>

                {/* 垂直分组显示：电影一行，电视剧一行 */}
                <div>
                  {upcomingLoading ? (
                    // Loading skeleton
                    Array.from({ length: 3 }).map((_, index) => (
                      <div key={`loading-${index}`} className="min-w-[140px] bg-white/10 backdrop-blur-sm rounded-lg p-3 border border-white/20 animate-pulse">
                        <div className="h-4 bg-white/20 rounded mb-2"></div>
                        <div className="h-3 bg-white/20 rounded mb-2 w-1/2"></div>
                        <div className="h-3 bg-white/20 rounded w-2/3"></div>
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-col gap-6">
                      {/* 电影部分 */}
                      {upcomingReleases.filter(item => item.type === 'movie').length > 0 && (
                        <div className="w-full">
                          <div className="text-sm font-medium text-purple-100 mb-3 flex items-center gap-2 border-b border-white/20 pb-2">
                            🎬 电影
                          </div>
                          <div className="flex space-x-3 overflow-x-auto pb-1 w-full">
                            {upcomingReleases.filter(item => item.type === 'movie').slice(0, 7).map(item => (
                              <div key={item.id} className="min-w-[140px] bg-white/10 backdrop-blur-sm rounded-lg p-3 border border-white/20 flex-shrink-0">
                                <div className="text-sm font-medium mb-1 line-clamp-2" title={item.title}>
                                  {item.title}
                                </div>
                                <div className="text-xs text-purple-200 mb-1">
                                  {new Date(item.releaseDate).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                                </div>
                                <div className="text-xs text-purple-200 truncate">
                                  {item.region}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 电视剧部分 */}
                      {upcomingReleases.filter(item => item.type === 'tv').length > 0 && (
                        <div className="w-full">
                          <div className="text-sm font-medium text-purple-100 mb-3 flex items-center gap-2 border-b border-white/20 pb-2">
                            📺 电视剧
                          </div>
                          <div className="flex space-x-3 overflow-x-auto pb-1 w-full">
                            {upcomingReleases.filter(item => item.type === 'tv').slice(0, 7).map(item => (
                              <div key={item.id} className="min-w-[140px] bg-white/10 backdrop-blur-sm rounded-lg p-3 border border-white/20 flex-shrink-0">
                                <div className="text-sm font-medium mb-1 line-clamp-2" title={item.title}>
                                  {item.title}
                                </div>
                                <div className="text-xs text-purple-200 mb-1">
                                  {new Date(item.releaseDate).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                                </div>
                                <div className="text-xs text-purple-200 truncate">
                                  {item.region}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 空状态提示 */}
                      {upcomingReleases.length === 0 && !upcomingLoading && upcomingInitialized && (
                        <div className="text-center py-6">
                          <div className="text-purple-100 text-sm mb-2">📅</div>
                          <div className="text-purple-100 text-sm">
                            暂无即将上映的内容
                          </div>
                          <div className="text-purple-200 text-xs mt-1">
                            数据获取可能失败，请尝试刷新
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 有新集数的剧集 */}
          {watchingUpdates && watchingUpdates.updatedSeries.filter(series => series.hasNewEpisode).length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  有新集数
                </h2>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                  <span className="text-sm text-red-500 font-medium">
                    {watchingUpdates.updatedSeries.filter(series => series.hasNewEpisode).length}部剧集有更新
                  </span>
                </div>
              </div>

              {/* 移动端网格布局 */}
              <div className="sm:hidden">
                <div className="grid grid-cols-2 gap-x-4 gap-y-8 pt-4 pb-6">
                  {watchingUpdates.updatedSeries
                    .filter(series => series.hasNewEpisode)
                    .map((series, index) => (
                      <div key={`new-${series.title}_${series.year}_${index}`} className="relative w-full">
                        <div className="relative">
                          <VideoCard
                            title={series.title}
                            poster={series.cover || ''}
                            year={series.year}
                            from="playrecord"
                            progress={0}
                            currentEpisode={series.currentEpisode}
                            episodes={series.totalEpisodes}
                            source_name={series.source_name}
                            source={series.source_name}
                            id={`${series.title}_${series.year}`}
                            onDelete={undefined}
                          />
                          {/* 新集数提示光环效果 */}
                          <div className="absolute inset-0 rounded-lg ring-2 ring-red-400 ring-opacity-50 animate-pulse pointer-events-none z-10"></div>
                        </div>
                        {/* 新集数徽章 */}
                        <div className="absolute -top-2 -right-2 bg-gradient-to-r from-red-500 to-pink-500 text-white text-xs px-2 py-1 rounded-full shadow-lg animate-bounce z-50">
                          +{series.newEpisodes}集
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* 桌面端网格布局 */}
              <div className="hidden sm:block">
                <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-x-6 gap-y-10 pt-6 pb-8">
                  {watchingUpdates.updatedSeries
                    .filter(series => series.hasNewEpisode)
                    .map((series, index) => (
                      <div key={`new-${series.title}_${series.year}_${index}`} className="relative w-full">
                        <div className="relative">
                          <VideoCard
                            title={series.title}
                            poster={series.cover || ''}
                            year={series.year}
                            from="playrecord"
                            progress={0}
                            currentEpisode={series.currentEpisode}
                            episodes={series.totalEpisodes}
                            source_name={series.source_name}
                            source={series.source_name}
                            id={`${series.title}_${series.year}`}
                            onDelete={undefined}
                          />
                          {/* 新集数提示光环效果 */}
                          <div className="absolute inset-0 rounded-lg ring-2 ring-red-400 ring-opacity-50 animate-pulse pointer-events-none z-10"></div>
                        </div>
                        {/* 新集数徽章 */}
                        <div className="absolute -top-2 -right-2 bg-gradient-to-r from-red-500 to-pink-500 text-white text-xs px-2 py-1 rounded-full shadow-lg animate-bounce z-50">
                          +{series.newEpisodes}集
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}

          {/* 继续观看的剧集 */}
          {watchingUpdates && watchingUpdates.updatedSeries.filter(series => series.hasContinueWatching && !series.hasNewEpisode).length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  继续观看
                </h2>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                  <span className="text-sm text-blue-500 font-medium">
                    {watchingUpdates.updatedSeries.filter(series => series.hasContinueWatching && !series.hasNewEpisode).length}部剧集待续看
                  </span>
                </div>
              </div>

              {/* 移动端网格布局 */}
              <div className="sm:hidden">
                <div className="grid grid-cols-2 gap-x-4 gap-y-8 pt-4 pb-6">
                  {watchingUpdates.updatedSeries
                    .filter(series => series.hasContinueWatching && !series.hasNewEpisode)
                    .map((series, index) => (
                      <div key={`continue-${series.title}_${series.year}_${index}`} className="relative w-full">
                        <div className="relative">
                          <VideoCard
                            title={series.title}
                            poster={series.cover || ''}
                            year={series.year}
                            from="playrecord"
                            progress={0}
                            currentEpisode={series.currentEpisode}
                            episodes={series.totalEpisodes}
                            source_name={series.source_name}
                            source={series.source_name}
                            id={`${series.title}_${series.year}`}
                            onDelete={undefined}
                          />
                          {/* 继续观看提示光环效果 */}
                          <div className="absolute inset-0 rounded-lg ring-2 ring-blue-400 ring-opacity-50 animate-pulse pointer-events-none z-10"></div>
                        </div>
                        {/* 继续观看标识 */}
                        <div className="absolute -top-2 -right-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-xs px-2 py-1 rounded-full shadow-lg z-50">
                          继续观看
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* 桌面端网格布局 */}
              <div className="hidden sm:block">
                <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-x-6 gap-y-10 pt-6 pb-8">
                  {watchingUpdates.updatedSeries
                    .filter(series => series.hasContinueWatching && !series.hasNewEpisode)
                    .map((series, index) => (
                      <div key={`continue-${series.title}_${series.year}_${index}`} className="relative w-full">
                        <div className="relative">
                          <VideoCard
                            title={series.title}
                            poster={series.cover || ''}
                            year={series.year}
                            from="playrecord"
                            progress={0}
                            currentEpisode={series.currentEpisode}
                            episodes={series.totalEpisodes}
                            source_name={series.source_name}
                            source={series.source_name}
                            id={`${series.title}_${series.year}`}
                            onDelete={undefined}
                          />
                          {/* 继续观看提示光环效果 */}
                          <div className="absolute inset-0 rounded-lg ring-2 ring-blue-400 ring-opacity-50 animate-pulse pointer-events-none z-10"></div>
                        </div>
                        {/* 继续观看标识 */}
                        <div className="absolute -top-2 -right-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-xs px-2 py-1 rounded-full shadow-lg z-50">
                          继续观看
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}

          {/* 历史观看记录 */}
          <div>
            <h3 className='text-xl font-semibold text-gray-900 dark:text-white mb-6'>
              {watchingUpdates && (watchingUpdates.updatedCount > 0 || watchingUpdates.continueWatchingCount > 0) ? '历史观看' : '观看记录'}
            </h3>
            {userStats.recentRecords && userStats.recentRecords.length > 0 ? (
              <div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
                {userStats.recentRecords.map((record: PlayRecord) => (
                  <div
                    key={record.title + record.save_time}
                    className='flex items-center space-x-4 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors'
                    onClick={() => handlePlayRecord(record)}
                  >
                    <div className='flex-shrink-0 w-16 h-20 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden'>
                      {record.cover ? (
                        <Image
                          src={record.cover}
                          alt={record.title}
                          width={64}
                          height={80}
                          className='w-full h-full object-cover'
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className='w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-500'>
                          <svg
                            className='w-8 h-8'
                            fill='none'
                            stroke='currentColor'
                            viewBox='0 0 24 24'
                          >
                            <path
                              strokeLinecap='round'
                              strokeLinejoin='round'
                              strokeWidth='2'
                              d='M7 4V2a1 1 0 011-1h8a1 1 0 011 1v2m0 0V1a1 1 0 011-1h2a1 1 0 011 1v18a1 1 0 01-1 1H4a1 1 0 01-1-1V1a1 1 0 011-1h2a1 1 0 011 1v3'
                            />
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className='flex-1 min-w-0'>
                      <h6 className='text-sm font-medium text-gray-900 dark:text-gray-100 truncate mb-1'>
                        {record.title}
                      </h6>
                      <p className='text-xs text-gray-500 dark:text-gray-400 mb-2'>
                        来源: {record.source_name} | 年份: {record.year}
                      </p>
                      <p className='text-xs text-gray-500 dark:text-gray-400 mb-2'>
                        第 {record.index} 集 / 共 {record.total_episodes} 集
                      </p>
                      <div className='mt-2'>
                        <div className='flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1'>
                          <span>播放进度</span>
                          <span>
                            {formatTime(record.play_time)} / {formatTime(record.total_time)} (
                            {getProgressPercentage(record.play_time, record.total_time)}%)
                          </span>
                        </div>
                        <div className='w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5'>
                          <div
                            className='bg-blue-500 h-1.5 rounded-full transition-all duration-300'
                            style={{
                              width: `${getProgressPercentage(
                                record.play_time,
                                record.total_time
                              )}%`,
                            }}
                          ></div>
                        </div>
                      </div>
                      <div className='text-xs text-gray-500 dark:text-gray-400 mt-2'>
                        {formatDateTime(record.save_time)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className='text-center py-12 text-gray-500 dark:text-gray-400'>
                <svg
                  className='w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600'
                  fill='none'
                  stroke='currentColor'
                  viewBox='0 0 24 24'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth='2'
                    d='M9.172 16.172a4 4 0 015.656 0M9 12h6m-6-4h6m2 5.291A7.962 7.962 0 0012 15c-2.239 0-4.236.18-6.101.532C4.294 15.661 4 16.28 4 16.917V19a2 2 0 002 2h12a2 2 0 002-2v-2.083c0-.636-.293-1.256-.899-1.385A7.962 7.962 0 0012 15z'
                  />
                </svg>
                <p>暂无播放记录</p>
              </div>
            )}
          </div>
        </div>

        {/* 返回顶部悬浮按钮 */}
        <button
          onClick={scrollToTop}
          className={`fixed bottom-20 md:bottom-6 right-6 z-[500] w-12 h-12 bg-green-500/90 hover:bg-green-500 text-white rounded-full shadow-lg backdrop-blur-sm transition-all duration-300 ease-in-out flex items-center justify-center group ${showBackToTop
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 translate-y-4 pointer-events-none'
            }`}
          aria-label='返回顶部'
        >
          <ChevronUp className='w-6 h-6 transition-transform group-hover:scale-110' />
        </button>

      </PageLayout>
    );
  }

  // 加载中或错误状态
  return (
    <PageLayout activePath="/play-stats">
      <div className='max-w-6xl mx-auto px-4 py-8'>
        <div className='text-center py-12'>
          {error ? (
            <div className='text-red-600 dark:text-red-400'>{error}</div>
          ) : (
            <div className='text-gray-600 dark:text-gray-400'>
              {isAdmin ? '加载播放统计中...' : '加载个人统计中...'}
            </div>
          )}
        </div>
      </div>

      {/* 返回顶部悬浮按钮 */}
      <button
        onClick={scrollToTop}
        className={`fixed bottom-20 md:bottom-6 right-6 z-[500] w-12 h-12 bg-green-500/90 hover:bg-green-500 text-white rounded-full shadow-lg backdrop-blur-sm transition-all duration-300 ease-in-out flex items-center justify-center group ${showBackToTop
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

export default PlayStatsPage;