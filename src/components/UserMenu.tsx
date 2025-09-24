/* eslint-disable no-console,@typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion */

'use client';

import {
  BarChart3,
  Bell,
  Calendar,
  Check,
  ChevronDown,
  ExternalLink,
  Heart,
  KeyRound,
  LogOut,
  PlayCircle,
  Settings,
  Shield,
  Tv,
  User,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { getAuthInfoFromBrowserCookie } from '@/lib/auth';
import { CURRENT_VERSION } from '@/lib/version';
import { checkForUpdates, UpdateStatus } from '@/lib/version_check';
import {
  getCachedWatchingUpdates,
  getDetailedWatchingUpdates,
  subscribeToWatchingUpdatesEvent,
  type WatchingUpdate,
} from '@/lib/watching-updates';
import {
  getAllPlayRecords,
  type PlayRecord,
} from '@/lib/db.client';
import type { Favorite } from '@/lib/types';

import { VersionPanel } from './VersionPanel';
import VideoCard from './VideoCard';

interface AuthInfo {
  username?: string;
  role?: 'owner' | 'admin' | 'user';
}

export const UserMenu: React.FC = () => {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [isVersionPanelOpen, setIsVersionPanelOpen] = useState(false);
  const [isWatchingUpdatesOpen, setIsWatchingUpdatesOpen] = useState(false);
  const [isContinueWatchingOpen, setIsContinueWatchingOpen] = useState(false);
  const [isFavoritesOpen, setIsFavoritesOpen] = useState(false);
  const [authInfo, setAuthInfo] = useState<AuthInfo | null>(null);
  const [storageType, setStorageType] = useState<string>('localstorage');
  const [mounted, setMounted] = useState(false);
  const [watchingUpdates, setWatchingUpdates] = useState<WatchingUpdate | null>(null);
  const [playRecords, setPlayRecords] = useState<(PlayRecord & { key: string })[]>([]);
  const [favorites, setFavorites] = useState<(Favorite & { key: string })[]>([]);
  const [hasUnreadUpdates, setHasUnreadUpdates] = useState(false);

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

  // 设置相关状态
  const [defaultAggregateSearch, setDefaultAggregateSearch] = useState(true);
  const [doubanProxyUrl, setDoubanProxyUrl] = useState('');
  const [enableOptimization, setEnableOptimization] = useState(false);
  const [fluidSearch, setFluidSearch] = useState(true);
  const [liveDirectConnect, setLiveDirectConnect] = useState(false);
  const [doubanDataSource, setDoubanDataSource] = useState('direct');
  const [doubanImageProxyType, setDoubanImageProxyType] = useState('direct');
  const [doubanImageProxyUrl, setDoubanImageProxyUrl] = useState('');
  const [isDoubanDropdownOpen, setIsDoubanDropdownOpen] = useState(false);
  const [isDoubanImageProxyDropdownOpen, setIsDoubanImageProxyDropdownOpen] =
    useState(false);

  // 豆瓣数据源选项
  const doubanDataSourceOptions = [
    { value: 'direct', label: '直连（服务器直接请求豆瓣）' },
    { value: 'cors-proxy-zwei', label: 'Cors Proxy By Zwei' },
    {
      value: 'cmliussss-cdn-tencent',
      label: '豆瓣 CDN By CMLiussss（腾讯云）',
    },
    { value: 'cmliussss-cdn-ali', label: '豆瓣 CDN By CMLiussss（阿里云）' },
    { value: 'custom', label: '自定义代理' },
  ];

  // 豆瓣图片代理选项
  const doubanImageProxyTypeOptions = [
    { value: 'direct', label: '直连（浏览器直接请求豆瓣）' },
    { value: 'server', label: '服务器代理（由服务器代理请求豆瓣）' },
    { value: 'img3', label: '豆瓣官方精品 CDN（阿里云）' },
    {
      value: 'cmliussss-cdn-tencent',
      label: '豆瓣 CDN By CMLiussss（腾讯云）',
    },
    { value: 'cmliussss-cdn-ali', label: '豆瓣 CDN By CMLiussss（阿里云）' },
    { value: 'custom', label: '自定义代理' },
  ];

  // 修改密码相关状态
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  // 版本检查相关状态
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  // 确保组件已挂载
  useEffect(() => {
    setMounted(true);
  }, []);

  // 获取认证信息和存储类型
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const auth = getAuthInfoFromBrowserCookie();
      setAuthInfo(auth);

      const type =
        (window as any).RUNTIME_CONFIG?.STORAGE_TYPE || 'localstorage';
      setStorageType(type);
    }
  }, []);

  // 从 localStorage 读取设置
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedAggregateSearch = localStorage.getItem(
        'defaultAggregateSearch'
      );
      if (savedAggregateSearch !== null) {
        setDefaultAggregateSearch(JSON.parse(savedAggregateSearch));
      }

      const savedDoubanDataSource = localStorage.getItem('doubanDataSource');
      const defaultDoubanProxyType =
        (window as any).RUNTIME_CONFIG?.DOUBAN_PROXY_TYPE || 'direct';
      if (savedDoubanDataSource !== null) {
        setDoubanDataSource(savedDoubanDataSource);
      } else if (defaultDoubanProxyType) {
        setDoubanDataSource(defaultDoubanProxyType);
      }

      const savedDoubanProxyUrl = localStorage.getItem('doubanProxyUrl');
      const defaultDoubanProxy =
        (window as any).RUNTIME_CONFIG?.DOUBAN_PROXY || '';
      if (savedDoubanProxyUrl !== null) {
        setDoubanProxyUrl(savedDoubanProxyUrl);
      } else if (defaultDoubanProxy) {
        setDoubanProxyUrl(defaultDoubanProxy);
      }

      const savedDoubanImageProxyType = localStorage.getItem(
        'doubanImageProxyType'
      );
      const defaultDoubanImageProxyType =
        (window as any).RUNTIME_CONFIG?.DOUBAN_IMAGE_PROXY_TYPE || 'direct';
      if (savedDoubanImageProxyType !== null) {
        setDoubanImageProxyType(savedDoubanImageProxyType);
      } else if (defaultDoubanImageProxyType) {
        setDoubanImageProxyType(defaultDoubanImageProxyType);
      }

      const savedDoubanImageProxyUrl = localStorage.getItem(
        'doubanImageProxyUrl'
      );
      const defaultDoubanImageProxyUrl =
        (window as any).RUNTIME_CONFIG?.DOUBAN_IMAGE_PROXY || '';
      if (savedDoubanImageProxyUrl !== null) {
        setDoubanImageProxyUrl(savedDoubanImageProxyUrl);
      } else if (defaultDoubanImageProxyUrl) {
        setDoubanImageProxyUrl(defaultDoubanImageProxyUrl);
      }

      const savedEnableOptimization =
        localStorage.getItem('enableOptimization');
      if (savedEnableOptimization !== null) {
        setEnableOptimization(JSON.parse(savedEnableOptimization));
      }

      const savedFluidSearch = localStorage.getItem('fluidSearch');
      const defaultFluidSearch =
        (window as any).RUNTIME_CONFIG?.FLUID_SEARCH !== false;
      if (savedFluidSearch !== null) {
        setFluidSearch(JSON.parse(savedFluidSearch));
      } else if (defaultFluidSearch !== undefined) {
        setFluidSearch(defaultFluidSearch);
      }

      const savedLiveDirectConnect = localStorage.getItem('liveDirectConnect');
      if (savedLiveDirectConnect !== null) {
        setLiveDirectConnect(JSON.parse(savedLiveDirectConnect));
      }
    }
  }, []);

  // 版本检查
  useEffect(() => {
    const checkUpdate = async () => {
      try {
        const status = await checkForUpdates();
        setUpdateStatus(status);
      } catch (error) {
        console.warn('版本检查失败:', error);
      } finally {
        setIsChecking(false);
      }
    };

    checkUpdate();
  }, []);

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

        // 检测是否有新更新
        if (updates && ((updates.updatedCount || 0) > 0 || (updates.continueWatchingCount || 0) > 0)) {
          const lastViewed = parseInt(localStorage.getItem('watchingUpdatesLastViewed') || '0');
          const currentTime = Date.now();

          // 如果从未查看过，或者距离上次查看超过1分钟，认为有新更新
          const hasNewUpdates = lastViewed === 0 || (currentTime - lastViewed > 60000);
          setHasUnreadUpdates(hasNewUpdates);
        } else {
          setHasUnreadUpdates(false);
        }
      };

      // 初始加载
      updateWatchingUpdates();

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

  // 加载播放记录（优化版）
  useEffect(() => {
    if (typeof window !== 'undefined' && authInfo?.username && storageType !== 'localstorage') {
      const loadPlayRecords = async () => {
        try {
          const records = await getAllPlayRecords();
          const recordsArray = Object.entries(records).map(([key, record]) => ({
            ...record,
            key,
          }));

          // 筛选真正需要继续观看的记录
          const validPlayRecords = recordsArray.filter(record => {
            const progress = getProgress(record);
            // 进度在5%-95%之间，且播放时间超过2分钟才算有效记录
            return progress >= 5 && progress <= 95 && record.play_time >= 120;
          });

          // 按最后播放时间降序排列
          const sortedRecords = validPlayRecords.sort((a, b) => b.save_time - a.save_time);
          setPlayRecords(sortedRecords.slice(0, 12)); // 只取最近的12个
        } catch (error) {
          console.error('加载播放记录失败:', error);
        }
      };
      loadPlayRecords();
    }
  }, [authInfo, storageType]);

  // 加载收藏数据
  useEffect(() => {
    if (typeof window !== 'undefined' && authInfo?.username && storageType !== 'localstorage') {
      const loadFavorites = async () => {
        try {
          const response = await fetch('/api/favorites');
          if (response.ok) {
            const favoritesData = await response.json() as Record<string, Favorite>;
            const favoritesArray = Object.entries(favoritesData).map(([key, favorite]) => ({
              ...(favorite as Favorite),
              key,
            }));
            // 按保存时间降序排列
            const sortedFavorites = favoritesArray.sort((a, b) => b.save_time - a.save_time);
            setFavorites(sortedFavorites);
          }
        } catch (error) {
          console.error('加载收藏失败:', error);
        }
      };
      loadFavorites();
    }
  }, [authInfo, storageType]);

  // 点击外部区域关闭下拉框
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isDoubanDropdownOpen) {
        const target = event.target as Element;
        if (!target.closest('[data-dropdown="douban-datasource"]')) {
          setIsDoubanDropdownOpen(false);
        }
      }
    };

    if (isDoubanDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () =>
        document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isDoubanDropdownOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isDoubanImageProxyDropdownOpen) {
        const target = event.target as Element;
        if (!target.closest('[data-dropdown="douban-image-proxy"]')) {
          setIsDoubanImageProxyDropdownOpen(false);
        }
      }
    };

    if (isDoubanImageProxyDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () =>
        document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isDoubanImageProxyDropdownOpen]);

  const handleMenuClick = () => {
    setIsOpen(!isOpen);
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
    router.push('/admin');
  };

  const handlePlayStats = () => {
    setIsOpen(false);
    router.push('/play-stats');
  };

  const handleTVBoxConfig = () => {
    setIsOpen(false);
    router.push('/tvbox');
  };

  const handleReleaseCalendar = () => {
    setIsOpen(false);
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

    try {
      const response = await fetch('/api/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          newPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setPasswordError(data.error || '修改密码失败');
        return;
      }

      // 修改成功，关闭弹窗并登出
      setIsChangePasswordOpen(false);
      await handleLogout();
    } catch (error) {
      setPasswordError('网络错误，请稍后重试');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleSettings = () => {
    setIsOpen(false);
    setIsSettingsOpen(true);
  };

  const handleCloseSettings = () => {
    setIsSettingsOpen(false);
  };

  // 设置相关的处理函数
  const handleAggregateToggle = (value: boolean) => {
    setDefaultAggregateSearch(value);
    if (typeof window !== 'undefined') {
      localStorage.setItem('defaultAggregateSearch', JSON.stringify(value));
    }
  };

  const handleDoubanProxyUrlChange = (value: string) => {
    setDoubanProxyUrl(value);
    if (typeof window !== 'undefined') {
      localStorage.setItem('doubanProxyUrl', value);
    }
  };

  const handleOptimizationToggle = (value: boolean) => {
    setEnableOptimization(value);
    if (typeof window !== 'undefined') {
      localStorage.setItem('enableOptimization', JSON.stringify(value));
    }
  };

  const handleFluidSearchToggle = (value: boolean) => {
    setFluidSearch(value);
    if (typeof window !== 'undefined') {
      localStorage.setItem('fluidSearch', JSON.stringify(value));
    }
  };

  const handleLiveDirectConnectToggle = (value: boolean) => {
    setLiveDirectConnect(value);
    if (typeof window !== 'undefined') {
      localStorage.setItem('liveDirectConnect', JSON.stringify(value));
    }
  };

  const handleDoubanDataSourceChange = (value: string) => {
    setDoubanDataSource(value);
    if (typeof window !== 'undefined') {
      localStorage.setItem('doubanDataSource', value);
    }
  };

  const handleDoubanImageProxyTypeChange = (value: string) => {
    setDoubanImageProxyType(value);
    if (typeof window !== 'undefined') {
      localStorage.setItem('doubanImageProxyType', value);
    }
  };

  const handleDoubanImageProxyUrlChange = (value: string) => {
    setDoubanImageProxyUrl(value);
    if (typeof window !== 'undefined') {
      localStorage.setItem('doubanImageProxyUrl', value);
    }
  };

  // 获取感谢信息
  const getThanksInfo = (dataSource: string) => {
    switch (dataSource) {
      case 'cors-proxy-zwei':
        return {
          text: 'Thanks to @Zwei',
          url: 'https://github.com/bestzwei',
        };
      case 'cmliussss-cdn-tencent':
      case 'cmliussss-cdn-ali':
        return {
          text: 'Thanks to @CMLiussss',
          url: 'https://github.com/cmliu',
        };
      default:
        return null;
    }
  };

  const handleResetSettings = () => {
    const defaultDoubanProxyType =
      (window as any).RUNTIME_CONFIG?.DOUBAN_PROXY_TYPE || 'direct';
    const defaultDoubanProxy =
      (window as any).RUNTIME_CONFIG?.DOUBAN_PROXY || '';
    const defaultDoubanImageProxyType =
      (window as any).RUNTIME_CONFIG?.DOUBAN_IMAGE_PROXY_TYPE || 'direct';
    const defaultDoubanImageProxyUrl =
      (window as any).RUNTIME_CONFIG?.DOUBAN_IMAGE_PROXY || '';
    const defaultFluidSearch =
      (window as any).RUNTIME_CONFIG?.FLUID_SEARCH !== false;

    setDefaultAggregateSearch(true);
    setEnableOptimization(false);
    setFluidSearch(defaultFluidSearch);
    setLiveDirectConnect(false);
    setDoubanProxyUrl(defaultDoubanProxy);
    setDoubanDataSource(defaultDoubanProxyType);
    setDoubanImageProxyType(defaultDoubanImageProxyType);
    setDoubanImageProxyUrl(defaultDoubanImageProxyUrl);

    if (typeof window !== 'undefined') {
      localStorage.setItem('defaultAggregateSearch', JSON.stringify(true));
      localStorage.setItem('enableOptimization', JSON.stringify(false));
      localStorage.setItem('fluidSearch', JSON.stringify(defaultFluidSearch));
      localStorage.setItem('liveDirectConnect', JSON.stringify(false));
      localStorage.setItem('doubanProxyUrl', defaultDoubanProxy);
      localStorage.setItem('doubanDataSource', defaultDoubanProxyType);
      localStorage.setItem('doubanImageProxyType', defaultDoubanImageProxyType);
      localStorage.setItem('doubanImageProxyUrl', defaultDoubanImageProxyUrl);
    }
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

  // 检查是否有实际更新（用于显示红点）
  const hasActualUpdates = watchingUpdates &&
    ((watchingUpdates.updatedCount || 0) > 0 || (watchingUpdates.continueWatchingCount || 0) > 0);

  // 计算更新数量
  const totalUpdates = (watchingUpdates?.updatedCount || 0) + (watchingUpdates?.continueWatchingCount || 0);

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
        className='fixed inset-0 bg-transparent z-[1000]'
        onClick={handleCloseMenu}
      />

      {/* 菜单面板 */}
      <div className='fixed top-14 right-4 w-56 bg-white dark:bg-gray-900 rounded-lg shadow-xl z-[1001] border border-gray-200/50 dark:border-gray-700/50 overflow-hidden select-none'>
        {/* 用户信息区域 */}
        <div className='px-3 py-2.5 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-gray-50 to-gray-100/50 dark:from-gray-800 dark:to-gray-800/50'>
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
            className='w-full px-3 py-2 text-left flex items-center gap-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm'
          >
            <Settings className='w-4 h-4 text-gray-500 dark:text-gray-400' />
            <span className='font-medium'>设置</span>
          </button>

          {/* 更新提醒按钮 */}
          {showWatchingUpdates && (
            <button
              onClick={handleWatchingUpdates}
              className='w-full px-3 py-2 text-left flex items-center gap-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm relative'
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
              className='w-full px-3 py-2 text-left flex items-center gap-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm relative'
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
              className='w-full px-3 py-2 text-left flex items-center gap-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm relative'
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
              className='w-full px-3 py-2 text-left flex items-center gap-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm'
            >
              <Shield className='w-4 h-4 text-gray-500 dark:text-gray-400' />
              <span className='font-medium'>管理面板</span>
            </button>
          )}

          {/* 播放统计按钮 */}
          {showPlayStats && (
            <button
              onClick={handlePlayStats}
              className='w-full px-3 py-2 text-left flex items-center gap-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm'
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
            className='w-full px-3 py-2 text-left flex items-center gap-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm'
          >
            <Calendar className='w-4 h-4 text-gray-500 dark:text-gray-400' />
            <span className='font-medium'>上映日程</span>
          </button>

          {/* TVBox配置按钮 */}
          <button
            onClick={handleTVBoxConfig}
            className='w-full px-3 py-2 text-left flex items-center gap-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm'
          >
            <Tv className='w-4 h-4 text-gray-500 dark:text-gray-400' />
            <span className='font-medium'>TVBox 配置</span>
          </button>

          {/* 修改密码按钮 */}
          {showChangePassword && (
            <button
              onClick={handleChangePassword}
              className='w-full px-3 py-2 text-left flex items-center gap-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm'
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
            className='w-full px-3 py-2 text-left flex items-center gap-2.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-sm'
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

  // 设置面板内容
  const settingsPanel = (
    <>
      {/* 背景遮罩 */}
      <div
        className='fixed inset-0 bg-black/50 backdrop-blur-sm z-[1000]'
        onClick={handleCloseSettings}
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

      {/* 设置面板 */}
      <div
        className='fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-xl max-h-[90vh] bg-white dark:bg-gray-900 rounded-xl shadow-xl z-[1001] flex flex-col'
      >
        {/* 内容容器 - 独立的滚动区域 */}
        <div
          className='flex-1 p-6 overflow-y-auto'
          data-panel-content
          style={{
            touchAction: 'pan-y', // 只允许垂直滚动
            overscrollBehavior: 'contain', // 防止滚动冒泡
          }}
        >
          {/* 标题栏 */}
          <div className='flex items-center justify-between mb-6'>
            <div className='flex items-center gap-3'>
              <h3 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
                本地设置
              </h3>
              <button
                onClick={handleResetSettings}
                className='px-2 py-1 text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 border border-red-200 hover:border-red-300 dark:border-red-800 dark:hover:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors'
                title='重置为默认设置'
              >
                恢复默认
              </button>
            </div>
            <button
              onClick={handleCloseSettings}
              className='w-8 h-8 p-1 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors'
              aria-label='Close'
            >
              <X className='w-full h-full' />
            </button>
          </div>

          {/* 设置项 */}
          <div className='space-y-6'>
            {/* 豆瓣数据源选择 */}
            <div className='space-y-3'>
              <div>
                <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                  豆瓣数据代理
                </h4>
                <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                  选择获取豆瓣数据的方式
                </p>
              </div>
              <div className='relative' data-dropdown='douban-datasource'>
                {/* 自定义下拉选择框 */}
                <button
                  type='button'
                  onClick={() => setIsDoubanDropdownOpen(!isDoubanDropdownOpen)}
                  className='w-full px-3 py-2.5 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm hover:border-gray-400 dark:hover:border-gray-500 text-left'
                >
                  {
                    doubanDataSourceOptions.find(
                      (option) => option.value === doubanDataSource
                    )?.label
                  }
                </button>

                {/* 下拉箭头 */}
                <div className='absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none'>
                  <ChevronDown
                    className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform duration-200 ${isDoubanDropdownOpen ? 'rotate-180' : ''
                      }`}
                  />
                </div>

                {/* 下拉选项列表 */}
                {isDoubanDropdownOpen && (
                  <div className='absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-auto'>
                    {doubanDataSourceOptions.map((option) => (
                      <button
                        key={option.value}
                        type='button'
                        onClick={() => {
                          handleDoubanDataSourceChange(option.value);
                          setIsDoubanDropdownOpen(false);
                        }}
                        className={`w-full px-3 py-2.5 text-left text-sm transition-colors duration-150 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-700 ${doubanDataSource === option.value
                          ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400'
                          : 'text-gray-900 dark:text-gray-100'
                          }`}
                      >
                        <span className='truncate'>{option.label}</span>
                        {doubanDataSource === option.value && (
                          <Check className='w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0 ml-2' />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 感谢信息 */}
              {getThanksInfo(doubanDataSource) && (
                <div className='mt-3'>
                  <button
                    type='button'
                    onClick={() =>
                      window.open(getThanksInfo(doubanDataSource)!.url, '_blank')
                    }
                    className='flex items-center justify-center gap-1.5 w-full px-3 text-xs text-gray-500 dark:text-gray-400 cursor-pointer'
                  >
                    <span className='font-medium'>
                      {getThanksInfo(doubanDataSource)!.text}
                    </span>
                    <ExternalLink className='w-3.5 opacity-70' />
                  </button>
                </div>
              )}
            </div>

            {/* 豆瓣代理地址设置 - 仅在选择自定义代理时显示 */}
            {doubanDataSource === 'custom' && (
              <div className='space-y-3'>
                <div>
                  <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                    豆瓣代理地址
                  </h4>
                  <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                    自定义代理服务器地址
                  </p>
                </div>
                <input
                  type='text'
                  className='w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 shadow-sm hover:border-gray-400 dark:hover:border-gray-500'
                  placeholder='例如: https://proxy.example.com/fetch?url='
                  value={doubanProxyUrl}
                  onChange={(e) => handleDoubanProxyUrlChange(e.target.value)}
                />
              </div>
            )}

            {/* 分割线 */}
            <div className='border-t border-gray-200 dark:border-gray-700'></div>

            {/* 豆瓣图片代理设置 */}
            <div className='space-y-3'>
              <div>
                <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                  豆瓣图片代理
                </h4>
                <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                  选择获取豆瓣图片的方式
                </p>
              </div>
              <div className='relative' data-dropdown='douban-image-proxy'>
                {/* 自定义下拉选择框 */}
                <button
                  type='button'
                  onClick={() =>
                    setIsDoubanImageProxyDropdownOpen(
                      !isDoubanImageProxyDropdownOpen
                    )
                  }
                  className='w-full px-3 py-2.5 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm hover:border-gray-400 dark:hover:border-gray-500 text-left'
                >
                  {
                    doubanImageProxyTypeOptions.find(
                      (option) => option.value === doubanImageProxyType
                    )?.label
                  }
                </button>

                {/* 下拉箭头 */}
                <div className='absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none'>
                  <ChevronDown
                    className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform duration-200 ${isDoubanDropdownOpen ? 'rotate-180' : ''
                      }`}
                  />
                </div>

                {/* 下拉选项列表 */}
                {isDoubanImageProxyDropdownOpen && (
                  <div className='absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-auto'>
                    {doubanImageProxyTypeOptions.map((option) => (
                      <button
                        key={option.value}
                        type='button'
                        onClick={() => {
                          handleDoubanImageProxyTypeChange(option.value);
                          setIsDoubanImageProxyDropdownOpen(false);
                        }}
                        className={`w-full px-3 py-2.5 text-left text-sm transition-colors duration-150 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-700 ${doubanImageProxyType === option.value
                          ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400'
                          : 'text-gray-900 dark:text-gray-100'
                          }`}
                      >
                        <span className='truncate'>{option.label}</span>
                        {doubanImageProxyType === option.value && (
                          <Check className='w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0 ml-2' />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 感谢信息 */}
              {getThanksInfo(doubanImageProxyType) && (
                <div className='mt-3'>
                  <button
                    type='button'
                    onClick={() =>
                      window.open(
                        getThanksInfo(doubanImageProxyType)!.url,
                        '_blank'
                      )
                    }
                    className='flex items-center justify-center gap-1.5 w-full px-3 text-xs text-gray-500 dark:text-gray-400 cursor-pointer'
                  >
                    <span className='font-medium'>
                      {getThanksInfo(doubanImageProxyType)!.text}
                    </span>
                    <ExternalLink className='w-3.5 opacity-70' />
                  </button>
                </div>
              )}
            </div>

            {/* 豆瓣图片代理地址设置 - 仅在选择自定义代理时显示 */}
            {doubanImageProxyType === 'custom' && (
              <div className='space-y-3'>
                <div>
                  <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                    豆瓣图片代理地址
                  </h4>
                  <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                    自定义图片代理服务器地址
                  </p>
                </div>
                <input
                  type='text'
                  className='w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 shadow-sm hover:border-gray-400 dark:hover:border-gray-500'
                  placeholder='例如: https://proxy.example.com/fetch?url='
                  value={doubanImageProxyUrl}
                  onChange={(e) =>
                    handleDoubanImageProxyUrlChange(e.target.value)
                  }
                />
              </div>
            )}

            {/* 分割线 */}
            <div className='border-t border-gray-200 dark:border-gray-700'></div>

            {/* 默认聚合搜索结果 */}
            <div className='flex items-center justify-between'>
              <div>
                <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                  默认聚合搜索结果
                </h4>
                <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                  搜索时默认按标题和年份聚合显示结果
                </p>
              </div>
              <label className='flex items-center cursor-pointer'>
                <div className='relative'>
                  <input
                    type='checkbox'
                    className='sr-only peer'
                    checked={defaultAggregateSearch}
                    onChange={(e) => handleAggregateToggle(e.target.checked)}
                  />
                  <div className='w-11 h-6 bg-gray-300 rounded-full peer-checked:bg-green-500 transition-colors dark:bg-gray-600'></div>
                  <div className='absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform peer-checked:translate-x-5'></div>
                </div>
              </label>
            </div>

            {/* 优选和测速 */}
            <div className='flex items-center justify-between'>
              <div>
                <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                  优选和测速
                </h4>
                <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                  如出现播放器劫持问题可关闭
                </p>
              </div>
              <label className='flex items-center cursor-pointer'>
                <div className='relative'>
                  <input
                    type='checkbox'
                    className='sr-only peer'
                    checked={enableOptimization}
                    onChange={(e) => handleOptimizationToggle(e.target.checked)}
                  />
                  <div className='w-11 h-6 bg-gray-300 rounded-full peer-checked:bg-green-500 transition-colors dark:bg-gray-600'></div>
                  <div className='absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform peer-checked:translate-x-5'></div>
                </div>
              </label>
            </div>

            {/* 流式搜索 */}
            <div className='flex items-center justify-between'>
              <div>
                <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                  流式搜索输出
                </h4>
                <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                  启用搜索结果实时流式输出，关闭后使用传统一次性搜索
                </p>
              </div>
              <label className='flex items-center cursor-pointer'>
                <div className='relative'>
                  <input
                    type='checkbox'
                    className='sr-only peer'
                    checked={fluidSearch}
                    onChange={(e) => handleFluidSearchToggle(e.target.checked)}
                  />
                  <div className='w-11 h-6 bg-gray-300 rounded-full peer-checked:bg-green-500 transition-colors dark:bg-gray-600'></div>
                  <div className='absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform peer-checked:translate-x-5'></div>
                </div>
              </label>
            </div>

            {/* 直播视频浏览器直连 */}
            <div className='flex items-center justify-between'>
              <div>
                <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                  IPTV 视频浏览器直连
                </h4>
                <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                  开启 IPTV 视频浏览器直连时，需要自备 Allow CORS 插件
                </p>
              </div>
              <label className='flex items-center cursor-pointer'>
                <div className='relative'>
                  <input
                    type='checkbox'
                    className='sr-only peer'
                    checked={liveDirectConnect}
                    onChange={(e) => handleLiveDirectConnectToggle(e.target.checked)}
                  />
                  <div className='w-11 h-6 bg-gray-300 rounded-full peer-checked:bg-green-500 transition-colors dark:bg-gray-600'></div>
                  <div className='absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform peer-checked:translate-x-5'></div>
                </div>
              </label>
            </div>
          </div>

          {/* 底部说明 */}
          <div className='mt-6 pt-4 border-t border-gray-200 dark:border-gray-700'>
            <p className='text-xs text-gray-500 dark:text-gray-400 text-center'>
              这些设置保存在本地浏览器中
            </p>
          </div>
        </div>
      </div>
    </>
  );

  // 修改密码面板内容
  const changePasswordPanel = (
    <>
      {/* 背景遮罩 */}
      <div
        className='fixed inset-0 bg-black/50 backdrop-blur-sm z-[1000]'
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
        className='fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white dark:bg-gray-900 rounded-xl shadow-xl z-[1001] overflow-hidden'
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
        className='fixed inset-0 bg-black/50 backdrop-blur-sm z-[1000]'
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
        className='fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-4xl max-h-[90vh] bg-white dark:bg-gray-900 rounded-xl shadow-xl z-[1001] flex flex-col'
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
                {watchingUpdates && watchingUpdates.continueWatchingCount > 0 && (
                  <span className='inline-flex items-center gap-1'>
                    <div className='w-2 h-2 bg-blue-500 rounded-full animate-pulse'></div>
                    {watchingUpdates.continueWatchingCount}部待续看
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
                  暂无剧集更新
                </div>
                <div className='text-xs text-gray-400 dark:text-gray-500 mt-2'>
                  系统会定期检查您的观看记录中的剧集是否有新集更新
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
                      <div key={`new-${series.title}_${series.year}_${index}`} className='relative'>
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
                        {/* 新集数徽章 */}
                        <div className='absolute -top-2 -right-2 bg-gradient-to-r from-red-500 to-pink-500 text-white text-xs px-2 py-1 rounded-full shadow-lg z-50'>
                          +{series.newEpisodes}集
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* 继续观看的剧集 */}
            {watchingUpdates && watchingUpdates.updatedSeries.filter(series => series.hasContinueWatching && !series.hasNewEpisode).length > 0 && (
              <div>
                <div className='flex items-center gap-2 mb-4'>
                  <h4 className='text-lg font-semibold text-gray-900 dark:text-white'>
                    继续观看
                  </h4>
                  <div className='flex items-center gap-1'>
                    <div className='w-2 h-2 bg-blue-500 rounded-full animate-pulse'></div>
                    <span className='text-sm text-blue-500 font-medium'>
                      {watchingUpdates.updatedSeries.filter(series => series.hasContinueWatching && !series.hasNewEpisode).length}部剧集待续看
                    </span>
                  </div>
                </div>

                <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4'>
                  {watchingUpdates.updatedSeries
                    .filter(series => series.hasContinueWatching && !series.hasNewEpisode)
                    .map((series, index) => (
                      <div key={`continue-${series.title}_${series.year}_${index}`} className='relative'>
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
                        {/* 继续观看光环效果 */}
                        <div className='absolute inset-0 rounded-lg ring-2 ring-blue-400 ring-opacity-50 animate-pulse pointer-events-none z-10'></div>
                        {/* 继续观看徽章 */}
                        <div className='absolute -top-2 -right-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-xs px-2 py-1 rounded-full shadow-lg z-50'>
                          继续看
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
              点击海报即可进入播放页面
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
        className='fixed inset-0 bg-black/50 backdrop-blur-sm z-[1000]'
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
        className='fixed inset-x-4 top-1/2 transform -translate-y-1/2 max-w-4xl mx-auto bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 z-[1001] max-h-[80vh] overflow-y-auto'
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
              return (
                <div key={record.key} className='relative'>
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
                  />
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
                观看进度在5%-95%之间的内容会显示在这里
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
        className='fixed inset-0 bg-black/50 backdrop-blur-sm z-[1000]'
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
        className='fixed inset-x-4 top-1/2 transform -translate-y-1/2 max-w-4xl mx-auto bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 z-[1001] max-h-[80vh] overflow-y-auto'
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
                  />
                  {/* 收藏时间标签 */}
                  <div className='absolute top-2 right-2 bg-black/50 rounded px-2 py-1'>
                    <span className='text-xs text-white font-medium'>
                      {new Date(favorite.save_time).toLocaleDateString('zh-CN', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                  {/* 收藏心形图标 */}
                  <div className='absolute bottom-2 right-2'>
                    <Heart className='w-4 h-4 text-red-500 fill-red-500' />
                  </div>
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
          className='w-10 h-10 p-2 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-200/50 dark:text-gray-300 dark:hover:bg-gray-700/50 transition-colors'
          aria-label='User Menu'
        >
          <User className='w-full h-full' />
        </button>
        {/* 统一更新提醒点：版本更新或剧集更新都显示橙色点 */}
        {((updateStatus === UpdateStatus.HAS_UPDATE) || (hasUnreadUpdates && totalUpdates > 0)) && (
          <div className='absolute top-[2px] right-[2px] w-2 h-2 bg-yellow-500 rounded-full'></div>
        )}
      </div>

      {/* 使用 Portal 将菜单面板渲染到 document.body */}
      {isOpen && mounted && createPortal(menuPanel, document.body)}

      {/* 使用 Portal 将设置面板渲染到 document.body */}
      {isSettingsOpen && mounted && createPortal(settingsPanel, document.body)}

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
