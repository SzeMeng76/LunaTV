/* eslint-disable no-console,@typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion */

'use client';

import {
  BarChart3,
  Bell,
  Calendar,
  Check,
  Download,
  Heart,
  KeyRound,
  LogOut,
  PlayCircle,
  Settings,
  Shield,
  Tv,
  User,
  Users,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';

import { getAuthInfoFromBrowserCookie } from '@/lib/auth';
import { CURRENT_VERSION } from '@/lib/version';
import { checkForUpdates, UpdateStatus } from '@/lib/version_check';
import {
  getCachedWatchingUpdates,
  getDetailedWatchingUpdates,
  subscribeToWatchingUpdatesEvent,
  checkWatchingUpdates,
  type WatchingUpdate,
} from '@/lib/watching-updates';
import {
  getAllPlayRecords,
  forceRefreshPlayRecordsCache,
  type PlayRecord,
} from '@/lib/db.client';
import type { Favorite } from '@/lib/types';

import { useDownload } from '@/contexts/DownloadContext';

import { VersionPanel } from './VersionPanel';
import VideoCard from './VideoCard';
import { SettingsPanel } from './SettingsPanel';
import {
  useWatchRoomConfigQuery,
  useServerConfigQuery,
  useVersionCheckQuery,
  usePlayRecordsQuery,
  useFavoritesQuery,
  useChangePasswordMutation,
  useInvalidateUserMenuData,
} from '@/hooks/useUserMenuQueries';

interface AuthInfo {
  username?: string;
  role?: 'owner' | 'admin' | 'user';
}

export const UserMenu: React.FC = () => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [isVersionPanelOpen, setIsVersionPanelOpen] = useState(false);
  const [isWatchingUpdatesOpen, setIsWatchingUpdatesOpen] = useState(false);
  const [isContinueWatchingOpen, setIsContinueWatchingOpen] = useState(false);
  const [isFavoritesOpen, setIsFavoritesOpen] = useState(false);
  const [authInfo, setAuthInfo] = useState<AuthInfo | null>(null);
  const [storageType, setStorageType] = useState<string>(() => {
    // 🔧 优化：直接从 RUNTIME_CONFIG 读取初始值，避免默认值导致的多次渲染
    if (typeof window !== 'undefined') {
      return (window as any).RUNTIME_CONFIG?.STORAGE_TYPE || 'localstorage';
    }
    return 'localstorage';
  });
  const [mounted, setMounted] = useState(false);
  const [watchingUpdates, setWatchingUpdates] = useState<WatchingUpdate | null>(null);
  const [hasUnreadUpdates, setHasUnreadUpdates] = useState(false);
  // 🚀 TanStack Query - 观影室配置
  const { data: showWatchRoom = false } = useWatchRoomConfigQuery();
  // 🚀 TanStack Query - 下载功能配置
  const { data: serverConfig } = useServerConfigQuery();
  const downloadEnabled = serverConfig?.downloadEnabled ?? true;
  const { tasks, setShowDownloadPanel } = useDownload();

  // 🚀 TanStack Query - 数据失效工具
  const { invalidatePlayRecords, invalidateFavorites } = useInvalidateUserMenuData();

  // Body 滚动锁定 - 使用 overflow 方式避免布局问题
  useEffect(() => {
    if (isSettingsOpen || isChangePasswordOpen || isWatchingUpdatesOpen || isContinueWatchingOpen || isFavoritesOpen) {
      const body = document.body;
      const html = document.documentElement;

      // 保存原始样式
      const originalBodyOverflow = body.style.overflow;
      const originalHtmlOverflow = html.style.overflow;

      // 只设置 overflow 来阻止滚动
      body.style.overflow = 'hidden';
      html.style.overflow = 'hidden';

      return () => {

        // 恢复所有原始样式
        body.style.overflow = originalBodyOverflow;
        html.style.overflow = originalHtmlOverflow;
      };
    }
  }, [isSettingsOpen, isChangePasswordOpen, isWatchingUpdatesOpen, isContinueWatchingOpen, isFavoritesOpen]);

  // 数据查询条件（从 localStorage 读初始值，供 playRecords query 用）
  const [continueWatchingMinProgress] = useState(() =>
    typeof window !== 'undefined' ? (Number(localStorage.getItem('continueWatchingMinProgress')) || 5) : 5
  );
  const [continueWatchingMaxProgress] = useState(() =>
    typeof window !== 'undefined' ? (Number(localStorage.getItem('continueWatchingMaxProgress')) || 100) : 100
  );
  const [enableContinueWatchingFilter] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('enableContinueWatchingFilter') === 'true' : false
  );

  // 修改密码相关状态
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  // 🚀 TanStack Query - 版本检查
  const { data: updateStatus = null, isLoading: isChecking } = useVersionCheckQuery();

  // 数据查询条件
  const dataQueryEnabled = typeof window !== 'undefined' && !!authInfo?.username && storageType !== 'localstorage';

  // 🚀 TanStack Query - 播放记录
  const { data: playRecords = [] } = usePlayRecordsQuery({
    enabled: dataQueryEnabled,
    enableFilter: enableContinueWatchingFilter,
    minProgress: continueWatchingMinProgress,
    maxProgress: continueWatchingMaxProgress,
  });

  // 🚀 TanStack Query - 收藏列表
  const { data: favorites = [] } = useFavoritesQuery({
    enabled: dataQueryEnabled,
  });

  // 🚀 TanStack Query - 修改密码
  const changePasswordMutation = useChangePasswordMutation();

  // 确保组件已挂载
  useEffect(() => {
    setMounted(true);
  }, []);

  // 🚀 预加载导航页面 - 当菜单打开时预加载所有可能访问的页面
  useEffect(() => {
    if (isOpen) {
      // 预加载管理面板（仅 owner/admin 有权限）
      if (authInfo?.role === 'owner' || authInfo?.role === 'admin') {
        router.prefetch('/admin');
      }
      // 预加载播放统计（所有登录用户，且非 localstorage 存储）
      if (authInfo?.username && storageType !== 'localstorage') {
        router.prefetch('/play-stats');
      }
      // 预加载 TVBox 配置（所有人都能访问）
      router.prefetch('/tvbox');
      // 预加载观影室（如果功能启用，所有人都能访问）
      if (showWatchRoom) {
        router.prefetch('/watch-room');
      }
      // 预加载发布日历（所有人都能访问）
      router.prefetch('/release-calendar');
    }
  }, [isOpen, authInfo, storageType, showWatchRoom, router]);

  // 获取认证信息
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const auth = getAuthInfoFromBrowserCookie();
      setAuthInfo(auth);
    }
  }, []);

  // 🚀 观影室配置和下载配置由 TanStack Query 自动管理

  // 🚀 版本检查由 TanStack Query 自动管理

  // 获取观看更新信息
  useEffect(() => {
    console.log('UserMenu watching-updates 检查条件:', {
      'window': typeof window !== 'undefined',
      'authInfo.username': authInfo?.username,
      'storageType': storageType,
      'storageType !== localstorage': storageType !== 'localstorage'
    });

    if (typeof window !== 'undefined' && authInfo?.username && storageType !== 'localstorage') {
      console.log('开始加载 watching-updates 数据...');

      const updateWatchingUpdates = () => {
        const updates = getDetailedWatchingUpdates();
        console.log('getDetailedWatchingUpdates 返回:', updates);
        setWatchingUpdates(updates);

        // 检测是否有新更新（只检查新剧集更新，不包括继续观看）
        if (updates && (updates.updatedCount || 0) > 0) {
          const lastViewed = parseInt(localStorage.getItem('watchingUpdatesLastViewed') || '0');
          const currentTime = Date.now();

          // 如果从未查看过，或者距离上次查看超过1分钟，认为有新更新
          const hasNewUpdates = lastViewed === 0 || (currentTime - lastViewed > 60000);
          setHasUnreadUpdates(hasNewUpdates);
        } else {
          setHasUnreadUpdates(false);
        }
      };

      // 页面初始化时检查更新（使用缓存机制）
      const forceInitialCheck = async () => {
        console.log('页面初始化，检查更新...');
        try {
          // 🔧 修复：不使用强制刷新，让缓存机制生效（30分钟）
          // 如果缓存有效，直接使用缓存；如果过期，自动重新检查
          await checkWatchingUpdates();

          // 更新UI
          updateWatchingUpdates();
          console.log('页面初始化更新检查完成');
        } catch (error) {
          console.error('页面初始化检查更新失败:', error);
          // 失败时仍然尝试从缓存加载
          updateWatchingUpdates();
        }
      };

      // 先尝试从缓存加载，然后强制检查
      const cachedUpdates = getCachedWatchingUpdates();
      if (cachedUpdates) {
        console.log('发现缓存数据，先加载缓存');
        updateWatchingUpdates();
      }

      // 🔧 修复：延迟1秒后在后台执行更新检查，避免阻塞页面初始加载
      setTimeout(() => {
        forceInitialCheck();
      }, 1000);

      // 订阅更新事件
      const unsubscribe = subscribeToWatchingUpdatesEvent(() => {
        console.log('收到 watching-updates 事件，更新数据...');
        updateWatchingUpdates();
      });

      return unsubscribe;
    } else {
      console.log('watching-updates 条件不满足，跳过加载');
    }
  }, [authInfo, storageType]);

  // 🚀 播放记录和收藏由 TanStack Query 自动管理
  // 监听事件来触发 TanStack Query 缓存失效
  useEffect(() => {
    if (!dataQueryEnabled) return;

    const handlePlayRecordsUpdate = () => {
      console.log('UserMenu: 播放记录更新，invalidate query');
      invalidatePlayRecords();
    };

    const handleFavoritesUpdate = () => {
      console.log('UserMenu: 收藏更新，invalidate query');
      invalidateFavorites();
    };

    window.addEventListener('playRecordsUpdated', handlePlayRecordsUpdate);
    window.addEventListener('favoritesUpdated', handleFavoritesUpdate);

    // 监听watching-updates事件，刷新播放记录
    const unsubscribeWatchingUpdates = subscribeToWatchingUpdatesEvent(() => {
      const updates = getDetailedWatchingUpdates();
      if (updates && updates.hasUpdates && updates.updatedCount > 0) {
        console.log('UserMenu: 检测到新集数更新，invalidate play records');
        invalidatePlayRecords();
      }
    });

    return () => {
      window.removeEventListener('playRecordsUpdated', handlePlayRecordsUpdate);
      window.removeEventListener('favoritesUpdated', handleFavoritesUpdate);
      unsubscribeWatchingUpdates();
    };
  }, [dataQueryEnabled, invalidatePlayRecords, invalidateFavorites]);


  const handleMenuClick = async () => {
    const willOpen = !isOpen;
    setIsOpen(willOpen);

    // 如果是打开菜单，立即检查更新（不受缓存限制）
    if (willOpen && authInfo?.username && storageType !== 'localstorage') {
      console.log('打开菜单时强制检查更新...');
      try {
        // 暂时清除缓存时间，强制检查一次
        const lastCheckTime = localStorage.getItem('moontv_last_update_check');
        localStorage.removeItem('moontv_last_update_check');

        // 执行检查
        await checkWatchingUpdates();

        // 恢复缓存时间（如果之前有的话）
        if (lastCheckTime) {
          localStorage.setItem('moontv_last_update_check', lastCheckTime);
        }

        // 更新UI状态
        const updates = getDetailedWatchingUpdates();
        setWatchingUpdates(updates);

        // 重新计算未读状态
        if (updates && (updates.updatedCount || 0) > 0) {
          const lastViewed = parseInt(localStorage.getItem('watchingUpdatesLastViewed') || '0');
          const currentTime = Date.now();
          const hasNewUpdates = lastViewed === 0 || (currentTime - lastViewed > 60000);
          setHasUnreadUpdates(hasNewUpdates);
        } else {
          setHasUnreadUpdates(false);
        }

        console.log('菜单打开时的更新检查完成');
      } catch (error) {
        console.error('菜单打开时检查更新失败:', error);
      }
    }
  };

  const handleCloseMenu = () => {
    setIsOpen(false);
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('注销请求失败:', error);
    }
    window.location.href = '/';
  };

  const handleAdminPanel = () => {
    setIsOpen(false);
    router.refresh();
    router.push('/admin');
  };

  const handlePlayStats = () => {
    setIsOpen(false);
    router.refresh();
    router.push('/play-stats');
  };

  const handleTVBoxConfig = () => {
    setIsOpen(false);
    router.refresh();
    router.push('/tvbox');
  };

  const handleWatchRoom = () => {
    setIsOpen(false);
    router.refresh();
    router.push('/watch-room');
  };

  const handleReleaseCalendar = () => {
    setIsOpen(false);
    router.refresh();
    router.push('/release-calendar');
  };

  const handleWatchingUpdates = () => {
    setIsOpen(false);
    setIsWatchingUpdatesOpen(true);
    // 标记为已读
    setHasUnreadUpdates(false);
    const currentTime = Date.now();
    localStorage.setItem('watchingUpdatesLastViewed', currentTime.toString());
  };

  const handleCloseWatchingUpdates = () => {
    setIsWatchingUpdatesOpen(false);
  };

  const handleContinueWatching = () => {
    setIsOpen(false);
    setIsContinueWatchingOpen(true);
  };

  const handleCloseContinueWatching = () => {
    setIsContinueWatchingOpen(false);
  };

  const handleFavorites = () => {
    setIsOpen(false);
    setIsFavoritesOpen(true);
  };

  const handleCloseFavorites = () => {
    setIsFavoritesOpen(false);
  };

  // 从 key 中解析 source 和 id
  const parseKey = (key: string) => {
    const [source, id] = key.split('+');
    return { source, id };
  };

  // 计算播放进度百分比
  const getProgress = (record: PlayRecord) => {
    if (record.total_time === 0) return 0;
    return (record.play_time / record.total_time) * 100;
  };

  // 检查播放记录是否有新集数更新
  const getNewEpisodesCount = (record: PlayRecord & { key: string }): number => {
    if (!watchingUpdates || !watchingUpdates.updatedSeries) return 0;

    const { source, id } = parseKey(record.key);

    // 在watchingUpdates中查找匹配的剧集
    const matchedSeries = watchingUpdates.updatedSeries.find(series =>
      series.sourceKey === source &&
      series.videoId === id &&
      series.hasNewEpisode
    );

    return matchedSeries ? (matchedSeries.newEpisodes || 0) : 0;
  };

  const handleChangePassword = () => {
    setIsOpen(false);
    setIsChangePasswordOpen(true);
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
  };

  const handleCloseChangePassword = () => {
    setIsChangePasswordOpen(false);
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
  };

  const handleSubmitChangePassword = async () => {
    setPasswordError('');

    // 验证密码
    if (!newPassword) {
      setPasswordError('新密码不得为空');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('两次输入的密码不一致');
      return;
    }

    setPasswordLoading(true);

    changePasswordMutation.mutate(newPassword, {
      onSuccess: async () => {
        // 修改成功，关闭弹窗并登出
        setIsChangePasswordOpen(false);
        await handleLogout();
      },
      onError: (error) => {
        setPasswordError(error.message || '网络错误，请稍后重试');
      },
      onSettled: () => {
        setPasswordLoading(false);
      },
    });
  };

  const handleSettings = () => {
    setIsOpen(false);
    setIsSettingsOpen(true);
  };

  const handleCloseSettings = () => {
    setIsSettingsOpen(false);
  };

  // 检查是否显示管理面板按钮
  const showAdminPanel =
    authInfo?.role === 'owner' || authInfo?.role === 'admin';

  // 检查是否显示修改密码按钮
  const showChangePassword =
    authInfo?.role !== 'owner' && storageType !== 'localstorage';

  // 检查是否显示播放统计按钮（所有登录用户，且非localstorage存储）
  const showPlayStats = authInfo?.username && storageType !== 'localstorage';

  // 检查是否显示更新提醒按钮（登录用户且非localstorage存储就显示）
  const showWatchingUpdates = authInfo?.username && storageType !== 'localstorage';

  // 检查是否有实际更新（用于显示红点）- 只检查新剧集更新
  const hasActualUpdates = watchingUpdates && (watchingUpdates.updatedCount || 0) > 0;

  // 计算更新数量（只统计新剧集更新）
  const totalUpdates = watchingUpdates?.updatedCount || 0;

  // 调试信息
  console.log('UserMenu 更新提醒调试:', {
    username: authInfo?.username,
    storageType,
    watchingUpdates,
    showWatchingUpdates,
    hasActualUpdates,
    totalUpdates
  });

  // 角色中文映射
  const getRoleText = (role?: string) => {
    switch (role) {
      case 'owner':
        return '站长';
      case 'admin':
        return '管理员';
      case 'user':
        return '用户';
      default:
        return '';
    }
  };

  // 菜单面板内容
  const menuPanel = (
    <>
      {/* 背景遮罩 - 普通菜单无需模糊 */}
      <div
        className='fixed inset-0 bg-transparent z-1000'
        onClick={handleCloseMenu}
      />

      {/* 菜单面板 */}
      <div className='fixed top-14 right-4 w-56 bg-white dark:bg-gray-900 rounded-lg shadow-xl z-1001 border border-gray-200/50 dark:border-gray-700/50 overflow-hidden select-none'>
        {/* 用户信息区域 */}
        <div className='px-3 py-2.5 border-b border-gray-200 dark:border-gray-700 bg-linear-to-r from-gray-50 to-gray-100/50 dark:from-gray-800 dark:to-gray-800/50'>
          <div className='space-y-1'>
            <div className='flex items-center justify-between'>
              <span className='text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                当前用户
              </span>
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium ${(authInfo?.role || 'user') === 'owner'
                  ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                  : (authInfo?.role || 'user') === 'admin'
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                    : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                  }`}
              >
                {getRoleText(authInfo?.role || 'user')}
              </span>
            </div>
            <div className='flex items-center justify-between'>
              <div className='font-semibold text-gray-900 dark:text-gray-100 text-sm truncate'>
                {authInfo?.username || 'default'}
              </div>
              <div className='text-[10px] text-gray-400 dark:text-gray-500'>
                数据存储：
                {storageType === 'localstorage' ? '本地' : storageType}
              </div>
            </div>
          </div>
        </div>

        {/* 菜单项 */}
        <div className='py-1'>
          {/* 设置按钮 */}
          <button
            onClick={handleSettings}
            className='w-full px-3 py-2 text-left flex items-center gap-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-[background-color] duration-150 ease-in-out text-sm'
          >
            <Settings className='w-4 h-4 text-gray-500 dark:text-gray-400' />
            <span className='font-medium'>设置</span>
          </button>

          {/* 更新提醒按钮 */}
          {showWatchingUpdates && (
            <button
              onClick={handleWatchingUpdates}
              className='w-full px-3 py-2 text-left flex items-center gap-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-[background-color] duration-150 ease-in-out text-sm relative'
            >
              <Bell className='w-4 h-4 text-gray-500 dark:text-gray-400' />
              <span className='font-medium'>更新提醒</span>
              {hasUnreadUpdates && totalUpdates > 0 && (
                <div className='ml-auto flex items-center gap-1'>
                  <span className='inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full'>
                    {totalUpdates > 99 ? '99+' : totalUpdates}
                  </span>
                </div>
              )}
            </button>
          )}

          {/* 继续观看按钮 */}
          {showWatchingUpdates && (
            <button
              onClick={handleContinueWatching}
              className='w-full px-3 py-2 text-left flex items-center gap-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-[background-color] duration-150 ease-in-out text-sm relative'
            >
              <PlayCircle className='w-4 h-4 text-gray-500 dark:text-gray-400' />
              <span className='font-medium'>继续观看</span>
              {playRecords.length > 0 && (
                <span className='ml-auto text-xs text-gray-400'>{playRecords.length}</span>
              )}
            </button>
          )}

          {/* 我的收藏按钮 */}
          {showWatchingUpdates && (
            <button
              onClick={handleFavorites}
              className='w-full px-3 py-2 text-left flex items-center gap-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-[background-color] duration-150 ease-in-out text-sm relative'
            >
              <Heart className='w-4 h-4 text-gray-500 dark:text-gray-400' />
              <span className='font-medium'>我的收藏</span>
              {favorites.length > 0 && (
                <span className='ml-auto text-xs text-gray-400'>{favorites.length}</span>
              )}
            </button>
          )}

          {/* 管理面板按钮 */}
          {showAdminPanel && (
            <button
              onClick={handleAdminPanel}
              className='w-full px-3 py-2 text-left flex items-center gap-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-[background-color] duration-150 ease-in-out text-sm'
            >
              <Shield className='w-4 h-4 text-gray-500 dark:text-gray-400' />
              <span className='font-medium'>管理面板</span>
            </button>
          )}

          {/* 播放统计按钮 */}
          {showPlayStats && (
            <button
              onClick={handlePlayStats}
              className='w-full px-3 py-2 text-left flex items-center gap-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-[background-color] duration-150 ease-in-out text-sm'
            >
              <BarChart3 className='w-4 h-4 text-gray-500 dark:text-gray-400' />
              <span className='font-medium'>
                {authInfo?.role === 'owner' || authInfo?.role === 'admin' ? '播放统计' : '个人统计'}
              </span>
            </button>
          )}

          {/* 上映日程按钮 */}
          <button
            onClick={handleReleaseCalendar}
            className='w-full px-3 py-2 text-left flex items-center gap-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-[background-color] duration-150 ease-in-out text-sm'
          >
            <Calendar className='w-4 h-4 text-gray-500 dark:text-gray-400' />
            <span className='font-medium'>上映日程</span>
          </button>

          {/* TVBox配置按钮 */}
          <button
            onClick={handleTVBoxConfig}
            className='w-full px-3 py-2 text-left flex items-center gap-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-[background-color] duration-150 ease-in-out text-sm'
          >
            <Tv className='w-4 h-4 text-gray-500 dark:text-gray-400' />
            <span className='font-medium'>TVBox 配置</span>
          </button>

          {/* 观影室按钮 */}
          {showWatchRoom && (
            <button
              onClick={handleWatchRoom}
              className='w-full px-3 py-2 text-left flex items-center gap-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-[background-color] duration-150 ease-in-out text-sm'
            >
              <Users className='w-4 h-4 text-gray-500 dark:text-gray-400' />
              <span className='font-medium'>观影室</span>
            </button>
          )}

          {/* 下载管理按钮 */}
          {downloadEnabled && (
            <button
              onClick={() => {
                setShowDownloadPanel(true);
                handleCloseMenu();
              }}
              className='w-full px-3 py-2 text-left flex items-center gap-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-[background-color] duration-150 ease-in-out text-sm'
            >
              <Download className='w-4 h-4 text-gray-500 dark:text-gray-400' />
              <span className='font-medium'>下载管理</span>
              {tasks.filter(t => t.status === 'downloading').length > 0 && (
                <span className='ml-auto flex items-center gap-1'>
                  <span className='relative flex h-2 w-2'>
                    <span className='animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75'></span>
                    <span className='relative inline-flex rounded-full h-2 w-2 bg-green-500'></span>
                  </span>
                  <span className='text-xs text-green-600 dark:text-green-400'>
                    {tasks.filter(t => t.status === 'downloading').length}
                  </span>
                </span>
              )}
              {tasks.length > 0 && tasks.filter(t => t.status === 'downloading').length === 0 && (
                <span className='ml-auto text-xs text-gray-400'>{tasks.length}</span>
              )}
            </button>
          )}

          {/* 修改密码按钮 */}
          {showChangePassword && (
            <button
              onClick={handleChangePassword}
              className='w-full px-3 py-2 text-left flex items-center gap-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-[background-color] duration-150 ease-in-out text-sm'
            >
              <KeyRound className='w-4 h-4 text-gray-500 dark:text-gray-400' />
              <span className='font-medium'>修改密码</span>
            </button>
          )}

          {/* 分割线 */}
          <div className='my-1 border-t border-gray-200 dark:border-gray-700'></div>

          {/* 登出按钮 */}
          <button
            onClick={handleLogout}
            className='w-full px-3 py-2 text-left flex items-center gap-2.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-[background-color] duration-150 ease-in-out text-sm'
          >
            <LogOut className='w-4 h-4' />
            <span className='font-medium'>登出</span>
          </button>

          {/* 分割线 */}
          <div className='my-1 border-t border-gray-200 dark:border-gray-700'></div>

          {/* 版本信息 */}
          <button
            onClick={() => {
              setIsVersionPanelOpen(true);
              handleCloseMenu();
            }}
            className='w-full px-3 py-2 text-center flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-xs'
          >
            <div className='flex items-center gap-1'>
              <span className='font-mono'>v{CURRENT_VERSION}</span>
              {!isChecking &&
                updateStatus &&
                updateStatus !== UpdateStatus.FETCH_FAILED && (
                  <div
                    className={`w-2 h-2 rounded-full -translate-y-2 ${updateStatus === UpdateStatus.HAS_UPDATE
                      ? 'bg-yellow-500'
                      : updateStatus === UpdateStatus.NO_UPDATE
                        ? 'bg-green-400'
                        : ''
                      }`}
                  ></div>
                )}
            </div>
          </button>
        </div>
      </div>
    </>
  );

  // 修改密码面板内容
  const changePasswordPanel = (
    <>
      {/* 背景遮罩 */}
      <div
        className='fixed inset-0 bg-black/50 backdrop-blur-sm z-1000'
        onClick={handleCloseChangePassword}
        onTouchMove={(e) => {
          // 只阻止滚动，允许其他触摸事件
          e.preventDefault();
        }}
        onWheel={(e) => {
          // 阻止滚轮滚动
          e.preventDefault();
        }}
        style={{
          touchAction: 'none',
        }}
      />

      {/* 修改密码面板 */}
      <div
        className='fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white dark:bg-gray-900 rounded-xl shadow-xl z-1001 overflow-hidden'
      >
        {/* 内容容器 - 独立的滚动区域 */}
        <div
          className='h-full p-6'
          data-panel-content
          onTouchMove={(e) => {
            // 阻止事件冒泡到遮罩层，但允许内部滚动
            e.stopPropagation();
          }}
          style={{
            touchAction: 'auto', // 允许所有触摸操作
          }}
        >
          {/* 标题栏 */}
          <div className='flex items-center justify-between mb-6'>
            <h3 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
              修改密码
            </h3>
            <button
              onClick={handleCloseChangePassword}
              className='w-8 h-8 p-1 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors'
              aria-label='Close'
            >
              <X className='w-full h-full' />
            </button>
          </div>

          {/* 表单 */}
          <div className='space-y-4'>
            {/* 新密码输入 */}
            <div>
              <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
                新密码
              </label>
              <input
                type='password'
                className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400'
                placeholder='请输入新密码'
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={passwordLoading}
              />
            </div>

            {/* 确认密码输入 */}
            <div>
              <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
                确认密码
              </label>
              <input
                type='password'
                className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400'
                placeholder='请再次输入新密码'
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={passwordLoading}
              />
            </div>

            {/* 错误信息 */}
            {passwordError && (
              <div className='text-red-500 text-sm bg-red-50 dark:bg-red-900/20 p-3 rounded-md border border-red-200 dark:border-red-800'>
                {passwordError}
              </div>
            )}
          </div>

          {/* 操作按钮 */}
          <div className='flex gap-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700'>
            <button
              onClick={handleCloseChangePassword}
              className='flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors'
              disabled={passwordLoading}
            >
              取消
            </button>
            <button
              onClick={handleSubmitChangePassword}
              className='flex-1 px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
              disabled={passwordLoading || !newPassword || !confirmPassword}
            >
              {passwordLoading ? '修改中...' : '确认修改'}
            </button>
          </div>

          {/* 底部说明 */}
          <div className='mt-4 pt-4 border-t border-gray-200 dark:border-gray-700'>
            <p className='text-xs text-gray-500 dark:text-gray-400 text-center'>
              修改密码后需要重新登录
            </p>
          </div>
        </div>
      </div>
    </>
  );

  // 更新剧集海报弹窗内容
  const watchingUpdatesPanel = (
    <>
      {/* 背景遮罩 */}
      <div
        className='fixed inset-0 bg-black/50 backdrop-blur-sm z-1000'
        onClick={handleCloseWatchingUpdates}
        onTouchMove={(e) => {
          e.preventDefault();
        }}
        onWheel={(e) => {
          e.preventDefault();
        }}
        style={{
          touchAction: 'none',
        }}
      />

      {/* 更新弹窗 */}
      <div
        className='fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-4xl max-h-[90vh] bg-white dark:bg-gray-900 rounded-xl shadow-xl z-1001 flex flex-col'
      >
        {/* 内容容器 - 独立的滚动区域 */}
        <div
          className='flex-1 p-6 overflow-y-auto'
          data-panel-content
          style={{
            touchAction: 'pan-y',
            overscrollBehavior: 'contain',
          }}
        >
          {/* 标题栏 */}
          <div className='flex items-center justify-between mb-6'>
            <div className='flex items-center gap-3'>
              <h3 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
                更新提醒
              </h3>
              <div className='flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400'>
                {watchingUpdates && watchingUpdates.updatedCount > 0 && (
                  <span className='inline-flex items-center gap-1'>
                    <div className='w-2 h-2 bg-red-500 rounded-full animate-pulse'></div>
                    {watchingUpdates.updatedCount}部有新集
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={handleCloseWatchingUpdates}
              className='w-8 h-8 p-1 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors'
              aria-label='Close'
            >
              <X className='w-full h-full' />
            </button>
          </div>

          {/* 更新列表 */}
          <div className='space-y-8'>
            {/* 没有更新时的提示 */}
            {!hasActualUpdates && (
              <div className='text-center py-8'>
                <div className='text-gray-500 dark:text-gray-400 text-sm'>
                  暂无新剧集更新
                </div>
                <div className='text-xs text-gray-400 dark:text-gray-500 mt-2'>
                  系统会定期检查您观看过的剧集是否有新集数更新
                </div>
              </div>
            )}
            {/* 有新集数的剧集 */}
            {watchingUpdates && watchingUpdates.updatedSeries.filter(series => series.hasNewEpisode).length > 0 && (
              <div>
                <div className='flex items-center gap-2 mb-4'>
                  <h4 className='text-lg font-semibold text-gray-900 dark:text-white'>
                    新集更新
                  </h4>
                  <div className='flex items-center gap-1'>
                    <div className='w-2 h-2 bg-red-500 rounded-full animate-pulse'></div>
                    <span className='text-sm text-red-500 font-medium'>
                      {watchingUpdates.updatedSeries.filter(series => series.hasNewEpisode).length}部剧集有更新
                    </span>
                  </div>
                </div>

                <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4'>
                  {watchingUpdates.updatedSeries
                    .filter(series => series.hasNewEpisode)
                    .map((series, index) => (
                      <div key={`new-${series.title}_${series.year}_${index}`} className='relative group/card'>
                        <div className='relative group-hover/card:z-5 transition-all duration-300'>
                          <VideoCard
                            title={series.title}
                            poster={series.cover}
                            year={series.year}
                            source={series.sourceKey}
                            source_name={series.source_name}
                            episodes={series.totalEpisodes}
                            currentEpisode={series.currentEpisode}
                            id={series.videoId}
                            onDelete={undefined}
                            type={series.totalEpisodes > 1 ? 'tv' : ''}
                            from="playrecord"
                          />
                        </div>
                        {/* 新集数徽章 - Netflix 统一风格 */}
                        <div className='absolute -top-2 -right-2 bg-red-600 text-white text-xs px-2 py-0.5 rounded-md shadow-lg animate-pulse z-10 font-bold'>
                          +{series.newEpisodes}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

          </div>

          {/* 底部说明 */}
          <div className='mt-6 pt-4 border-t border-gray-200 dark:border-gray-700'>
            <p className='text-xs text-gray-500 dark:text-gray-400 text-center'>
              点击海报即可观看新更新的剧集
            </p>
          </div>
        </div>
      </div>
    </>
  );

  // 继续观看弹窗内容
  const continueWatchingPanel = (
    <>
      {/* 背景遮罩 */}
      <div
        className='fixed inset-0 bg-black/50 backdrop-blur-sm z-1000'
        onClick={handleCloseContinueWatching}
        onTouchMove={(e) => {
          e.preventDefault();
        }}
        onWheel={(e) => {
          e.preventDefault();
        }}
        style={{
          touchAction: 'none',
        }}
      />

      {/* 继续观看弹窗 */}
      <div
        className='fixed inset-x-4 top-1/2 transform -translate-y-1/2 max-w-4xl mx-auto bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 z-1001 max-h-[80vh] overflow-y-auto'
        onClick={(e) => e.stopPropagation()}
      >
        <div className='p-6'>
          <div className='flex items-center justify-between mb-4'>
            <h3 className='text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2'>
              <PlayCircle className='w-6 h-6 text-blue-500' />
              继续观看
            </h3>
            <button
              onClick={handleCloseContinueWatching}
              className='p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors'
            >
              <X className='w-5 h-5' />
            </button>
          </div>

          {/* 播放记录网格 */}
          <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4'>
            {playRecords.map((record) => {
              const { source, id } = parseKey(record.key);
              const newEpisodesCount = getNewEpisodesCount(record);
              return (
                <div key={record.key} className='relative group/card'>
                  <div className='relative group-hover/card:z-5 transition-all duration-300'>
                    <VideoCard
                      id={id}
                      title={record.title}
                      poster={record.cover}
                      year={record.year}
                      source={source}
                      source_name={record.source_name}
                      progress={getProgress(record)}
                      episodes={record.total_episodes}
                      currentEpisode={record.index}
                      query={record.search_title}
                      from='playrecord'
                      type={record.total_episodes > 1 ? 'tv' : ''}
                      remarks={record.remarks}
                    />
                  </div>
                  {/* 新集数徽章 - Netflix 统一风格 */}
                  {newEpisodesCount > 0 && (
                    <div className='absolute -top-2 -right-2 bg-red-600 text-white text-xs px-2 py-0.5 rounded-md shadow-lg animate-pulse z-10 font-bold'>
                      +{newEpisodesCount}
                    </div>
                  )}
                  {/* 进度指示器 */}
                  {getProgress(record) > 0 && (
                    <div className='absolute bottom-2 left-2 right-2 bg-black/50 rounded px-2 py-1'>
                      <div className='flex items-center gap-1'>
                        <div className='flex-1 bg-gray-600 rounded-full h-1'>
                          <div
                            className='bg-blue-500 h-1 rounded-full transition-all'
                            style={{ width: `${Math.min(getProgress(record), 100)}%` }}
                          />
                        </div>
                        <span className='text-xs text-white font-medium'>
                          {Math.round(getProgress(record))}%
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 空状态 */}
          {playRecords.length === 0 && (
            <div className='text-center py-12'>
              <PlayCircle className='w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4' />
              <p className='text-gray-500 dark:text-gray-400 mb-2'>暂无需要继续观看的内容</p>
              <p className='text-xs text-gray-400 dark:text-gray-500'>
                {enableContinueWatchingFilter
                  ? `观看进度在${continueWatchingMinProgress}%-${continueWatchingMaxProgress}%之间且播放时间超过2分钟的内容会显示在这里`
                  : '播放时间超过2分钟的所有内容都会显示在这里'
                }
              </p>
            </div>
          )}

          {/* 底部说明 */}
          <div className='mt-6 pt-4 border-t border-gray-200 dark:border-gray-700'>
            <p className='text-xs text-gray-500 dark:text-gray-400 text-center'>
              点击海报即可继续观看
            </p>
          </div>
        </div>
      </div>
    </>
  );

  // 我的收藏弹窗内容
  const favoritesPanel = (
    <>
      {/* 背景遮罩 */}
      <div
        className='fixed inset-0 bg-black/50 backdrop-blur-sm z-1000'
        onClick={handleCloseFavorites}
        onTouchMove={(e) => {
          e.preventDefault();
        }}
        onWheel={(e) => {
          e.preventDefault();
        }}
        style={{
          touchAction: 'none',
        }}
      />

      {/* 收藏弹窗 */}
      <div
        className='fixed inset-x-4 top-1/2 transform -translate-y-1/2 max-w-4xl mx-auto bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 z-1001 max-h-[80vh] overflow-y-auto'
        onClick={(e) => e.stopPropagation()}
      >
        <div className='p-6'>
          <div className='flex items-center justify-between mb-4'>
            <h3 className='text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2'>
              <Heart className='w-6 h-6 text-red-500' />
              我的收藏
            </h3>
            <button
              onClick={handleCloseFavorites}
              className='p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors'
            >
              <X className='w-5 h-5' />
            </button>
          </div>

          {/* 收藏网格 */}
          <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4'>
            {favorites.map((favorite) => {
              const { source, id } = parseKey(favorite.key);

              // 智能计算即将上映状态
              let calculatedRemarks = favorite.remarks;
              let isNewRelease = false;

              if (favorite.releaseDate) {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const releaseDate = new Date(favorite.releaseDate);
                const daysDiff = Math.ceil((releaseDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

                // 根据天数差异动态更新显示文字
                if (daysDiff < 0) {
                  const daysAgo = Math.abs(daysDiff);
                  calculatedRemarks = `已上映${daysAgo}天`;
                  // 7天内上映的标记为新上映
                  if (daysAgo <= 7) {
                    isNewRelease = true;
                  }
                } else if (daysDiff === 0) {
                  calculatedRemarks = '今日上映';
                  isNewRelease = true;
                } else {
                  calculatedRemarks = `${daysDiff}天后上映`;
                }
              }

              return (
                <div key={favorite.key} className='relative'>
                  <VideoCard
                    id={id}
                    title={favorite.title}
                    poster={favorite.cover}
                    year={favorite.year}
                    source={source}
                    source_name={favorite.source_name}
                    episodes={favorite.total_episodes}
                    query={favorite.search_title}
                    from='favorite'
                    type={favorite.total_episodes > 1 ? 'tv' : ''}
                    remarks={calculatedRemarks}
                    releaseDate={favorite.releaseDate}
                  />
                  {/* 收藏心形图标 - 隐藏，使用VideoCard内部的hover爱心 */}
                  {/* 新上映高亮标记 - Netflix 统一风格 - 7天内上映的显示 */}
                  {isNewRelease && (
                    <div className='absolute top-2 left-2 bg-orange-500 text-white text-xs font-bold px-3 py-1 rounded-md shadow-lg animate-pulse z-40'>
                      新上映
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 空状态 */}
          {favorites.length === 0 && (
            <div className='text-center py-12'>
              <Heart className='w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4' />
              <p className='text-gray-500 dark:text-gray-400 mb-2'>暂无收藏</p>
              <p className='text-xs text-gray-400 dark:text-gray-500'>
                在详情页点击收藏按钮即可添加收藏
              </p>
            </div>
          )}

          {/* 底部说明 */}
          <div className='mt-6 pt-4 border-t border-gray-200 dark:border-gray-700'>
            <p className='text-xs text-gray-500 dark:text-gray-400 text-center'>
              点击海报即可进入详情页面
            </p>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      <div className='relative'>
        <button
          onClick={handleMenuClick}
          className='relative w-10 h-10 p-2 rounded-full flex items-center justify-center text-gray-600 hover:text-blue-500 dark:text-gray-300 dark:hover:text-blue-400 transition-all duration-300 hover:scale-110 hover:shadow-lg hover:shadow-blue-500/30 dark:hover:shadow-blue-400/30 group'
          aria-label='User Menu'
        >
          {/* 微光背景效果 */}
          <div className='absolute inset-0 rounded-full bg-linear-to-br from-blue-400/0 to-purple-600/0 group-hover:from-blue-400/20 group-hover:to-purple-600/20 dark:group-hover:from-blue-300/20 dark:group-hover:to-purple-500/20 transition-all duration-300'></div>

          <User className='w-full h-full relative z-10 group-hover:scale-110 transition-transform duration-300' />
        </button>
        {/* 统一更新提醒点：版本更新或剧集更新都显示橙色点 */}
        {((updateStatus === UpdateStatus.HAS_UPDATE) || (hasUnreadUpdates && totalUpdates > 0)) && (
          <div className='absolute top-[2px] right-[2px] w-2 h-2 bg-yellow-500 rounded-full animate-pulse shadow-lg shadow-yellow-500/50'></div>
        )}
      </div>

      {/* 使用 Portal 将菜单面板渲染到 document.body */}
      {isOpen && mounted && createPortal(menuPanel, document.body)}

      {/* 使用 Portal 将设置面板渲染到 document.body */}
      {isSettingsOpen && mounted && (
        <SettingsPanel isOpen={isSettingsOpen} onClose={handleCloseSettings} />
      )}

      {/* 使用 Portal 将修改密码面板渲染到 document.body */}
      {isChangePasswordOpen &&
        mounted &&
        createPortal(changePasswordPanel, document.body)}

      {/* 使用 Portal 将更新提醒面板渲染到 document.body */}
      {isWatchingUpdatesOpen &&
        mounted &&
        createPortal(watchingUpdatesPanel, document.body)}

      {/* 使用 Portal 将继续观看面板渲染到 document.body */}
      {isContinueWatchingOpen &&
        mounted &&
        createPortal(continueWatchingPanel, document.body)}

      {/* 使用 Portal 将我的收藏面板渲染到 document.body */}
      {isFavoritesOpen &&
        mounted &&
        createPortal(favoritesPanel, document.body)}

      {/* 版本面板 */}
      <VersionPanel
        isOpen={isVersionPanelOpen}
        onClose={() => setIsVersionPanelOpen(false)}
      />
    </>
  );
};
