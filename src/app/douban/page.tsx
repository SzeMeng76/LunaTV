/* eslint-disable no-console,react-hooks/exhaustive-deps,@typescript-eslint/no-explicit-any */

'use client';

import { ChevronUp } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, infiniteQueryOptions } from '@tanstack/react-query';

import { isAIRecommendFeatureDisabled } from '@/lib/ai-recommend.client';
import { GetBangumiCalendarData } from '@/lib/bangumi.client';
import {
  getDoubanCategories,
  getDoubanList,
  getDoubanRecommends,
} from '@/lib/douban.client';
import { DoubanItem, DoubanResult } from '@/lib/types';

import DoubanCardSkeleton from '@/components/DoubanCardSkeleton';
import DoubanCustomSelector from '@/components/DoubanCustomSelector';
import DoubanSelector from '@/components/DoubanSelector';
import PageLayout from '@/components/PageLayout';
import VideoCard from '@/components/VideoCard';
import VirtualGrid from '@/components/VirtualGrid';

const PAGE_SIZE = 25;

// Query Options 工厂函数
const doubanListOptions = (
  type: string,
  primarySelection: string,
  secondarySelection: string,
  multiLevelValues: Record<string, string>,
  selectedWeekday: string,
  customCategories: Array<{ name: string; type: 'movie' | 'tv'; query: string }>
) => infiniteQueryOptions({
  queryKey: ['douban', type, primarySelection, secondarySelection, multiLevelValues, selectedWeekday],
  queryFn: async ({ pageParam = 0 }) => {
    if (type === 'custom') {
      const selectedCategory = customCategories.find(
        (cat) => cat.type === primarySelection && cat.query === secondarySelection
      );
      if (selectedCategory) {
        return await getDoubanList({
          tag: selectedCategory.query,
          type: selectedCategory.type,
          pageLimit: PAGE_SIZE,
          pageStart: pageParam * PAGE_SIZE,
        });
      }
      return { code: 200, message: 'success', list: [] };
    } else if (type === 'anime' && primarySelection === '每日放送') {
      if (pageParam > 0) {
        return { code: 200, message: 'success', list: [] };
      }
      const calendarData = await GetBangumiCalendarData();
      const weekdayData = calendarData.find((item) => item.weekday.en === selectedWeekday);
      if (weekdayData) {
        return {
          code: 200,
          message: 'success',
          list: weekdayData.items.map((item) => ({
            id: item.id?.toString() || '',
            title: item.name_cn || item.name,
            poster:
              item.images?.large ||
              item.images?.common ||
              item.images?.medium ||
              item.images?.small ||
              item.images?.grid ||
              '/placeholder-poster.jpg',
            rate: item.rating?.score?.toFixed(1) || '',
            year: item.air_date?.split('-')?.[0] || '',
          })),
        };
      }
      return { code: 200, message: 'success', list: [] };
    } else if (type === 'anime') {
      return await getDoubanRecommends({
        kind: primarySelection === '番剧' ? 'tv' : 'movie',
        pageLimit: PAGE_SIZE,
        pageStart: pageParam * PAGE_SIZE,
        category: '动画',
        format: primarySelection === '番剧' ? '电视剧' : '',
        region: multiLevelValues.region || '',
        year: multiLevelValues.year || '',
        platform: multiLevelValues.platform || '',
        sort: multiLevelValues.sort || '',
        label: multiLevelValues.label || '',
      });
    } else if (primarySelection === '全部') {
      return await getDoubanRecommends({
        kind: type === 'show' ? 'tv' : (type as 'tv' | 'movie'),
        pageLimit: PAGE_SIZE,
        pageStart: pageParam * PAGE_SIZE,
        category: multiLevelValues.type || '',
        format: type === 'show' ? '综艺' : type === 'tv' ? '电视剧' : '',
        region: multiLevelValues.region || '',
        year: multiLevelValues.year || '',
        platform: multiLevelValues.platform || '',
        sort: multiLevelValues.sort || '',
        label: multiLevelValues.label || '',
      });
    } else {
      const kind = type === 'tv' || type === 'show' ? 'tv' : (type as 'tv' | 'movie');
      const category = type === 'tv' || type === 'show' ? type : primarySelection;
      return await getDoubanCategories({
        kind,
        category,
        type: secondarySelection,
        pageLimit: PAGE_SIZE,
        pageStart: pageParam * PAGE_SIZE,
      });
    }
  },
  initialPageParam: 0,
  getNextPageParam: (lastPage, allPages) => {
    if (!lastPage?.list || lastPage.list.length < PAGE_SIZE) {
      return undefined;
    }
    return allPages.length;
  },
  enabled: !!type,
  staleTime: 2 * 60 * 1000,
  gcTime: 5 * 60 * 1000,
});

