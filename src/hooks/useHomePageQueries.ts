'use client';

/**
 * 首页数据获取的 TanStack Query Hooks
 *
 * 基于 TanStack Query 源码最佳实践实现：
 * 1. 使用 useQueries 并行获取多个数据源
 * 2. 设置合适的 staleTime 避免重复请求
 * 3. 使用 combine 函数聚合查询结果
 * 4. 自动错误处理和重试机制
 *
 * 参考：
 * - TanStack Query useQueries 源码
 * - Promise.allSettled 模式
 * - Stale-While-Revalidate 策略
 */

import { useQueries } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import {
  BangumiCalendarData,
  GetBangumiCalendarData,
} from '@/lib/bangumi.client';
import { getDoubanCategories } from '@/lib/douban.client';
import { getRecommendedShortDramas } from '@/lib/shortdrama.client';
import { DoubanItem, ShortDramaItem } from '@/lib/types';

// ============================================================================
// 类型定义
// ============================================================================

export interface HomePageData {
  hotMovies: DoubanItem[];
  hotTvShows: DoubanItem[];
  hotVarietyShows: DoubanItem[];
  hotAnime: DoubanItem[];
  hotShortDramas: ShortDramaItem[];
  bangumiCalendar: BangumiCalendarData[];
}

export interface HomePageQueriesResult {
  data: HomePageData;
  isLoading: boolean;
  isFetching: boolean;
  errors: Error[];
  hasError: boolean;
  refetch: () => void;
}

// ============================================================================
// Hook: 首页数据查询
// ============================================================================

/**
 * 首页数据查询 Hook
 *
 * 特性：
 * - 并行获取 6 个数据源（热门电影、电视剧、综艺、动漫、短剧、番剧日历）
 * - 不同数据类型设置不同的 staleTime
 * - 使用 combine 函数聚合结果，减少重渲染
 * - 任一查询失败不影响其他查询
 * - 自动重试失败的请求
 *
 * staleTime 配置：
 * - 热门内容（电影/电视剧/综艺/动漫）: 2分钟 - 更新较频繁
 * - 短剧推荐: 5分钟 - 更新较慢
 * - 番剧日历: 10分钟 - 每日更新，可以缓存更久
 *
 * @example
 * ```tsx
 * function HomePage() {
 *   const { data, isLoading, errors } = useHomePageQueries();
 *
 *   if (isLoading) return <LoadingSpinner />;
 *
 *   return (
 *     <div>
 *       <HotMovies movies={data.hotMovies} />
 *       <HotTVShows shows={data.hotTvShows} />
 *       {errors.length > 0 && <ErrorBanner errors={errors} />}
 *     </div>
 *   );
 * }
 * ```
 */
export function useHomePageQueries(): HomePageQueriesResult {
  // 使用 useCallback 缓存 combine 函数，避免每次渲染都重新创建
  const combine = useCallback((results: any[]) => {
    const [
      moviesResult,
      tvResult,
      varietyResult,
      animeResult,
      shortDramasResult,
      bangumiResult,
    ] = results;

    // 聚合数据
    const data: HomePageData = {
      hotMovies:
        moviesResult.data?.code === 200 ? moviesResult.data.list : [],
      hotTvShows: tvResult.data?.code === 200 ? tvResult.data.list : [],
      hotVarietyShows:
        varietyResult.data?.code === 200 ? varietyResult.data.list : [],
      hotAnime: animeResult.data?.code === 200 ? animeResult.data.list : [],
      hotShortDramas: shortDramasResult.data || [],
      bangumiCalendar: bangumiResult.data || [],
    };

    // 聚合加载状态
    const isLoading = results.some((r) => r.isLoading);
    const isFetching = results.some((r) => r.isFetching);

    // 聚合错误
    const errors = results
      .filter((r) => r.error)
      .map((r) => r.error as Error);
    const hasError = errors.length > 0;

    // 聚合 refetch 函数
    const refetch = () => {
      results.forEach((r) => r.refetch());
    };

    return {
      data,
      isLoading,
      isFetching,
      errors,
      hasError,
      refetch,
    };
  }, []);

  // 使用 useQueries 并行获取所有数据
  const result = useQueries({
    queries: [
      // 1. 热门电影
      {
        queryKey: ['douban', 'categories', 'movie', '热门', '全部'],
        queryFn: () =>
          getDoubanCategories({
            kind: 'movie',
            category: '热门',
            type: '全部',
          }),
        staleTime: 2 * 60 * 1000, // 2分钟 - 热门内容更新较频繁
        gcTime: 10 * 60 * 1000, // 10分钟
        retry: 2, // 失败重试2次
      },
      // 2. 热门电视剧
      {
        queryKey: ['douban', 'categories', 'tv', 'tv', 'tv'],
        queryFn: () =>
          getDoubanCategories({ kind: 'tv', category: 'tv', type: 'tv' }),
        staleTime: 2 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
        retry: 2,
      },
      // 3. 热门综艺
      {
        queryKey: ['douban', 'categories', 'tv', 'show', 'show'],
        queryFn: () =>
          getDoubanCategories({ kind: 'tv', category: 'show', type: 'show' }),
        staleTime: 2 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
        retry: 2,
      },
      // 4. 热门动漫
      {
        queryKey: ['douban', 'categories', 'tv', 'tv', 'tv_animation'],
        queryFn: () =>
          getDoubanCategories({
            kind: 'tv',
            category: 'tv',
            type: 'tv_animation',
          }),
        staleTime: 2 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
        retry: 2,
      },
      // 5. 短剧推荐
      {
        queryKey: ['shortdramas', 'recommended', 8],
        queryFn: () => getRecommendedShortDramas(undefined, 8),
        staleTime: 5 * 60 * 1000, // 5分钟 - 短剧推荐更新较慢
        gcTime: 15 * 60 * 1000, // 15分钟
        retry: 2,
      },
      // 6. 番剧日历
      {
        queryKey: ['bangumi', 'calendar'],
        queryFn: () => GetBangumiCalendarData(),
        staleTime: 10 * 60 * 1000, // 10分钟 - 每日更新，可以缓存更久
        gcTime: 30 * 60 * 1000, // 30分钟
        retry: 2,
      },
    ],
    combine,
  });

  return result;
}
