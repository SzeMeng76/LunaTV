'use client';

/**
 * TMDB Logo 获取的 TanStack Query Hook
 *
 * 基于项目 useHomePageQueries 的最佳实践实现：
 * 1. 使用 useQueries 并行获取多个 TMDB logo
 * 2. 设置 24 小时 staleTime（TMDB 数据很少变化）
 * 3. 使用 combine 函数聚合查询结果为 Map
 * 4. 自动错误处理和缓存管理
 *
 * 参考：src/hooks/useHomePageQueries.ts
 */

import { useQueries } from '@tanstack/react-query';
import { useCallback } from 'react';

interface TMDBData {
  backdrop: string | null;
  poster: string | null;
  logo: string | null;
  title: string | null;
  overview: string | null;
  rating: number | null;
  year: string | null;
  numberOfSeasons: number | null;
}

/**
 * Fetch TMDB data including logo for a single item
 */
async function fetchTMDBData(title: string, year?: string, type?: string): Promise<TMDBData | null> {
  const params = new URLSearchParams({ title });
  if (year) params.set('year', year);
  if (type) params.set('stype', type);

  const res = await fetch(`/api/tmdb/backdrop?${params.toString()}`);
  if (!res.ok) return null;
  const json = await res.json();
  return json?.data || null;
}

/**
 * Hook to fetch TMDB logos for multiple items using TanStack Query
 * Returns a map of title -> logo URL
 *
 * @example
 * ```tsx
 * const items = [
 *   { title: '肖申克的救赎', year: '1994', type: 'movie' },
 *   { title: '权力的游戏', year: '2011', type: 'tv' },
 * ];
 * const logos = useTMDBLogos(items);
 * // logos = { '肖申克的救赎': 'https://...', '权力的游戏': 'https://...' }
 * ```
 */
export function useTMDBLogos(items: Array<{ title: string; year?: string; type?: string }>): Record<string, string | null> {
  // 使用 useCallback 缓存 combine 函数，避免每次渲染都重新创建
  const combine = useCallback((results: any[]) => {
    // Build a map of title -> logo
    const logosMap: Record<string, string | null> = {};
    items.forEach((item, index) => {
      const result = results[index];
      logosMap[item.title] = result.data?.logo || null;
    });
    return logosMap;
  }, [items]);

  // 使用 useQueries 并行获取所有 TMDB logos
  return useQueries({
    queries: items.map((item) => ({
      queryKey: ['tmdb-logo', item.title, item.year, item.type],
      queryFn: () => fetchTMDBData(item.title, item.year, item.type),
      staleTime: 24 * 60 * 60 * 1000, // 24 hours - TMDB data rarely changes
      gcTime: 7 * 24 * 60 * 60 * 1000, // 7 days
      retry: 1, // 失败重试1次
      enabled: !!item.title, // Only fetch if title exists
    })),
    combine,
  });
}
