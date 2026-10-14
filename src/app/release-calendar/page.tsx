'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  ChevronUp,
  Clock,
  Film,
  Filter,
  MapPin,
  Search,
  Tag,
  Tv,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { ReleaseCalendarItem, ReleaseCalendarResult } from '@/lib/types';

import PageLayout from '@/components/PageLayout';

export default function ReleaseCalendarPage() {
  const queryClient = useQueryClient();

  // 过滤状态
  const [filters, setFilters] = useState({
    type: '' as 'movie' | 'tv' | '',
    region: '',
    genre: '',
    dateFrom: '',
    dateTo: '',
    search: '',
  });

  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // 视图模式
  const [viewMode, setViewMode] = useState<'grid' | 'timeline' | 'calendar'>(
    'grid',
  );

  // 返回顶部按钮状态
  const [showBackToTop, setShowBackToTop] = useState(false);

  // 日历视图的当前月份
  const [currentCalendarDate, setCurrentCalendarDate] = useState(new Date());

  // 日历视图展开的日期
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());

  // 切换日期的展开状态
  const toggleDateExpanded = (dateStr: string) => {
    setExpandedDates((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(dateStr)) {
        newSet.delete(dateStr);
      } else {
        newSet.add(dateStr);
      }
      return newSet;
    });
  };

  // 🚀 TanStack Query - 获取发布日历数据
  // 替换手动 fetch + localStorage缓存，TanStack Query 自动管理缓存
  const {
    data: rawData,
    isLoading: loading,
    error: queryError,
  } = useQuery<ReleaseCalendarResult>({
    queryKey: ['releaseCalendar'],
    queryFn: async () => {
      console.log('🌐 正在从API获取发布日历数据...');
      const response = await fetch('/api/release-calendar');

      if (!response.ok) {
        throw new Error('获取数据失败');
      }

      const result: ReleaseCalendarResult = await response.json();
      console.log(`📊 获取到 ${result.items.length} 条上映数据`);

      // 清理遗留的localStorage缓存（兼容性清理）
      localStorage.removeItem('release_calendar_all_data');
      localStorage.removeItem('release_calendar_all_data_time');

      return result;
    },
    staleTime: 30 * 60 * 1000, // 30 minutes - API has its own DB cache
    gcTime: 60 * 60 * 1000,
  });

  // 兼容旧代码的error
  const error = queryError?.message || null;

  // 前端过滤逻辑（使用 useMemo 自动响应 filters 变化）
  const data = useMemo(() => {
    if (!rawData) return null;

    let filteredItems = [...rawData.items];

    if (filters.type) {
      filteredItems = filteredItems.filter(
        (item) => item.type === filters.type,
      );
    }

    if (filters.region && filters.region !== '全部') {
      filteredItems = filteredItems.filter((item) =>
        item.region.includes(filters.region!),
      );
    }

    if (filters.genre && filters.genre !== '全部') {
      filteredItems = filteredItems.filter((item) =>
        item.genre.includes(filters.genre!),
      );
    }

    if (filters.dateFrom) {
      filteredItems = filteredItems.filter(
        (item) => item.releaseDate >= filters.dateFrom!,
      );
    }

    if (filters.dateTo) {
      filteredItems = filteredItems.filter(
        (item) => item.releaseDate <= filters.dateTo!,
      );
    }

    if (filters.search) {
      filteredItems = filteredItems.filter(
        (item) =>
          item.title.toLowerCase().includes(filters.search.toLowerCase()) ||
          item.director.toLowerCase().includes(filters.search.toLowerCase()) ||
          item.actors.toLowerCase().includes(filters.search.toLowerCase()),
      );
    }

    return {
      ...rawData,
      items: filteredItems,
      total: filteredItems.length,
      hasMore: false,
    };
  }, [rawData, filters]);

  // 应用过滤器（filters变化时useMemo自动重新计算，只需重置页码）
  const applyFilters = () => {
    setCurrentPage(1);
  };

  // 处理刷新按钮点击
  const handleRefreshClick = async () => {
    console.log('📅 刷新上映日程数据...');

    try {
      // 清除遗留的localStorage缓存（兼容性清理）
      localStorage.removeItem('release_calendar_all_data');
      localStorage.removeItem('release_calendar_all_data_time');

      // 🔄 强制刷新（先fetch带refresh=true的API清除数据库缓存，再invalidate query）
      await fetch('/api/release-calendar?refresh=true');
      await queryClient.invalidateQueries({ queryKey: ['releaseCalendar'] });
      console.log('🎉 上映日程数据刷新成功！');
    } catch (error) {
      console.error('❌ 刷新上映日程数据失败:', error);
    }
  };

  // 重置过滤器
  const resetFilters = () => {
    setFilters({
      type: '' as 'movie' | 'tv' | '',
      region: '',
      genre: '',
      dateFrom: '',
      dateTo: '',
      search: '',
    });
    setCurrentPage(1);
  };

  // 前端分页逻辑
  const totalItems = data?.items.length || 0;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentItems = data?.items.slice(startIndex, endIndex) || [];

  // 🚀 数据获取由 TanStack Query 自动管理，过滤由 useMemo 自动响应

  // 监听滚动事件以显示/隐藏返回顶部按钮
  useEffect(() => {
    const getScrollTop = () => {
      return document.body.scrollTop || document.documentElement.scrollTop || 0;
    };

    // 滚动事件处理
    const handleScroll = () => {
      const scrollTop = getScrollTop();
      setShowBackToTop(scrollTop > 300);
    };

    // 监听 body 元素的滚动事件（参考play-stats页面的实现方式）
    document.body.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      document.body.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // 返回顶部功能
  const scrollToTop = () => {
    try {
      // 根据play-stats页面的实现，真正的滚动容器是 document.body
      document.body.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    } catch {
      // 降级方案
      document.body.scrollTop = 0;
      document.documentElement.scrollTop = 0;
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const getTypeIcon = (type: 'movie' | 'tv') => {
    return type === 'movie' ? (
      <Film className='w-4 h-4' />
    ) : (
      <Tv className='w-4 h-4' />
    );
  };

  const getTypeLabel = (type: 'movie' | 'tv') => {
    return type === 'movie' ? '电影' : '电视剧';
  };

  return (
    <PageLayout activePath='/release-calendar'>
      <div className='min-h-screen relative overflow-hidden p-6'>
        {/* Aurora Mesh Gradient Background */}
        <div className='absolute inset-0 -z-10'>
          {/* Light mode: Aurora mesh gradient */}
          <div className='absolute inset-0 bg-linear-to-br from-blue-50 via-white to-purple-50 dark:hidden'></div>
          <div className='absolute top-0 -left-4 w-72 h-72 bg-purple-300 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob dark:hidden'></div>
          <div className='absolute top-0 -right-4 w-72 h-72 bg-yellow-300 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-2000 dark:hidden'></div>
          <div className='absolute -bottom-8 left-20 w-72 h-72 bg-pink-300 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-4000 dark:hidden'></div>

          {/* Dark mode: Deep aurora mesh gradient */}
          <div className='hidden dark:block absolute inset-0 bg-linear-to-br from-gray-900 via-blue-950 to-purple-950'></div>
          <div className='hidden dark:block absolute top-0 -left-4 w-72 h-72 bg-purple-700 rounded-full mix-blend-screen filter blur-3xl opacity-30 animate-blob'></div>
          <div className='hidden dark:block absolute top-0 -right-4 w-72 h-72 bg-cyan-700 rounded-full mix-blend-screen filter blur-3xl opacity-30 animate-blob animation-delay-2000'></div>
          <div className='hidden dark:block absolute -bottom-8 left-20 w-72 h-72 bg-pink-700 rounded-full mix-blend-screen filter blur-3xl opacity-30 animate-blob animation-delay-4000'></div>

          {/* Grain texture overlay */}
          <div
            className='absolute inset-0 opacity-[0.015] dark:opacity-[0.025]'
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='4.5' numOctaves='4' /%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' /%3E%3C/svg%3E\")",
            }}
          ></div>
        </div>
        <div className='max-w-7xl mx-auto relative'>
          {/* 页面标题 */}
          <div className='mb-8'>
            <div className='flex items-center gap-3 mb-4'>
              <Calendar className='w-8 h-8 text-blue-600' />
              <h1 className='text-3xl font-bold text-gray-900 dark:text-white'>
                影视上映日程
              </h1>
            </div>
            <p className='text-gray-600 dark:text-gray-400'>
              探索即将上映的电影和电视剧，不错过任何精彩内容
            </p>
          </div>

          {/* 过滤器区域 */}
          <div className='bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 mb-6'>
            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4'>
              {/* 类型过滤 */}
              <div>
                <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
                  类型
                </label>
                <select
                  value={filters.type}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      type: e.target.value as 'movie' | 'tv' | '',
                    }))
                  }
                  className='w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white'
                >
                  <option value=''>全部</option>
                  {data?.filters.types.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label} ({type.count})
                    </option>
                  ))}
                </select>
              </div>

              {/* 地区过滤 */}
              <div>
                <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
                  地区
                </label>
                <select
                  value={filters.region}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, region: e.target.value }))
                  }
                  className='w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white'
                >
                  <option value=''>全部</option>
                  {data?.filters.regions.map((region) => (
                    <option key={region.value} value={region.value}>
                      {region.label} ({region.count})
                    </option>
                  ))}
                </select>
              </div>

              {/* 类型标签过滤 */}
              <div>
                <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
                  类型标签
                </label>
                <select
                  value={filters.genre}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, genre: e.target.value }))
                  }
                  className='w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white'
                >
                  <option value=''>全部</option>
                  {data?.filters.genres.map((genre) => (
                    <option key={genre.value} value={genre.value}>
                      {genre.label} ({genre.count})
                    </option>
                  ))}
                </select>
              </div>

              {/* 搜索框 */}
              <div>
                <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
                  搜索
                </label>
                <div className='relative'>
                  <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4' />
                  <input
                    type='text'
                    placeholder='搜索标题、导演、演员...'
                    value={filters.search}
                    onChange={(e) =>
                      setFilters((prev) => ({
                        ...prev,
                        search: e.target.value,
                      }))
                    }
                    className='w-full pl-10 p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400'
                  />
                </div>
              </div>
            </div>

            {/* 日期范围过滤 */}
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4 mb-4'>
              <div>
                <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
                  开始日期
                </label>
                <input
                  type='date'
                  value={filters.dateFrom}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      dateFrom: e.target.value,
                    }))
                  }
                  className='w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white'
                />
              </div>
              <div>
                <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
                  结束日期
                </label>
                <input
                  type='date'
                  value={filters.dateTo}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, dateTo: e.target.value }))
                  }
                  className='w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white'
                />
              </div>
            </div>

            {/* 操作按钮 */}
            <div className='flex flex-wrap gap-3'>
              <button
                onClick={applyFilters}
                disabled={loading}
                className='flex items-center gap-2 px-4 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
              >
                <Filter className='w-4 h-4' />
                应用过滤器
              </button>
              <button
                onClick={resetFilters}
                className='px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors'
              >
                重置
              </button>
              <button
                onClick={handleRefreshClick}
                disabled={loading}
                className='flex items-center gap-2 px-4 py-2 bg-green-600 dark:bg-green-700 text-white rounded-lg hover:bg-green-700 dark:hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
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
              <div className='flex items-center gap-2 ml-auto'>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`px-3 py-2 rounded-lg transition-colors ${
                    viewMode === 'grid'
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  📱 网格视图
                </button>
                <button
                  onClick={() => setViewMode('calendar')}
                  className={`px-3 py-2 rounded-lg transition-colors ${
                    viewMode === 'calendar'
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  📅 日历视图
                </button>
                <button
                  onClick={() => setViewMode('timeline')}
                  className={`px-3 py-2 rounded-lg transition-colors ${
                    viewMode === 'timeline'
                      ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  ⏰ 时间线视图
                </button>
              </div>
            </div>
          </div>

          {/* 加载状态 */}
          {loading && !data && (
            <div className='flex justify-center items-center py-12'>
              <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600'></div>
            </div>
          )}

          {/* 错误状态 */}
          {error && (
            <div className='bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6'>
              <p className='text-red-700 dark:text-red-400'>错误: {error}</p>
            </div>
          )}

          {/* 数据展示 */}
          {data && (
            <>
              {/* 统计信息 */}
              <div className='bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 mb-6'>
                <div className='flex items-center justify-between'>
                  <div className='text-sm text-gray-600 dark:text-gray-400'>
                    共找到{' '}
                    <span className='font-semibold text-gray-900 dark:text-white'>
                      {data.total}
                    </span>{' '}
                    条记录
                    {rawData && data.items.length !== rawData.items.length && (
                      <span>
                        ，当前显示{' '}
                        <span className='font-semibold text-gray-900 dark:text-white'>
                          {data.items.length}
                        </span>{' '}
                        条
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* 网格视图 */}
              {viewMode === 'grid' && (
                <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6'>
                  {(() => {
                    // 去重：按title和director去重
                    const uniqueCurrentItems = currentItems.filter(
                      (item, index, self) =>
                        index ===
                        self.findIndex(
                          (t) =>
                            t.title === item.title &&
                            t.director === item.director,
                        ),
                    );
                    return uniqueCurrentItems;
                  })().map((item) => {
                    const isToday =
                      item.releaseDate ===
                      new Date().toISOString().split('T')[0];
                    const isUpcoming = new Date(item.releaseDate) > new Date();
                    const isPast = new Date(item.releaseDate) < new Date();

                    return (
                      <div
                        key={item.id}
                        className='group relative bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-xl hover:shadow-blue-500/10 hover:-translate-y-1 transition-all duration-300 cursor-pointer'
                      >
                        {/* 状态指示器 */}
                        <div className='absolute top-3 right-3 z-10'>
                          {isToday && (
                            <span className='inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 animate-pulse'>
                              🔥 今日上映
                            </span>
                          )}
                          {isUpcoming && !isToday && (
                            <span className='inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'>
                              ⏰ 即将上映
                            </span>
                          )}
                          {isPast && (
                            <span className='inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'>
                              ✅ 已上映
                            </span>
                          )}
                        </div>

                        {/* 内容区域 */}
                        <div className='p-6'>
                          {/* 头部信息 */}
                          <div className='flex items-start justify-between mb-4'>
                            <div className='flex items-center gap-2'>
                              <div
                                className={`p-2 rounded-lg ${item.type === 'movie' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400'}`}
                              >
                                {getTypeIcon(item.type)}
                              </div>
                              <div>
                                <span className='text-sm font-medium text-gray-900 dark:text-white'>
                                  {getTypeLabel(item.type)}
                                </span>
                                <div className='flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mt-1'>
                                  <Clock className='w-3 h-3' />
                                  {formatDate(item.releaseDate)}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* 标题 */}
                          <h3 className='font-bold text-lg text-gray-900 dark:text-white mb-3 line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors'>
                            {item.title}
                          </h3>

                          {/* 详细信息 */}
                          <div className='space-y-3 text-sm'>
                            <div className='flex items-start gap-2'>
                              <span className='font-medium text-gray-700 dark:text-gray-300 min-w-0 shrink-0'>
                                导演:
                              </span>
                              <span className='text-gray-600 dark:text-gray-400 line-clamp-1'>
                                {item.director}
                              </span>
                            </div>
                            <div className='flex items-start gap-2'>
                              <span className='font-medium text-gray-700 dark:text-gray-300 min-w-0 shrink-0'>
                                主演:
                              </span>
                              <span className='text-gray-600 dark:text-gray-400 line-clamp-2'>
                                {item.actors}
                              </span>
                            </div>

                            {/* 标签区域 */}
                            <div className='flex flex-wrap gap-2 pt-2'>
                              <div className='flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded-md text-xs'>
                                <MapPin className='w-3 h-3' />
                                <span className='text-gray-600 dark:text-gray-400'>
                                  {item.region}
                                </span>
                              </div>
                              <div className='flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded-md text-xs'>
                                <Tag className='w-3 h-3' />
                                <span className='text-gray-600 dark:text-gray-400'>
                                  {item.genre}
                                </span>
                              </div>
                              {item.episodes && (
                                <div className='flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 rounded-md text-xs'>
                                  <Tv className='w-3 h-3 text-green-600 dark:text-green-400' />
                                  <span className='text-green-600 dark:text-green-400 font-medium'>
                                    {item.episodes}集
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* 底部渐变效果 */}
                          <div className='absolute bottom-0 left-0 right-0 h-1 bg-linear-to-r from-blue-500 via-purple-500 to-pink-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300'></div>
                        </div>

                        {/* 悬停效果遮罩 */}
                        <div className='absolute inset-0 bg-linear-to-br from-blue-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none'></div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 日历视图 */}
              {viewMode === 'calendar' && (
                <div className='space-y-6'>
                  {/* 日历月份导航 */}
                  <div className='bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4'>
                    <div className='flex items-center justify-between mb-4'>
                      <button
                        onClick={() => {
                          const prevMonth = new Date(currentCalendarDate);
                          prevMonth.setMonth(prevMonth.getMonth() - 1);
                          setCurrentCalendarDate(prevMonth);
                        }}
                        className='p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors'
                      >
                        ← 上个月
                      </button>
                      <h3 className='text-lg font-semibold text-gray-900 dark:text-white'>
                        {currentCalendarDate.toLocaleDateString('zh-CN', {
                          year: 'numeric',
                          month: 'long',
                        })}
                      </h3>
                      <button
                        onClick={() => {
                          const nextMonth = new Date(currentCalendarDate);
                          nextMonth.setMonth(nextMonth.getMonth() + 1);
                          setCurrentCalendarDate(nextMonth);
                        }}
                        className='p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors'
                      >
                        下个月 →
                      </button>
                    </div>

                    {/* 桌面端日历视图 */}
                    <div className='hidden md:block'>
                      {/* 星期标题 */}
                      <div className='grid grid-cols-7 gap-2 mb-2'>
                        {['日', '一', '二', '三', '四', '五', '六'].map(
                          (day) => (
                            <div
                              key={day}
                              className='text-center text-sm font-medium text-gray-500 dark:text-gray-400 py-2'
                            >
                              {day}
                            </div>
                          ),
                        )}
                      </div>

                      {/* 日历网格 */}
                      <div className='grid grid-cols-7 gap-2'>
                        {(() => {
                          const today = new Date();
                          const currentMonth = currentCalendarDate.getMonth();
                          const currentYear = currentCalendarDate.getFullYear();
                          const firstDay = new Date(
                            currentYear,
                            currentMonth,
                            1,
                          );
                          const startDate = new Date(firstDay);
                          startDate.setDate(
                            startDate.getDate() - firstDay.getDay(),
                          );

                          const days = [];
                          const current = new Date(startDate);

                          // 使用全部数据而不是分页数据
                          const allItems = data?.items || [];

                          // 生成6周的日期
                          for (let week = 0; week < 6; week++) {
                            for (let day = 0; day < 7; day++) {
                              // 避免时区问题，使用本地日期格式
                              const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
                              const isCurrentMonth =
                                current.getMonth() === currentMonth;
                              const isToday =
                                current.toDateString() === today.toDateString();
                              const dayItems = allItems.filter(
                                (item) => item.releaseDate === dateStr,
                              );
                              // 去重：按title和director去重
                              const uniqueDayItems = dayItems.filter(
                                (item, index, self) =>
                                  index ===
                                  self.findIndex(
                                    (t) =>
                                      t.title === item.title &&
                                      t.director === item.director,
                                  ),
                              );

                              days.push(
                                <div
                                  key={dateStr}
                                  className={`${expandedDates.has(dateStr) ? 'min-h-[150px]' : 'min-h-[100px]'} p-2 rounded-xl transition-all duration-300 ${
                                    !isCurrentMonth
                                      ? 'bg-linear-to-br from-gray-50/50 to-gray-100/30 dark:from-gray-800/30 dark:to-gray-900/20 text-gray-400'
                                      : 'bg-linear-to-br from-white to-gray-50/50 dark:from-gray-800 dark:to-gray-800/80 shadow-sm hover:shadow-md'
                                  } ${
                                    isToday
                                      ? 'ring-2 ring-blue-400 bg-linear-to-br from-blue-50 to-blue-100/50 dark:from-blue-900/30 dark:to-blue-800/20 shadow-lg shadow-blue-500/20'
                                      : ''
                                  } hover:scale-[1.02] hover:-translate-y-0.5`}
                                >
                                  {/* 日期数字 */}
                                  <div
                                    className={`text-sm font-medium mb-1 ${
                                      isToday
                                        ? 'text-blue-600 dark:text-blue-400'
                                        : !isCurrentMonth
                                          ? 'text-gray-400'
                                          : 'text-gray-900 dark:text-white'
                                    }`}
                                  >
                                    {current.getDate()}
                                  </div>

                                  {/* 该日的影片 */}
                                  <div className='space-y-1'>
                                    {(expandedDates.has(dateStr)
                                      ? uniqueDayItems
                                      : uniqueDayItems.slice(0, 2)
                                    ).map((item, index) => (
                                      <div
                                        key={`${item.id}-${index}`}
                                        className={`text-xs p-1 rounded truncate cursor-pointer transition-colors ${
                                          item.type === 'movie'
                                            ? 'bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-300'
                                            : 'bg-purple-100 text-purple-800 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-300'
                                        }`}
                                        title={`${item.title} - ${item.director}`}
                                      >
                                        {item.title} ({item.region})
                                      </div>
                                    ))}
                                    {uniqueDayItems.length > 2 && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleDateExpanded(dateStr);
                                        }}
                                        className='w-full text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium transition-colors py-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20'
                                      >
                                        {expandedDates.has(dateStr)
                                          ? '收起'
                                          : `+${uniqueDayItems.length - 2} 更多`}
                                      </button>
                                    )}
                                  </div>
                                </div>,
                              );

                              current.setDate(current.getDate() + 1);
                            }
                          }

                          return days;
                        })()}
                      </div>
                    </div>

                    {/* 移动端列表视图 */}
                    <div className='md:hidden space-y-3'>
                      {(() => {
                        const today = new Date();
                        const currentMonth = currentCalendarDate.getMonth();
                        const currentYear = currentCalendarDate.getFullYear();
                        const firstDay = new Date(currentYear, currentMonth, 1);
                        const lastDay = new Date(
                          currentYear,
                          currentMonth + 1,
                          0,
                        );

                        // 使用全部数据而不是分页数据
                        const allItems = data?.items || [];

                        // 获取当前月份的所有日期及其影片
                        const daysWithMovies = [];
                        const current = new Date(firstDay);

                        while (current <= lastDay) {
                          const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
                          const isToday =
                            current.toDateString() === today.toDateString();
                          const dayItems = allItems.filter(
                            (item) => item.releaseDate === dateStr,
                          );
                          // 去重：按title和director去重
                          const uniqueDayItems = dayItems.filter(
                            (item, index, self) =>
                              index ===
                              self.findIndex(
                                (t) =>
                                  t.title === item.title &&
                                  t.director === item.director,
                              ),
                          );

                          if (uniqueDayItems.length > 0) {
                            daysWithMovies.push({
                              date: new Date(current),
                              dateStr,
                              isToday,
                              items: uniqueDayItems,
                            });
                          }

                          current.setDate(current.getDate() + 1);
                        }

                        return daysWithMovies.map(
                          ({ date, dateStr, isToday, items }) => (
                            <div
                              key={dateStr}
                              className={`rounded-xl p-4 transition-all duration-300 ${
                                isToday
                                  ? 'ring-2 ring-blue-400 bg-linear-to-br from-blue-50 to-blue-100/50 dark:from-blue-900/30 dark:to-blue-800/20 shadow-lg shadow-blue-500/20'
                                  : 'bg-linear-to-br from-white to-gray-50/50 dark:from-gray-800 dark:to-gray-800/80 shadow-sm hover:shadow-md'
                              }`}
                            >
                              {/* 日期标题 */}
                              <div className='flex items-center justify-between mb-3 pb-2 border-b border-gray-200 dark:border-gray-700'>
                                <h4
                                  className={`text-lg font-semibold ${
                                    isToday
                                      ? 'text-blue-600 dark:text-blue-400'
                                      : 'text-gray-900 dark:text-white'
                                  }`}
                                >
                                  {date.toLocaleDateString('zh-CN', {
                                    month: 'long',
                                    day: 'numeric',
                                    weekday: 'short',
                                  })}
                                </h4>
                                <span className='text-sm text-gray-500 dark:text-gray-400'>
                                  {items.length} 部影片
                                </span>
                              </div>

                              {/* 影片列表 */}
                              <div className='space-y-2'>
                                {items.map((item, index) => (
                                  <div
                                    key={`${item.id}-${index}`}
                                    className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
                                      item.type === 'movie'
                                        ? 'bg-amber-50 border border-amber-200 hover:bg-amber-100 dark:bg-amber-900/20 dark:border-amber-800'
                                        : 'bg-purple-50 border border-purple-200 hover:bg-purple-100 dark:bg-purple-900/20 dark:border-purple-800'
                                    }`}
                                  >
                                    <div className='flex-1 min-w-0'>
                                      <h5
                                        className={`font-medium truncate ${
                                          item.type === 'movie'
                                            ? 'text-amber-900 dark:text-amber-100'
                                            : 'text-purple-900 dark:text-purple-100'
                                        }`}
                                      >
                                        {item.title}
                                      </h5>
                                      <p
                                        className={`text-sm truncate ${
                                          item.type === 'movie'
                                            ? 'text-amber-700 dark:text-amber-300'
                                            : 'text-purple-700 dark:text-purple-300'
                                        }`}
                                      >
                                        {item.director} • {item.region}
                                      </p>
                                    </div>
                                    <div
                                      className={`text-xs px-2 py-1 rounded-full ${
                                        item.type === 'movie'
                                          ? 'bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-200'
                                          : 'bg-purple-200 text-purple-800 dark:bg-purple-800 dark:text-purple-200'
                                      }`}
                                    >
                                      {item.type === 'movie'
                                        ? '电影'
                                        : '电视剧'}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ),
                        );
                      })()}
                    </div>
                  </div>

                  {/* 今日上映详情 */}
                  {(() => {
                    const today = new Date();
                    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                    const allItems = data?.items || [];
                    const todayItems = allItems.filter(
                      (item) => item.releaseDate === todayStr,
                    );

                    // 去重：按title和director去重
                    const uniqueTodayItems = todayItems.filter(
                      (item, index, self) =>
                        index ===
                        self.findIndex(
                          (t) =>
                            t.title === item.title &&
                            t.director === item.director,
                        ),
                    );

                    if (uniqueTodayItems.length > 0) {
                      return (
                        <div className='bg-linear-to-r from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 rounded-lg p-6 border border-red-200 dark:border-red-800'>
                          <div className='flex items-center gap-2 mb-4'>
                            <span className='text-2xl'>🔥</span>
                            <h3 className='text-lg font-bold text-red-800 dark:text-red-300'>
                              今日上映 ({uniqueTodayItems.length} 部)
                            </h3>
                          </div>
                          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
                            {uniqueTodayItems.map((item) => (
                              <div
                                key={item.id}
                                className='bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-red-100 dark:border-red-800/50'
                              >
                                <div className='flex items-center gap-2 mb-2'>
                                  {item.type === 'movie' ? (
                                    <Film className='w-4 h-4 text-amber-600' />
                                  ) : (
                                    <Tv className='w-4 h-4 text-purple-600' />
                                  )}
                                  <span className='text-sm font-medium text-gray-900 dark:text-white'>
                                    {item.title}
                                  </span>
                                </div>
                                <div className='text-xs text-gray-600 dark:text-gray-400 space-y-1'>
                                  <div>导演: {item.director}</div>
                                  <div>主演: {item.actors}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              )}

              {/* 时间线视图 */}
              {viewMode === 'timeline' && (
                <div className='relative'>
                  {/* 时间线主线 */}
                  <div className='absolute left-8 top-0 bottom-0 w-0.5 bg-linear-to-b from-blue-500 via-purple-500 to-pink-500'></div>

                  <div className='space-y-8'>
                    {Object.entries(
                      (data?.items || []).reduce(
                        (acc, item) => {
                          const date = item.releaseDate;
                          if (!acc[date]) acc[date] = [];
                          acc[date].push(item);
                          return acc;
                        },
                        {} as Record<string, ReleaseCalendarItem[]>,
                      ),
                    )
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([date, items]) => {
                        const today = new Date();
                        const currentDate = new Date(date);
                        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                        const isToday = date === todayStr;
                        const isPast = currentDate < today && !isToday;
                        const isUpcoming = currentDate > today;

                        // 去重：按title和director去重
                        const uniqueItems = items.filter(
                          (item, index, self) =>
                            index ===
                            self.findIndex(
                              (t) =>
                                t.title === item.title &&
                                t.director === item.director,
                            ),
                        );

                        return (
                          <div key={date} className='relative pl-20'>
                            {/* 时间线节点 */}
                            <div
                              className={`absolute left-6 w-6 h-6 rounded-full border-4 border-white dark:border-gray-900 flex items-center justify-center ${
                                isToday
                                  ? 'bg-red-500 animate-pulse shadow-lg shadow-red-500/50'
                                  : isPast
                                    ? 'bg-gray-400'
                                    : 'bg-blue-500 shadow-lg shadow-blue-500/30'
                              }`}
                            >
                              {isToday && (
                                <span className='text-white text-xs font-bold'>
                                  !
                                </span>
                              )}
                            </div>

                            {/* 内容卡片 */}
                            <div
                              className={`bg-white dark:bg-gray-800 rounded-xl shadow-lg border overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1 ${
                                isToday
                                  ? 'border-red-500 ring-2 ring-red-500/20'
                                  : isPast
                                    ? 'border-gray-300 dark:border-gray-600 opacity-75'
                                    : 'border-blue-200 dark:border-blue-800'
                              }`}
                            >
                              {/* 日期头部 */}
                              <div
                                className={`px-6 py-4 border-b ${
                                  isToday
                                    ? 'bg-linear-to-r from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 border-red-200 dark:border-red-800'
                                    : isPast
                                      ? 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600'
                                      : 'bg-linear-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border-blue-200 dark:border-blue-800'
                                }`}
                              >
                                <div className='flex items-center justify-between'>
                                  <div className='flex items-center gap-3'>
                                    <div
                                      className={`p-2 rounded-lg ${
                                        isToday
                                          ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                                          : isPast
                                            ? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                                            : 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                                      }`}
                                    >
                                      <Calendar className='w-5 h-5' />
                                    </div>
                                    <div>
                                      <h3
                                        className={`text-lg font-bold ${
                                          isToday
                                            ? 'text-red-800 dark:text-red-300'
                                            : isPast
                                              ? 'text-gray-700 dark:text-gray-300'
                                              : 'text-blue-800 dark:text-blue-300'
                                        }`}
                                      >
                                        {formatDate(date)}
                                      </h3>
                                      <p className='text-sm text-gray-600 dark:text-gray-400'>
                                        {uniqueItems.length} 部作品上映
                                      </p>
                                    </div>
                                  </div>

                                  {/* 状态标签 */}
                                  <div className='flex items-center gap-2'>
                                    {isToday && (
                                      <span className='inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 animate-pulse'>
                                        🔥 今日上映
                                      </span>
                                    )}
                                    {isUpcoming && !isToday && (
                                      <span className='inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'>
                                        ⏰ 即将上映
                                      </span>
                                    )}
                                    {isPast && (
                                      <span className='inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'>
                                        ✅ 已上映
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* 影片列表 */}
                              <div className='p-6'>
                                <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
                                  {uniqueItems.map((item, itemIndex) => (
                                    <div
                                      key={`${item.id}-${itemIndex}`}
                                      className={`group relative bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 transition-all duration-200 hover:shadow-md cursor-pointer ${
                                        isToday
                                          ? 'hover:bg-red-50 dark:hover:bg-red-900/10'
                                          : 'hover:bg-blue-50 dark:hover:bg-blue-900/10'
                                      }`}
                                    >
                                      {/* 类型图标 */}
                                      <div className='flex items-start justify-between mb-3'>
                                        <div
                                          className={`p-2 rounded-lg ${
                                            item.type === 'movie'
                                              ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
                                              : 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400'
                                          }`}
                                        >
                                          {getTypeIcon(item.type)}
                                        </div>
                                        <span
                                          className={`text-xs px-2 py-1 rounded-full ${
                                            item.type === 'movie'
                                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                                              : 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                                          }`}
                                        >
                                          {getTypeLabel(item.type)}
                                        </span>
                                      </div>

                                      {/* 标题 */}
                                      <h4 className='font-semibold text-gray-900 dark:text-white mb-3 line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors'>
                                        {item.title}
                                      </h4>

                                      {/* 详细信息 */}
                                      <div className='space-y-2 text-sm text-gray-600 dark:text-gray-400'>
                                        <div className='flex items-start gap-2'>
                                          <span className='font-medium min-w-0 shrink-0'>
                                            导演:
                                          </span>
                                          <span className='line-clamp-1'>
                                            {item.director}
                                          </span>
                                        </div>
                                        <div className='flex items-start gap-2'>
                                          <span className='font-medium min-w-0 shrink-0'>
                                            主演:
                                          </span>
                                          <span className='line-clamp-2'>
                                            {item.actors}
                                          </span>
                                        </div>

                                        {/* 标签 */}
                                        <div className='flex flex-wrap gap-2 pt-2'>
                                          <span className='inline-flex items-center gap-1 px-2 py-1 bg-gray-200 dark:bg-gray-600 rounded text-xs'>
                                            <MapPin className='w-3 h-3' />
                                            {item.region}
                                          </span>
                                          <span className='inline-flex items-center gap-1 px-2 py-1 bg-gray-200 dark:bg-gray-600 rounded text-xs'>
                                            <Tag className='w-3 h-3' />
                                            {item.genre}
                                          </span>
                                          {item.episodes && (
                                            <span className='inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded text-xs'>
                                              <Tv className='w-3 h-3' />
                                              {item.episodes}集
                                            </span>
                                          )}
                                        </div>
                                      </div>

                                      {/* 悬停效果 */}
                                      <div className='absolute inset-0 bg-linear-to-br from-blue-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-lg pointer-events-none'></div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* 分页导航 */}
              {totalPages > 1 && (
                <div className='flex justify-center mt-8 space-x-2'>
                  <button
                    onClick={() =>
                      setCurrentPage((prev) => Math.max(prev - 1, 1))
                    }
                    disabled={currentPage === 1}
                    className='px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors'
                  >
                    上一页
                  </button>
                  <span className='px-4 py-2 text-gray-600 dark:text-gray-400'>
                    第 {currentPage} 页，共 {totalPages} 页
                  </span>
                  <button
                    onClick={() =>
                      setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                    }
                    disabled={currentPage === totalPages}
                    className='px-4 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 transition-colors'
                  >
                    下一页
                  </button>
                </div>
              )}

              {/* 无数据 */}
              {currentItems.length === 0 && !loading && (
                <div className='text-center py-12'>
                  <div className='text-gray-400 dark:text-gray-600 mb-4'>
                    <Calendar className='w-16 h-16 mx-auto' />
                  </div>
                  <h3 className='text-lg font-medium text-gray-900 dark:text-white mb-2'>
                    暂无数据
                  </h3>
                  <p className='text-gray-500 dark:text-gray-400'>
                    没有找到符合条件的影视作品，请尝试调整过滤条件
                  </p>
                </div>
              )}
            </>
          )}

          {/* 返回顶部悬浮按钮 */}
          {showBackToTop && (
            <button
              onClick={scrollToTop}
              className='fixed bottom-20 right-6 md:bottom-6 z-50 group bg-blue-600 dark:bg-blue-700 text-white p-3 rounded-full shadow-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-all duration-300 hover:scale-110'
              aria-label='返回顶部'
            >
              <ChevronUp className='w-6 h-6 transition-transform group-hover:scale-110' />
            </button>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
