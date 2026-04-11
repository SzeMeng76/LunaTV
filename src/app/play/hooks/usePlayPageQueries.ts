'use client';

/**
 * Play Page 数据查询的 TanStack Query Hooks
 *
 * 基于 TanStack Query 源码最佳实践实现：
 * 1. 使用 useQuery 替代 useState + useEffect
 * 2. 实现依赖查询（dependent queries）
 * 3. 设置合适的 staleTime 避免重复请求
 * 4. 自动缓存、重试、后台刷新
 *
 * 参考：
 * - TanStack Query useQuery 源码
 * - Dependent Queries 模式
 * - External API 缓存策略
 */

import { useQuery, queryOptions } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { getDoubanDetails, getDoubanComments } from '@/lib/douban.client';

// ============================================================================
// 类型定义
// ============================================================================

export interface DoubanDetails {
  id: string;
  title: string;
  rating: number;
  year: string;
  directors: string[];
  actors: string[];
  genres: string[];
  summary: string;
  poster: string;
  [key: string]: any;
}

export interface DoubanComment {
  author: string;
  content: string;
  rating: number;
  time: string;
  [key: string]: any;
}

// ============================================================================
// Hook: 豆瓣详情查询
// ============================================================================

/**
 * Query options for Douban details
 */
const doubanDetailsOptions = (doubanId?: number | string) => queryOptions({
  queryKey: ['douban', 'details', doubanId],
  queryFn: async () => {
    if (!doubanId) throw new Error('Douban ID is required');
    const result = await getDoubanDetails(String(doubanId));
    if (result.code === 200 && result.data && result.data.title) {
      return result.data;
    }
    return null;
  },
  staleTime: 30 * 60 * 1000, // 30分钟 - 外部 API 数据变化很少
  gcTime: 60 * 60 * 1000, // 1小时
  retry: 2, // 失败重试 2 次
});

/**
 * 豆瓣详情查询 Hook
 */
export function useDoubanDetailsQuery(
  doubanId?: number | string,
  enabled?: boolean
): UseQueryResult<any, Error> {
  return useQuery({
    ...doubanDetailsOptions(doubanId),
    enabled: enabled !== undefined ? enabled : !!doubanId,
  });
}

// ============================================================================
// Hook: 豆瓣评论查询
// ============================================================================

/**
 * Query options for Douban comments
 */
const doubanCommentsOptions = (doubanId?: number | string) => queryOptions({
  queryKey: ['douban', 'comments', doubanId],
  queryFn: async () => {
    if (!doubanId) throw new Error('Douban ID is required');
    const result = await getDoubanComments({
      id: String(doubanId),
      start: 0,
      limit: 10,
      sort: 'new_score',
    });
    if (result.code === 200 && result.data) {
      return result.data.comments;
    }
    return [];
  },
  staleTime: 5 * 60 * 1000, // 5分钟 - 评论更新较频繁
  gcTime: 15 * 60 * 1000, // 15分钟
  retry: 2,
});

/**
 * 豆瓣评论查询 Hook
 */
export function useDoubanCommentsQuery(
  doubanId?: number | string,
  enabled?: boolean
): UseQueryResult<any, Error> {
  return useQuery({
    ...doubanCommentsOptions(doubanId),
    enabled: enabled !== undefined ? enabled : !!doubanId,
  });
}

// ============================================================================
// Hook: Bangumi 详情查询
// ============================================================================

/**
 * Query options for Bangumi details
 */
const bangumiDetailsOptions = (bangumiId?: number | string) => queryOptions({
  queryKey: ['bangumi', 'details', bangumiId],
  queryFn: async () => {
    if (!bangumiId) throw new Error('Bangumi ID is required');
    const response = await fetch(`/api/bangumi/${bangumiId}`);
    if (!response.ok) throw new Error('Failed to fetch Bangumi details');
    return response.json();
  },
  staleTime: 30 * 60 * 1000, // 30分钟
  gcTime: 60 * 60 * 1000, // 1小时
  retry: 2,
});

/**
 * Bangumi 详情查询 Hook
 */
export function useBangumiDetailsQuery(
  bangumiId?: number | string,
  enabled?: boolean
): UseQueryResult<any, Error> {
  return useQuery({
    ...bangumiDetailsOptions(bangumiId),
    enabled: enabled !== undefined ? enabled : !!bangumiId,
  });
}

// ============================================================================
// Hook: 短剧详情查询
// ============================================================================

/**
 * Query options for shortdrama details
 */
const shortdramaDetailsOptions = (shortdramaId?: string) => queryOptions({
  queryKey: ['shortdrama', 'details', shortdramaId],
  queryFn: async () => {
    if (!shortdramaId) throw new Error('Shortdrama ID is required');
    const response = await fetch(`/api/shortdrama/${shortdramaId}`);
    if (!response.ok) throw new Error('Failed to fetch shortdrama details');
    return response.json();
  },
  staleTime: 10 * 60 * 1000, // 10分钟
  gcTime: 30 * 60 * 1000, // 30分钟
  retry: 2,
});

/**
 * 短剧详情查询 Hook
 */
export function useShortdramaDetailsQuery(
  shortdramaId?: string,
  enabled?: boolean
): UseQueryResult<any, Error> {
  return useQuery({
    ...shortdramaDetailsOptions(shortdramaId),
    enabled: enabled !== undefined ? enabled : !!shortdramaId,
  });
}