function DoubanPageClient() {
  const searchParams = useSearchParams();
  const [selectorsReady, setSelectorsReady] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadingRef = useRef<HTMLDivElement>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [useVirtualization, setUseVirtualization] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('useDoubanVirtualization');
      return saved !== null ? JSON.parse(saved) : true;
    }
    return true;
  });

  const type = searchParams.get('type') || 'movie';

  const [customCategories, setCustomCategories] = useState<
    Array<{ name: string; type: 'movie' | 'tv'; query: string }>
  >([]);

  const [primarySelection, setPrimarySelection] = useState<string>(() => {
    if (type === 'movie') return '热门';
    if (type === 'tv' || type === 'show') return '最近热门';
    if (type === 'anime') return '每日放送';
    return '';
  });
  const [secondarySelection, setSecondarySelection] = useState<string>(() => {
    if (type === 'movie') return '全部';
    if (type === 'tv') return 'tv';
    if (type === 'show') return 'show';
    return '全部';
  });

  const [multiLevelValues, setMultiLevelValues] = useState<Record<string, string>>({
    type: 'all',
    region: 'all',
    year: 'all',
    platform: 'all',
    label: 'all',
    sort: 'T',
  });

  const [selectedWeekday, setSelectedWeekday] = useState<string>('');
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiCheckComplete, setAiCheckComplete] = useState(false);

  // 使用 useInfiniteQuery
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery(
    doubanListOptions(type, primarySelection, secondarySelection, multiLevelValues, selectedWeekday, customCategories)
  );

  // 扁平化所有页面数据
  const allItems = useMemo(
    () => data?.pages.flatMap((page) => page.list) ?? [],
    [data]
  );

  // 处理滚动到底部加载更多
  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // 保存虚拟化设置
  const toggleVirtualization = () => {
    const newValue = !useVirtualization;
    setUseVirtualization(newValue);
    if (typeof window !== 'undefined') {
      localStorage.setItem('useDoubanVirtualization', JSON.stringify(newValue));
    }
  };

  // 获取自定义分类数据
  useEffect(() => {
    const runtimeConfig = (window as any).RUNTIME_CONFIG;
    if (runtimeConfig?.CUSTOM_CATEGORIES?.length > 0) {
      setCustomCategories(runtimeConfig.CUSTOM_CATEGORIES);
    }
  }, []);

  // 页面级别的AI权限检测
  useEffect(() => {
    const disabled = isAIRecommendFeatureDisabled();
    setAiEnabled(!disabled);
    setAiCheckComplete(true);
  }, []);

  // 初始化时标记选择器为准备好状态
  useEffect(() => {
    const timer = setTimeout(() => {
      setSelectorsReady(true);
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  // 监听滚动位置，控制返回顶部按钮显示
  useEffect(() => {
    const getScrollTop = () => document.body.scrollTop || 0;

    let isRunning = false;
    const checkScrollPosition = () => {
      if (!isRunning) return;
      const scrollTop = getScrollTop();
      setShowBackToTop(scrollTop > 300);
      requestAnimationFrame(checkScrollPosition);
    };

    isRunning = true;
    checkScrollPosition();

    const handleScroll = () => {
      setShowBackToTop(getScrollTop() > 300);
    };

    document.body.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      isRunning = false;
      document.body.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // type变化时重置selectorsReady
  useEffect(() => {
    setSelectorsReady(false);
  }, [type]);

  // 当type变化时重置选择器状态
  useEffect(() => {
    if (type === 'custom' && customCategories.length > 0) {
      const types = Array.from(new Set(customCategories.map((cat) => cat.type)));
      if (types.length > 0) {
        let selectedType = types.includes('movie') ? 'movie' : types[0];
        setPrimarySelection(selectedType);
        const firstCategory = customCategories.find((cat) => cat.type === selectedType);
        if (firstCategory) {
          setSecondarySelection(firstCategory.query);
        }
      }
    } else {
      if (type === 'movie') {
        setPrimarySelection('热门');
        setSecondarySelection('全部');
      } else if (type === 'tv') {
        setPrimarySelection('最近热门');
        setSecondarySelection('tv');
      } else if (type === 'show') {
        setPrimarySelection('最近热门');
        setSecondarySelection('show');
      } else if (type === 'anime') {
        setPrimarySelection('每日放送');
        setSecondarySelection('全部');
      } else {
        setPrimarySelection('');
        setSecondarySelection('全部');
      }
    }

    setMultiLevelValues({
      type: 'all',
      region: 'all',
      year: 'all',
      platform: 'all',
      label: 'all',
      sort: 'T',
    });

    const timer = setTimeout(() => {
      setSelectorsReady(true);
    }, 50);

    return () => clearTimeout(timer);
  }, [type, customCategories]);

  const skeletonData = Array.from({ length: 25 }, (_, index) => index);

  // 处理选择器变化
  const handlePrimaryChange = useCallback(
    (value: string) => {
      if (value !== primarySelection) {
        setMultiLevelValues({
          type: 'all',
          region: 'all',
          year: 'all',
          platform: 'all',
          label: 'all',
          sort: 'T',
        });

        if (type === 'custom' && customCategories.length > 0) {
          const firstCategory = customCategories.find((cat) => cat.type === value);
          if (firstCategory) {
            setPrimarySelection(value);
            setSecondarySelection(firstCategory.query);
          } else {
            setPrimarySelection(value);
          }
        } else {
          if ((type === 'tv' || type === 'show') && value === '最近热门') {
            setPrimarySelection(value);
            if (type === 'tv') {
              setSecondarySelection('tv');
            } else if (type === 'show') {
              setSecondarySelection('show');
            }
          } else {
            setPrimarySelection(value);
          }
        }
      }
    },
    [primarySelection, type, customCategories]
  );

  const handleSecondaryChange = useCallback(
    (value: string) => {
      if (value !== secondarySelection) {
        setSecondarySelection(value);
      }
    },
    [secondarySelection]
  );

  const handleMultiLevelChange = useCallback(
    (values: Record<string, string>) => {
      const isEqual = (obj1: Record<string, string>, obj2: Record<string, string>) => {
        const keys1 = Object.keys(obj1).sort();
        const keys2 = Object.keys(obj2).sort();
        if (keys1.length !== keys2.length) return false;
        return keys1.every((key) => obj1[key] === obj2[key]);
      };

      if (!isEqual(values, multiLevelValues)) {
        setMultiLevelValues(values);
      }
    },
    [multiLevelValues]
  );

  const handleWeekdayChange = useCallback((weekday: string) => {
    setSelectedWeekday(weekday);
  }, []);

  const getPageTitle = () => {
    return type === 'movie'
      ? '电影'
      : type === 'tv'
        ? '电视剧'
        : type === 'anime'
          ? '动漫'
          : type === 'show'
            ? '综艺'
            : '自定义';
  };

  const getPageDescription = () => {
    if (type === 'anime' && primarySelection === '每日放送') {
      return '来自 Bangumi 番组计划的精选内容';
    }
    return '来自豆瓣的精选内容';
  };

  const getActivePath = () => {
    const params = new URLSearchParams();
    if (type) params.set('type', type);

    const queryString = params.toString();
    const activePath = `/douban${queryString ? `?${queryString}` : ''}`;
    return activePath;
  };

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

  return (
    <PageLayout activePath={getActivePath()}>
      <div className='overflow-visible -mt-6 md:mt-0 pb-40 md:pb-safe-bottom'>
        {/* 页面标题和选择器 */}
        <div className='mb-6 sm:mb-8 space-y-4 sm:space-y-6'>
          {/* 页面标题 */}
          <div>
            <h1 className='text-2xl sm:text-3xl font-bold text-gray-800 mb-1 sm:mb-2 dark:text-gray-200'>
              {getPageTitle()}
            </h1>
            <p className='text-sm sm:text-base text-gray-600 dark:text-gray-400'>
              {getPageDescription()}
            </p>
          </div>

          {/* 选择器组件 */}
          {type !== 'custom' ? (
            <div className='relative bg-linear-to-br from-white/80 via-blue-50/30 to-purple-50/30 dark:from-gray-800/60 dark:via-blue-900/20 dark:to-purple-900/20 rounded-2xl p-4 sm:p-6 border border-blue-200/40 dark:border-blue-700/40 backdrop-blur-md shadow-lg hover:shadow-xl transition-all duration-300'>
              <div className='absolute -top-20 -right-20 w-40 h-40 bg-linear-to-br from-blue-300/20 to-purple-300/20 rounded-full blur-3xl pointer-events-none'></div>
              <div className='absolute -bottom-20 -left-20 w-40 h-40 bg-linear-to-br from-green-300/20 to-teal-300/20 rounded-full blur-3xl pointer-events-none'></div>

              <div className='relative'>
                <DoubanSelector
                  type={type as 'movie' | 'tv' | 'show' | 'anime'}
                  primarySelection={primarySelection}
                  secondarySelection={secondarySelection}
                  onPrimaryChange={handlePrimaryChange}
                  onSecondaryChange={handleSecondaryChange}
                  onMultiLevelChange={handleMultiLevelChange}
                  onWeekdayChange={handleWeekdayChange}
                />
              </div>
            </div>
          ) : (
            <div className='relative bg-linear-to-br from-white/80 via-blue-50/30 to-purple-50/30 dark:from-gray-800/60 dark:via-blue-900/20 dark:to-purple-900/20 rounded-2xl p-4 sm:p-6 border border-blue-200/40 dark:border-blue-700/40 backdrop-blur-md shadow-lg hover:shadow-xl transition-all duration-300'>
              <div className='absolute -top-20 -right-20 w-40 h-40 bg-linear-to-br from-blue-300/20 to-purple-300/20 rounded-full blur-3xl pointer-events-none'></div>
              <div className='absolute -bottom-20 -left-20 w-40 h-40 bg-linear-to-br from-green-300/20 to-teal-300/20 rounded-full blur-3xl pointer-events-none'></div>

              <div className='relative'>
                <DoubanCustomSelector
                  customCategories={customCategories}
                  primarySelection={primarySelection}
                  secondarySelection={secondarySelection}
                  onPrimaryChange={handlePrimaryChange}
                  onSecondaryChange={handleSecondaryChange}
                />
              </div>
            </div>
          )}

          {/* 虚拟化开关 */}
          <div className='flex items-center justify-end gap-3 px-2'>
            <label className='flex items-center gap-2 cursor-pointer group'>
              <span className='text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors'>
                ⚡ 虚拟滑动
              </span>
              <div className='relative'>
                <input
                  type='checkbox'
                  className='sr-only peer'
                  checked={useVirtualization}
                  onChange={toggleVirtualization}
                />
                <div className='w-11 h-6 bg-linear-to-r from-gray-200 to-gray-300 rounded-full peer-checked:from-blue-400 peer-checked:to-purple-500 transition-all duration-300 dark:from-gray-600 dark:to-gray-700 dark:peer-checked:from-blue-500 dark:peer-checked:to-purple-600 shadow-inner'></div>
                <div className='absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-all duration-300 peer-checked:translate-x-5 shadow-lg peer-checked:shadow-blue-300 dark:peer-checked:shadow-blue-500/50 peer-checked:scale-105'></div>
                <div className='absolute top-1.5 left-1.5 w-3 h-3 flex items-center justify-center pointer-events-none transition-all duration-300 peer-checked:translate-x-5'>
                  <span className='text-[10px] peer-checked:text-white text-gray-500'>
                    {useVirtualization ? '✨' : '○'}
                  </span>
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* 内容展示区域 */}
        <div className='max-w-[95%] mx-auto mt-8 overflow-visible'>
          {/* 条件渲染：虚拟化 vs 传统网格 */}
          {useVirtualization ? (
            <>
              {isLoading || !selectorsReady
                ? <div className='justify-start grid grid-cols-3 gap-x-2 gap-y-12 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] sm:gap-x-8 sm:gap-y-20'>
                  {skeletonData.map((index) => <DoubanCardSkeleton key={index} />)}
                </div>
                : <VirtualGrid
                  items={allItems}
                  className='grid-cols-3 gap-x-2 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] sm:gap-x-8'
                  rowGapClass='pb-12 sm:pb-20'
                  estimateRowHeight={320}
                  endReached={handleEndReached}
                  endReachedThreshold={3}
                  restoreKey={`douban:${type}:${primarySelection}:${secondarySelection}:${selectedWeekday}:${JSON.stringify(multiLevelValues)}`}
                  renderItem={(item, index) => {
                    const mappedType = type === 'movie' ? 'movie' : type === 'show' ? 'variety' : type === 'tv' ? 'tv' : type === 'anime' ? 'anime' : '';
                    return (
                      <div key={`${item.title}-${index}`} className='w-full'>
                        <VideoCard
                          from='douban'
                          source='douban'
                          id={item.id}
                          source_name='豆瓣'
                          title={item.title}
                          poster={item.poster}
                          douban_id={Number(item.id)}
                          rate={item.rate}
                          year={item.year}
                          type={mappedType}
                          isBangumi={type === 'anime' && primarySelection === '每日放送'}
                          aiEnabled={aiEnabled}
                          aiCheckComplete={aiCheckComplete}
                          priority={index < 30}
                        />
                      </div>
                    );
                  }}
                />
              }

              {/* 加载更多指示器 */}
              {hasNextPage && !isLoading && (
                <div
                  ref={(el) => {
                    if (el && el.offsetParent !== null) {
                      (loadingRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
                    }
                  }}
                  className='flex justify-center mt-12 py-8'
                >
                  {isFetchingNextPage && (
                    <div className='relative px-8 py-4 rounded-2xl bg-linear-to-r from-green-50 via-emerald-50 to-teal-50 dark:from-green-900/20 dark:via-emerald-900/20 dark:to-teal-900/20 border border-green-200/50 dark:border-green-700/50 shadow-lg backdrop-blur-sm overflow-hidden'>
                      <div className='absolute inset-0 bg-linear-to-r from-green-400/10 via-emerald-400/10 to-teal-400/10 animate-pulse'></div>
                      <div className='relative flex items-center gap-3'>
                        <div className='relative'>
                          <div className='animate-spin rounded-full h-8 w-8 border-[3px] border-green-200 dark:border-green-800'></div>
                          <div className='absolute inset-0 animate-spin rounded-full h-8 w-8 border-[3px] border-transparent border-t-green-500 dark:border-t-green-400'></div>
                        </div>
                        <div className='flex items-center gap-1'>
                          <span className='text-sm font-medium text-gray-700 dark:text-gray-300'>加载中</span>
                          <span className='flex gap-0.5'>
                            <span className='animate-bounce' style={{ animationDelay: '0ms' }}>.</span>
                            <span className='animate-bounce' style={{ animationDelay: '150ms' }}>.</span>
                            <span className='animate-bounce' style={{ animationDelay: '300ms' }}>.</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 没有更多数据提示 */}
              {!hasNextPage && allItems.length > 0 && (
                <div className='flex justify-center mt-8 py-8'>
                  <div className='relative px-8 py-5 rounded-2xl bg-linear-to-r from-blue-50 via-indigo-50 to-purple-50 dark:from-blue-900/20 dark:via-indigo-900/20 dark:to-purple-900/20 border border-blue-200/50 dark:border-blue-700/50 shadow-lg backdrop-blur-sm overflow-hidden'>
                    <div className='absolute inset-0 bg-linear-to-br from-blue-100/20 to-purple-100/20 dark:from-blue-800/10 dark:to-purple-800/10'></div>
                    <div className='absolute inset-0 bg-linear-to-br from-blue-100/20 to-purple-100/20 dark:from-blue-800/10 dark:to-purple-800/10'></div>
                    <div className='relative flex flex-col items-center gap-2'>
                      <div className='relative'>
                        <div className='w-12 h-12 rounded-full bg-linear-to-br from-blue-500 to-purple-500 flex items-center justify-center shadow-lg'>
                          <svg className='w-7 h-7 text-white' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2.5' d='M5 13l4 4L19 7'></path>
                          </svg>
                        </div>
                        <div className='absolute inset-0 rounded-full bg-blue-400/30 animate-ping'></div>
                      </div>
                      <div className='text-center'>
                        <p className='text-base font-semibold text-gray-800 dark:text-gray-200 mb-1'>已加载全部内容</p>
                        <p className='text-xs text-gray-600 dark:text-gray-400'>共 {allItems.length} 项</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 空状态 */}
              {!isLoading && selectorsReady && allItems.length === 0 && (
                <div className='flex justify-center py-16'>
                  <div className='relative px-12 py-10 rounded-3xl bg-linear-to-br from-gray-50 via-slate-50 to-gray-100 dark:from-gray-800/40 dark:via-slate-800/40 dark:to-gray-800/50 border border-gray-200/50 dark:border-gray-700/50 shadow-xl backdrop-blur-sm overflow-hidden max-w-md'>
                    <div className='absolute top-0 left-0 w-32 h-32 bg-linear-to-br from-blue-200/20 to-purple-200/20 rounded-full blur-3xl'></div>
                    <div className='absolute bottom-0 right-0 w-32 h-32 bg-linear-to-br from-pink-200/20 to-orange-200/20 rounded-full blur-3xl'></div>
                    <div className='relative flex flex-col items-center gap-4'>
                      <div className='relative'>
                        <div className='w-24 h-24 rounded-full bg-linear-to-br from-gray-100 to-slate-200 dark:from-gray-700 dark:to-slate-700 flex items-center justify-center shadow-lg'>
                          <svg className='w-12 h-12 text-gray-400 dark:text-gray-500' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='1.5' d='M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4'></path>
                          </svg>
                        </div>
                        <div className='absolute -top-1 -right-1 w-3 h-3 bg-blue-400 rounded-full animate-ping'></div>
                        <div className='absolute -bottom-1 -left-1 w-2 h-2 bg-purple-400 rounded-full animate-pulse'></div>
                      </div>
                      <div className='text-center space-y-2'>
                        <h3 className='text-xl font-bold text-gray-800 dark:text-gray-200'>暂无相关内容</h3>
                        <p className='text-sm text-gray-600 dark:text-gray-400 max-w-xs'>尝试调整筛选条件或切换其他分类查看更多内容</p>
                      </div>
                      <div className='w-16 h-1 bg-linear-to-r from-transparent via-gray-300 to-transparent dark:via-gray-600 rounded-full'></div>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {/* 传统网格渲染 */}
              <div className='justify-start grid grid-cols-3 gap-x-2 gap-y-12 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] sm:gap-x-8 sm:gap-y-20'>
                {isLoading || !selectorsReady
                  ? skeletonData.map((index) => <DoubanCardSkeleton key={index} />)
                  : allItems.map((item, index) => {
                    const mappedType = type === 'movie' ? 'movie' : type === 'show' ? 'variety' : type === 'tv' ? 'tv' : type === 'anime' ? 'anime' : '';
                    return (
                      <div key={`${item.title}-${index}`} className='w-full'>
                        <VideoCard
                          from='douban'
                          source='douban'
                          id={item.id}
                          source_name='豆瓣'
                          title={item.title}
                          poster={item.poster}
                          douban_id={Number(item.id)}
                          rate={item.rate}
                          year={item.year}
                          type={mappedType}
                          isBangumi={type === 'anime' && primarySelection === '每日放送'}
                          aiEnabled={aiEnabled}
                          aiCheckComplete={aiCheckComplete}
                        />
                      </div>
                    );
                  })}
              </div>

              {/* 加载更多指示器 */}
              {hasNextPage && !isLoading && (
                <div
                  ref={(el) => {
                    if (el && el.offsetParent !== null) {
                      (loadingRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
                    }
                  }}
                  className='flex justify-center mt-12 py-8'
                >
                  {isFetchingNextPage && (
                    <div className='relative px-8 py-4 rounded-2xl bg-linear-to-r from-green-50 via-emerald-50 to-teal-50 dark:from-green-900/20 dark:via-emerald-900/20 dark:to-teal-900/20 border border-green-200/50 dark:border-green-700/50 shadow-lg backdrop-blur-sm overflow-hidden'>
                      {/* 动画背景 */}
                      <div className='absolute inset-0 bg-linear-to-r from-green-400/10 via-emerald-400/10 to-teal-400/10 animate-pulse'></div>

                      {/* 内容 */}
                      <div className='relative flex items-center gap-3'>
                        {/* 旋转圈 */}
                        <div className='relative'>
                          <div className='animate-spin rounded-full h-8 w-8 border-[3px] border-green-200 dark:border-green-800'></div>
                          <div className='absolute inset-0 animate-spin rounded-full h-8 w-8 border-[3px] border-transparent border-t-green-500 dark:border-t-green-400'></div>
                        </div>

                        {/* 文字和点动画 */}
                        <div className='flex items-center gap-1'>
                          <span className='text-sm font-medium text-gray-700 dark:text-gray-300'>加载中</span>
                          <span className='flex gap-0.5'>
                            <span className='animate-bounce' style={{ animationDelay: '0ms' }}>.</span>
                            <span className='animate-bounce' style={{ animationDelay: '150ms' }}>.</span>
                            <span className='animate-bounce' style={{ animationDelay: '300ms' }}>.</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 没有更多数据提示 */}
              {!hasNextPage && allItems.length > 0 && (
                <div className='flex justify-center mt-12 py-8'>
                  <div className='relative px-8 py-5 rounded-2xl bg-linear-to-r from-blue-50 via-indigo-50 to-purple-50 dark:from-blue-900/20 dark:via-indigo-900/20 dark:to-purple-900/20 border border-blue-200/50 dark:border-blue-700/50 shadow-lg backdrop-blur-sm overflow-hidden'>
                    <div className='absolute inset-0 bg-linear-to-br from-blue-100/20 to-purple-100/20 dark:from-blue-800/10 dark:to-purple-800/10'></div>
                    <div className='relative flex flex-col items-center gap-2'>
                      <div className='relative'>
                        <div className='w-12 h-12 rounded-full bg-linear-to-br from-blue-500 to-purple-500 flex items-center justify-center shadow-lg'>
                          <svg className='w-7 h-7 text-white' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2.5' d='M5 13l4 4L19 7'></path>
                          </svg>
                        </div>
                        <div className='absolute inset-0 rounded-full bg-blue-400/30 animate-ping'></div>
                      </div>
                      <div className='text-center'>
                        <p className='text-base font-semibold text-gray-800 dark:text-gray-200 mb-1'>
                          已加载全部内容
                        </p>
                        <p className='text-xs text-gray-600 dark:text-gray-400'>
                          共 {allItems.length} 项
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 空状态 */}
              {!isLoading && allItems.length === 0 && (
                <div className='flex justify-center py-16'>
                  <div className='relative px-12 py-10 rounded-3xl bg-linear-to-br from-gray-50 via-slate-50 to-gray-100 dark:from-gray-800/40 dark:via-slate-800/40 dark:to-gray-800/50 border border-gray-200/50 dark:border-gray-700/50 shadow-xl backdrop-blur-sm overflow-hidden max-w-md'>
                    {/* 装饰性元素 */}
                    <div className='absolute top-0 left-0 w-32 h-32 bg-linear-to-br from-blue-200/20 to-purple-200/20 rounded-full blur-3xl'></div>
                    <div className='absolute bottom-0 right-0 w-32 h-32 bg-linear-to-br from-pink-200/20 to-orange-200/20 rounded-full blur-3xl'></div>

                    {/* 内容 */}
                    <div className='relative flex flex-col items-center gap-4'>
                      {/* 插图图标 */}
                      <div className='relative'>
                        <div className='w-24 h-24 rounded-full bg-linear-to-br from-gray-100 to-slate-200 dark:from-gray-700 dark:to-slate-700 flex items-center justify-center shadow-lg'>
                          <svg className='w-12 h-12 text-gray-400 dark:text-gray-500' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='1.5' d='M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4'></path>
                          </svg>
                        </div>
                        {/* 浮动小点装饰 */}
                        <div className='absolute -top-1 -right-1 w-3 h-3 bg-blue-400 rounded-full animate-ping'></div>
                        <div className='absolute -bottom-1 -left-1 w-2 h-2 bg-purple-400 rounded-full animate-pulse'></div>
                      </div>

                      {/* 文字内容 */}
                      <div className='text-center space-y-2'>
                        <h3 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
                          暂无相关内容
                        </h3>
                        <p className='text-sm text-gray-600 dark:text-gray-400 max-w-xs'>
                          尝试调整筛选条件或切换其他分类查看更多内容
                        </p>
                      </div>

                      {/* 装饰线 */}
                      <div className='w-16 h-1 bg-linear-to-r from-transparent via-gray-300 to-transparent dark:via-gray-600 rounded-full'></div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* 返回顶部悬浮按钮 */}
      <button
        onClick={scrollToTop}
        className={`fixed bottom-20 md:bottom-6 right-6 z-500 w-12 h-12 bg-green-500/90 hover:bg-green-500 text-white rounded-full shadow-lg backdrop-blur-sm transition-all duration-300 ease-in-out flex items-center justify-center group ${showBackToTop
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

export default function DoubanPage() {
  return (
    <Suspense>
      <DoubanPageClient />
    </Suspense>
  );
}
