'use client';

/**
 * 数据源查询的 TanStack Query Hook
 *
 * 功能：
 * - 统一管理数据源列表的获取
 * - 自动缓存、去重（10分钟缓存）
 * - 提供 source name -> source key 的映射
 * - 替代 watching-updates.ts 的手动缓存实现
 */

import { useQuery, queryOptions } from '@tanstack/react-query';

// ============================================================================
// Types
// ============================================================================

export interface Source {
  key: string;
  name: string;
  [key: string]: any;
}

// ============================================================================
// Query Options
// ============================================================================

/**
 * 数据源查询配置
 */
export const sourcesQueryOptions = queryOptions({
  queryKey: ['sources'] as const,
  queryFn: async (): Promise<Source[]> => {
    const response = await fetch('/api/sources');

    if (!response.ok) {
      throw new Error(`Failed to fetch sources: ${response.status}`);
    }

    const data = await response.json();
    return data as Source[];
  },
  // 数据源列表不常变化，10分钟缓存
  staleTime: 10 * 60 * 1000,
  // 30分钟后垃圾回收
  gcTime: 30 * 60 * 1000,
  retry: 1,
});

// ============================================================================
// Hook: 获取数据源列表
// ============================================================================

/**
 * 获取数据源列表
 *
 * @example
 * ```tsx
 * function SourceSelector() {
 *   const { data: sources } = useSourcesQuery();
 *
 *   return (
 *     <select>
 *       {sources?.map(source => (
 *         <option key={source.key} value={source.key}>
 *           {source.name}
 *         </option>
 *       ))}
 *     </select>
 *   );
 * }
 * ```
 */
export function useSourcesQuery(options?: { enabled?: boolean }) {
  return useQuery({
    ...sourcesQueryOptions,
    enabled: options?.enabled,
  });
}

// ============================================================================
// Hook: 获取数据源映射表
// ============================================================================

/**
 * 获取数据源映射表（name -> key, key -> key）
 *
 * 用于 watching-updates.ts 的数据源名称映射
 *
 * @example
 * ```tsx
 * function WatchingUpdates() {
 *   const { data: sourceMap } = useSourceMapQuery();
 *
 *   // sourceMap.get('量子资源') => 'lzm3u8'
 *   // sourceMap.get('lzm3u8') => 'lzm3u8'
 *   const sourceKey = sourceMap?.get(record.source_name);
 * }
 * ```
 */
export function useSourceMapQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['sources', 'map'] as const,
    queryFn: async () => {
      const response = await fetch('/api/sources');

      if (!response.ok) {
        throw new Error(`Failed to fetch sources: ${response.status}`);
      }

      const sources = await response.json() as Source[];

      // 构建 Map：name -> key, key -> key
      const sourceMap = new Map<string, string>();

      sources.forEach((source) => {
        if (source?.key) {
          // key -> key
          sourceMap.set(source.key, source.key);
        }
        if (source?.name && source?.key) {
          // name -> key
          sourceMap.set(source.name, source.key);
        }
      });

      return sourceMap;
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    enabled: options?.enabled,
  });
}

// ============================================================================
// Hook: 根据 key 查找数据源
// ============================================================================

/**
 * 根据 key 查找数据源
 *
 * @example
 * ```tsx
 * function SourceInfo({ sourceKey }: { sourceKey: string }) {
 *   const { data: source } = useSourceByKeyQuery(sourceKey);
 *
 *   return <div>{source?.name}</div>;
 * }
 * ```
 */
export function useSourceByKeyQuery(
  sourceKey: string,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ['sources', 'byKey', sourceKey] as const,
    queryFn: async () => {
      const response = await fetch('/api/sources');

      if (!response.ok) {
        throw new Error(`Failed to fetch sources: ${response.status}`);
      }

      const sources = await response.json() as Source[];

      return sources.find((source) => source.key === sourceKey) || null;
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    enabled: options?.enabled && !!sourceKey,
  });
}
