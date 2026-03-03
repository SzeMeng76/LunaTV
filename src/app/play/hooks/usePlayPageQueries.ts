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

import { useQuery } from '@tanstack/react-query';
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
 * 豆瓣详情查询 Hook
 *
 * 特性：
 * - 依赖查询：只在 doubanId 存在时执行
 * - 长缓存：30分钟 staleTime（外部 API 数据变化少）
 * - 自动重试：失败后重试 2 次
 * - 自动缓存：相同 doubanId 不会重复请求
 *
 * @param doubanId - 豆瓣 ID
 * @param enabled - 是否启用查询（默认根据 doubanId 判断）
 *
 * @example
 * ```tsx
 * function VideoPlayer({ video }) {
 *   const { data: doubanInfo, status } = useDoubanDetailsQuery(video.doubanId);
 *
 *   if (status === 'pending') return <Skeleton />;
 *   if (status === 'success') return <DoubanCard data={doubanInfo} />;
 * }
 * ```
 */
export function useDoubanDetailsQuery(
  doubanId?: number | string,
  enabled?: boolean
): UseQueryResult<any, Error> {
  return useQuery({
    queryKey: ['douban', 'details', doubanId],
    queryFn: async () => {
      if (!doubanId) throw new Error('Douban ID is required');
      const result = await getDoubanDetails(String(doubanId));
      // ✅ 返回 data 对象，保持与原代码一致
      if (result.code === 200 && result.data && result.data.title) {
        return result.data;
      }
      return null;
    },
    enabled: enabled !== undefined ? enabled : !!doubanId,
    staleTime: 30 * 60 * 1000, // 30分钟 - 外部 API 数据变化很少
    gcTime: 60 * 60 * 1000, // 1小时
    retry: 2, // 失败重试 2 次
  });
}

// ============================================================================
// Hook: 豆瓣评论查询
// ============================================================================

/**
 * 豆瓣评论查询 Hook
 *
 * 特性：
 * - 依赖查询：只在 doubanId 存在时执行
 * - 中等缓存：5分钟 staleTime（评论更新较频繁）
 * - 自动重试：失败后重试 2 次
 *
 * @param doubanId - 豆瓣 ID
 * @param enabled - 是否启用查询（默认根据 doubanId 判断）
 *
 * @example
 * ```tsx
 * function Comments({ doubanId }) {
 *   const { data: comments, status } = useDoubanCommentsQuery(doubanId);
 *
 *   if (status === 'pending') return <div>Loading comments...</div>;
 *   return <CommentList comments={comments} />;
 * }
 * ```
 */
export function useDoubanCommentsQuery(
  doubanId?: number | string,
  enabled?: boolean
): UseQueryResult<any, Error> {
  return useQuery({
    queryKey: ['douban', 'comments', doubanId],
    queryFn: async () => {
      if (!doubanId) throw new Error('Douban ID is required');
      const result = await getDoubanComments({
        id: String(doubanId),
        start: 0,
        limit: 10,
        sort: 'new_score',
      });
      // ✅ 返回 comments 数组，保持与原代码一致
      if (result.code === 200 && result.data) {
        return result.data.comments;
      }
      return [];
    },
    enabled: enabled !== undefined ? enabled : !!doubanId,
    staleTime: 5 * 60 * 1000, // 5分钟 - 评论更新较频繁
    gcTime: 15 * 60 * 1000, // 15分钟
    retry: 2,
  });
}

// ============================================================================
// Hook: Bangumi 详情查询
// ============================================================================

/**
 * Bangumi 详情查询 Hook
 *
 * 特性：
 * - 依赖查询：只在 bangumiId 存在时执行
 * - 长缓存：30分钟 staleTime（外部 API 数据变化少）
 * - 自动重试：失败后重试 2 次
 *
 * @param bangumiId - Bangumi ID
 * @param enabled - 是否启用查询
 *
 * @example
 * ```tsx
 * const { data: bangumiInfo } = useBangumiDetailsQuery(video.bangumiId);
 * ```
 */
export function useBangumiDetailsQuery(
  bangumiId?: number | string,
  enabled?: boolean
): UseQueryResult<any, Error> {
  return useQuery({
    queryKey: ['bangumi', 'details', bangumiId],
    queryFn: async () => {
      if (!bangumiId) throw new Error('Bangumi ID is required');
      // TODO: 实现 getBangumiDetails 函数
      const response = await fetch(`/api/bangumi/${bangumiId}`);
      if (!response.ok) throw new Error('Failed to fetch Bangumi details');
      return response.json();
    },
    enabled: enabled !== undefined ? enabled : !!bangumiId,
    staleTime: 30 * 60 * 1000, // 30分钟
    gcTime: 60 * 60 * 1000, // 1小时
    retry: 2,
  });
}

// ============================================================================
// Hook: 短剧详情查询
// ============================================================================

/**
 * 短剧详情查询 Hook
 *
 * 特性：
 * - 依赖查询：只在 shortdramaId 存在时执行
 * - 中等缓存：10分钟 staleTime
 * - 自动重试：失败后重试 2 次
 *
 * @param shortdramaId - 短剧 ID
 * @param enabled - 是否启用查询
 *
 * @example
 * ```tsx
 * const { data: shortdramaInfo } = useShortdramaDetailsQuery(id);
 * ```
 */
export function useShortdramaDetailsQuery(
  shortdramaId?: string,
  enabled?: boolean
): UseQueryResult<any, Error> {
  return useQuery({
    queryKey: ['shortdrama', 'details', shortdramaId],
    queryFn: async () => {
      if (!shortdramaId) throw new Error('Shortdrama ID is required');
      // TODO: 实现 getShortdramaDetails 函数
      const response = await fetch(`/api/shortdrama/${shortdramaId}`);
      if (!response.ok) throw new Error('Failed to fetch shortdrama details');
      return response.json();
    },
    enabled: enabled !== undefined ? enabled : !!shortdramaId,
    staleTime: 10 * 60 * 1000, // 10分钟
    gcTime: 30 * 60 * 1000, // 30分钟
    retry: 2,
  });
}
