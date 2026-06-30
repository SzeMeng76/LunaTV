'use client';

/**
 * 播放记录查询的 TanStack Query Hook
 *
 * 功能：
 * - 统一管理播放记录的数据获取
 * - 自动缓存、去重、后台同步
 * - 替代 db.client.ts 的 getAllPlayRecords() 直接 fetch
 *
 * 基于 TanStack Query 最佳实践：
 * - 使用 queryOptions 创建可复用的查询配置
 * - staleTime: 数据新鲜时间，期间不会重新请求
 * - gcTime: 垃圾回收时间，未使用的缓存保留时长
 * - 自动请求去重：多个组件同时调用只发一次请求
 */

import { useQuery, queryOptions } from '@tanstack/react-query';
import type { PlayRecord } from '@/lib/types';

// ============================================================================
// Query Options（可复用的查询配置）
// ============================================================================

/**
 * 播放记录查询配置
 *
 * 使用 queryOptions 的好处：
 * 1. 类型安全：自动推断返回类型
 * 2. 可复用：多个地方可以使用相同的配置
 * 3. 可组合：可以在其他 query 中引用
 */
export const playRecordsQueryOptions = queryOptions({
  queryKey: ['playRecords'] as const,
  queryFn: async (): Promise<Record<string, PlayRecord>> => {
    const response = await fetch('/api/playrecords');

    if (!response.ok) {
      throw new Error(`Failed to fetch play records: ${response.status}`);
    }

    const data = await response.json();
    return data as Record<string, PlayRecord>;
  },
  // 5分钟内数据被认为是新鲜的，不会重新请求
  staleTime: 5 * 60 * 1000,
  // 10分钟后未使用的缓存会被垃圾回收
  gcTime: 10 * 60 * 1000,
  // 重试1次（默认3次太多）
  retry: 1,
});

// ============================================================================
// Hook: 获取所有播放记录
// ============================================================================

/**
 * 获取所有播放记录
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { data, isLoading, error } = usePlayRecordsQuery();
 *
 *   if (isLoading) return <div>加载中...</div>;
 *   if (error) return <div>加载失败</div>;
 *
 *   return <div>{Object.keys(data).length} 条记录</div>;
 * }
 * ```
 *
 * @example 条件查询
 * ```tsx
 * function MyComponent({ shouldFetch }: { shouldFetch: boolean }) {
 *   const { data } = usePlayRecordsQuery({ enabled: shouldFetch });
 * }
 * ```
 */
export function usePlayRecordsQuery(options?: { enabled?: boolean }) {
  return useQuery({
    ...playRecordsQueryOptions,
    enabled: options?.enabled,
  });
}

// ============================================================================
// Hook: 获取播放记录数组（已排序）
// ============================================================================

/**
 * 获取播放记录数组（按保存时间降序排序）
 *
 * 适用场景：需要遍历显示播放记录列表
 *
 * @example
 * ```tsx
 * function ContinueWatching() {
 *   const { data: records } = usePlayRecordsArrayQuery();
 *
 *   return (
 *     <div>
 *       {records?.map(record => (
 *         <div key={record.key}>{record.title}</div>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function usePlayRecordsArrayQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['playRecords', 'array'] as const,
    queryFn: async () => {
      const response = await fetch('/api/playrecords');

      if (!response.ok) {
        throw new Error(`Failed to fetch play records: ${response.status}`);
      }

      const data = await response.json() as Record<string, PlayRecord>;

      // 转换为数组并排序
      const recordsArray = Object.entries(data).map(([key, record]) => ({
        ...record,
        key,
      }));

      // 按保存时间降序排序
      return recordsArray.sort((a, b) => b.save_time - a.save_time);
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
    enabled: options?.enabled,
  });
}

// ============================================================================
// Hook: 获取单个播放记录
// ============================================================================

/**
 * 获取单个播放记录
 *
 * @example
 * ```tsx
 * function VideoPlayer({ source, id }: { source: string; id: string }) {
 *   const { data: record } = usePlayRecordQuery(source, id);
 *
 *   return <div>上次播放到: {record?.play_time}秒</div>;
 * }
 * ```
 */
export function usePlayRecordQuery(
  source: string,
  id: string,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ['playRecords', 'single', source, id] as const,
    queryFn: async () => {
      const response = await fetch('/api/playrecords');

      if (!response.ok) {
        throw new Error(`Failed to fetch play records: ${response.status}`);
      }

      const data = await response.json() as Record<string, PlayRecord>;
      const key = `${source}+${id}`;

      return data[key] || null;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
    enabled: options?.enabled,
  });
}
