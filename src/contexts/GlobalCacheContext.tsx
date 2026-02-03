/* eslint-disable no-console */
'use client';

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { flushSync } from 'react-dom';

import {
  BangumiCalendarData,
  GetBangumiCalendarData,
} from '@/lib/bangumi.client';
import { getDoubanCategories } from '@/lib/douban.client';
import { getRecommendedShortDramas } from '@/lib/shortdrama.client';
import { DoubanItem, ShortDramaItem } from '@/lib/types';

// ============ 类型定义 ============

interface HomePageData {
  hotMovies: DoubanItem[];
  hotTvShows: DoubanItem[];
  hotVarietyShows: DoubanItem[];
  hotAnime: DoubanItem[];
  hotShortDramas: ShortDramaItem[];
  bangumiCalendar: BangumiCalendarData[];
}

interface CacheState {
  // 首页数据
  homeData: HomePageData | null;
  homeLoading: boolean;
  homeError: string | null;
  homeLastFetch: number;
}

interface GlobalCacheContextValue extends CacheState {
  // 首页相关方法
  fetchHomeData: (forceRefresh?: boolean) => Promise<void>;
  updateHomeDataPartial: (updates: Partial<HomePageData>) => void;

  // 通用方法
  clearAllCache: () => void;
}

// ============ 常量 ============

const STALE_TIME = 5 * 60 * 1000; // 5分钟视为过期，触发后台更新

// ============ Context 创建 ============

const GlobalCacheContext = createContext<GlobalCacheContextValue | null>(null);

// ============ Provider 实现 ============

export function GlobalCacheProvider({ children }: { children: ReactNode }) {
  // === 首页数据状态 ===
  const [homeData, setHomeData] = useState<HomePageData | null>(null);
  const [homeLoading, setHomeLoading] = useState(false);
  const [homeError, setHomeError] = useState<string | null>(null);
  const [homeLastFetch, setHomeLastFetch] = useState(0);

  // === 防止并发请求的锁 ===
  const fetchingRef = useRef<Set<string>>(new Set());

  // === 首页数据获取（Stale-While-Revalidate 策略） ===
  const fetchHomeData = useCallback(
    async (forceRefresh = false) => {
      const cacheKey = 'home-page-data';

      // 防止重复请求
      if (fetchingRef.current.has(cacheKey)) {
        console.log('[GlobalCache] 首页数据请求正在进行中，跳过');
        return;
      }

      // 检查是否需要刷新
      const now = Date.now();
      const isStale = now - homeLastFetch > STALE_TIME;

      if (!forceRefresh && homeData && !isStale) {
        console.log('[GlobalCache] 首页数据新鲜，无需刷新');
        return; // 数据新鲜，无需刷新
      }

      // 如果有缓存数据且非强制刷新，先返回缓存（SWR 策略）
      if (homeData && !forceRefresh) {
        console.log('[GlobalCache] 首页数据过期，后台静默更新...');
        // 数据过期，后台静默更新（不显示 loading）
        fetchingRef.current.add(cacheKey);

        try {
          const freshData = await fetchHomeDataFromAPI();
          // 使用 flushSync 强制同步更新
          flushSync(() => {
            setHomeData(freshData);
            setHomeLastFetch(Date.now());
          });
          console.log('[GlobalCache] 首页数据后台更新完成');
        } catch (error) {
          console.error('[GlobalCache] 后台更新首页数据失败:', error);
        } finally {
          fetchingRef.current.delete(cacheKey);
        }
        return;
      }

      // 无缓存或强制刷新，显示 loading
      console.log('[GlobalCache] 首页数据加载中...');
      fetchingRef.current.add(cacheKey);
      setHomeLoading(true);
      setHomeError(null);

      try {
        const freshData = await fetchHomeDataFromAPI();
        // 使用 flushSync 强制同步更新，避免批处理延迟
        flushSync(() => {
          setHomeData(freshData);
          setHomeLastFetch(Date.now());
        });
        console.log('[GlobalCache] 首页数据加载完成');
      } catch (error) {
        setHomeError(error instanceof Error ? error.message : '加载失败');
        console.error('[GlobalCache] 首页数据加载失败:', error);
      } finally {
        setHomeLoading(false);
        fetchingRef.current.delete(cacheKey);
      }
    },
    [homeData, homeLastFetch]
  );

  // === 部分更新首页数据（用于详情加载后更新） ===
  const updateHomeDataPartial = useCallback((updates: Partial<HomePageData>) => {
    setHomeData((prev) => {
      if (!prev) return prev;
      return { ...prev, ...updates };
    });
  }, []);

  // === 清除所有缓存 ===
  const clearAllCache = useCallback(() => {
    setHomeData(null);
    setHomeLastFetch(0);
    setHomeError(null);
    console.log('[GlobalCache] 所有缓存已清除');
  }, []);

  // === Context Value ===
  const value = useMemo<GlobalCacheContextValue>(
    () => ({
      homeData,
      homeLoading,
      homeError,
      homeLastFetch,
      fetchHomeData,
      updateHomeDataPartial,
      clearAllCache,
    }),
    [
      homeData,
      homeLoading,
      homeError,
      homeLastFetch,
      fetchHomeData,
      updateHomeDataPartial,
      clearAllCache,
    ]
  );

  return (
    <GlobalCacheContext.Provider value={value}>
      {children}
    </GlobalCacheContext.Provider>
  );
}

// ============ Hook ============

export function useGlobalCache() {
  const context = useContext(GlobalCacheContext);
  if (!context) {
    throw new Error('useGlobalCache must be used within GlobalCacheProvider');
  }
  return context;
}

// ============ 辅助函数：并行获取首页数据 ============

async function fetchHomeDataFromAPI(): Promise<HomePageData> {
  // 使用 Promise.allSettled 并行加载，任一失败不影响其他
  const results = await Promise.allSettled([
    getDoubanCategories({
      kind: 'movie',
      category: '热门',
      type: '全部',
    }),
    getDoubanCategories({ kind: 'tv', category: 'tv', type: 'tv' }),
    getDoubanCategories({ kind: 'tv', category: 'show', type: 'show' }),
    getDoubanCategories({ kind: 'tv', category: 'tv', type: 'tv_animation' }),
    getRecommendedShortDramas(undefined, 8),
    GetBangumiCalendarData(),
  ]);

  const [moviesResult, tvResult, varietyResult, animeResult, shortDramasResult, bangumiResult] = results;

  return {
    hotMovies:
      moviesResult.status === 'fulfilled' && moviesResult.value.code === 200
        ? moviesResult.value.list
        : [],
    hotTvShows:
      tvResult.status === 'fulfilled' && tvResult.value.code === 200
        ? tvResult.value.list
        : [],
    hotVarietyShows:
      varietyResult.status === 'fulfilled' && varietyResult.value.code === 200
        ? varietyResult.value.list
        : [],
    hotAnime:
      animeResult.status === 'fulfilled' && animeResult.value.code === 200
        ? animeResult.value.list
        : [],
    hotShortDramas:
      shortDramasResult.status === 'fulfilled' ? shortDramasResult.value : [],
    bangumiCalendar:
      bangumiResult.status === 'fulfilled' ? bangumiResult.value : [],
  };
}
