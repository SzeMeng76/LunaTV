'use client';

/**
 * 收藏查询的 TanStack Query Hook
 *
 * 功能：
 * - 统一管理收藏数据的获取
 * - 自动缓存、去重、后台同步
 * - 替代 db.client.ts 的 getAllFavorites() 直接 fetch
 */

import { useQuery, queryOptions } from '@tanstack/react-query';
import type { Favorite } from '@/lib/types';

// ============================================================================
// Query Options
// ============================================================================

/**
 * 收藏查询配置
 */
export const favoritesQueryOptions = queryOptions({
  queryKey: ['favorites'] as const,
  queryFn: async (): Promise<Record<string, Favorite>> => {
    const response = await fetch('/api/favorites');

    if (!response.ok) {
      throw new Error(`Failed to fetch favorites: ${response.status}`);
    }

    const data = await response.json();
    return data as Record<string, Favorite>;
  },
  staleTime: 5 * 60 * 1000, // 5分钟
  gcTime: 10 * 60 * 1000,   // 10分钟
  retry: 1,
});

// ============================================================================
// Hook: 获取所有收藏
// ============================================================================

/**
 * 获取所有收藏
 *
 * @example
 * ```tsx
 * function MyFavorites() {
 *   const { data, isLoading } = useFavoritesQuery();
 *
 *   if (isLoading) return <div>加载中...</div>;
 *
 *   return <div>{Object.keys(data).length} 个收藏</div>;
 * }
 * ```
 */
export function useFavoritesQuery(options?: { enabled?: boolean }) {
  return useQuery({
    ...favoritesQueryOptions,
    enabled: options?.enabled,
  });
}

// ============================================================================
// Hook: 获取收藏数组（已排序）
// ============================================================================

/**
 * 获取收藏数组（按保存时间降序排序）
 *
 * @example
 * ```tsx
 * function FavoritesList() {
 *   const { data: favorites } = useFavoritesArrayQuery();
 *
 *   return (
 *     <div>
 *       {favorites?.map(fav => (
 *         <div key={fav.key}>{fav.title}</div>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function useFavoritesArrayQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['favorites', 'array'] as const,
    queryFn: async () => {
      const response = await fetch('/api/favorites');

      if (!response.ok) {
        throw new Error(`Failed to fetch favorites: ${response.status}`);
      }

      const data = await response.json() as Record<string, Favorite>;

      // 转换为数组并排序
      const favoritesArray = Object.entries(data).map(([key, favorite]) => ({
        ...favorite,
        key,
      }));

      // 按保存时间降序排序
      return favoritesArray.sort((a, b) => b.save_time - a.save_time);
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
    enabled: options?.enabled,
  });
}

// ============================================================================
// Hook: 检查是否已收藏
// ============================================================================

/**
 * 检查是否已收藏
 *
 * @example
 * ```tsx
 * function FavoriteButton({ source, id }: { source: string; id: string }) {
 *   const { data: isFavorited } = useIsFavoritedQuery(source, id);
 *
 *   return (
 *     <button>
 *       {isFavorited ? '已收藏' : '收藏'}
 *     </button>
 *   );
 * }
 * ```
 */
export function useIsFavoritedQuery(
  source: string,
  id: string,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ['favorites', 'check', source, id] as const,
    queryFn: async () => {
      const response = await fetch('/api/favorites');

      if (!response.ok) {
        throw new Error(`Failed to fetch favorites: ${response.status}`);
      }

      const data = await response.json() as Record<string, Favorite>;
      const key = `${source}+${id}`;

      return !!data[key];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
    enabled: options?.enabled,
  });
}
