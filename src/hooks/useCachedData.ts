/**
 * useCachedData - 统一缓存数据获取 Hook
 *
 * 功能：
 * - 缓存优先策略 (Cache-First)
 * - 自动防抖 (避免快速切换时的重复请求)
 * - 竞态处理 (防止旧请求覆盖新请求)
 * - 自动缓存管理 (TTL、过期清理)
 * - 支持手动刷新
 *
 * 示例：
 * ```tsx
 * const { data, loading, error, fromCache, refresh } = useCachedData({
 *   cacheKey: 'douban-movie-hot',
 *   fetchFn: async () => getDoubanCategories({ type: 'movie', category: 'hot' }),
 *   ttl: 3600, // 1小时
 *   debounceMs: 100,
 * });
 * ```
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { globalCache } from '@/lib/unified-cache';

interface UseCachedDataOptions<T> {
  /**
   * 缓存键，必须唯一
   */
  cacheKey: string;

  /**
   * 数据获取函数
   */
  fetchFn: () => Promise<T>;

  /**
   * 缓存有效期（秒），默认 3600 秒 (1小时)
   */
  ttl?: number;

  /**
   * 防抖延迟（毫秒），默认 100ms
   * 用于避免快速切换时的重复请求
   */
  debounceMs?: number;

  /**
   * 是否启用缓存，默认 true
   */
  enableCache?: boolean;

  /**
   * 是否在组件挂载时自动获取数据，默认 true
   */
  autoFetch?: boolean;

  /**
   * 依赖项数组，当依赖变化时重新获取数据
   */
  dependencies?: any[];
}

interface UseCachedDataReturn<T> {
  /**
   * 缓存或获取的数据
   */
  data: T | null;

  /**
   * 加载状态
   */
  loading: boolean;

  /**
   * 错误信息
   */
  error: Error | null;

  /**
   * 数据是否来自缓存
   */
  fromCache: boolean;

  /**
   * 手动刷新数据（忽略缓存）
   */
  refresh: () => Promise<void>;

  /**
   * 手动获取数据（优先使用缓存）
   */
  fetch: () => Promise<void>;
}

export function useCachedData<T>({
  cacheKey,
  fetchFn,
  ttl = 3600,
  debounceMs = 100,
  enableCache = true,
  autoFetch = true,
  dependencies = [],
}: UseCachedDataOptions<T>): UseCachedDataReturn<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(autoFetch);
  const [error, setError] = useState<Error | null>(null);
  const [fromCache, setFromCache] = useState<boolean>(false);

  // 请求ID，用于竞态处理
  const requestIdRef = useRef<number>(0);
  const currentRequestId = useRef<number>(0);

  // 防抖定时器
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 是否已挂载（避免在卸载后设置状态）
  const isMountedRef = useRef<boolean>(true);

  /**
   * 核心数据获取逻辑
   */
  const fetchData = useCallback(
    async (ignoreCache = false) => {
      // 1. 缓存优先 (~0ms)
      if (enableCache && !ignoreCache) {
        const cached = globalCache.get<T>(cacheKey);
        if (cached !== null) {
          console.log(`[useCachedData] Cache hit: ${cacheKey}`);

          if (isMountedRef.current) {
            setData(cached);
            setFromCache(true);
            setLoading(false);
            setError(null);
          }
          return;
        }
      }

      // 2. 生成新的请求ID（用于竞态检测）
      const thisRequestId = ++requestIdRef.current;
      currentRequestId.current = thisRequestId;

      console.log(`[useCachedData] Fetching: ${cacheKey} (requestId: ${thisRequestId})`);

      if (isMountedRef.current) {
        setLoading(true);
        setFromCache(false);
        setError(null);
      }

      try {
        // 3. 调用数据获取函数
        const result = await fetchFn();

        // 4. 竞态检测：只有最新的请求结果才生效
        if (currentRequestId.current !== thisRequestId) {
          console.log(`[useCachedData] Stale request detected, ignoring (requestId: ${thisRequestId})`);
          return;
        }

        // 5. 更新状态
        if (isMountedRef.current) {
          setData(result);
          setLoading(false);
          setError(null);
        }

        // 6. 保存到缓存
        if (enableCache) {
          globalCache.set(cacheKey, result, ttl);
          console.log(`[useCachedData] Cached: ${cacheKey} (TTL: ${ttl}s)`);
        }
      } catch (err) {
        // 竞态检测
        if (currentRequestId.current !== thisRequestId) {
          return;
        }

        const error = err instanceof Error ? err : new Error(String(err));
        console.error(`[useCachedData] Error fetching ${cacheKey}:`, error);

        if (isMountedRef.current) {
          setError(error);
          setLoading(false);
        }
      }
    },
    [cacheKey, fetchFn, ttl, enableCache]
  );

  /**
   * 防抖的数据获取
   */
  const debouncedFetch = useCallback(
    (ignoreCache = false) => {
      // 清除之前的定时器
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // 如果没有防抖延迟，直接执行
      if (debounceMs === 0) {
        fetchData(ignoreCache);
        return;
      }

      // 设置新的防抖定时器
      debounceTimerRef.current = setTimeout(() => {
        fetchData(ignoreCache);
      }, debounceMs);
    },
    [fetchData, debounceMs]
  );

  /**
   * 手动刷新（忽略缓存）
   */
  const refresh = useCallback(async () => {
    await fetchData(true);
  }, [fetchData]);

  /**
   * 手动获取（优先缓存）
   */
  const fetch = useCallback(async () => {
    await fetchData(false);
  }, [fetchData]);

  // 自动获取数据
  useEffect(() => {
    if (!autoFetch) return;

    debouncedFetch(false);

    // 清理防抖定时器
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [cacheKey, ...dependencies]);

  // 组件卸载时标记
  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;

      // 清理防抖定时器
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return {
    data,
    loading,
    error,
    fromCache,
    refresh,
    fetch,
  };
}
