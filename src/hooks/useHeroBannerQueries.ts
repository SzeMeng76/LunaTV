/* eslint-disable no-console */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * Query for refreshed trailer URLs cache
 * Uses React Query cache instead of localStorage
 * URLs are fetched from server (Redis cache) on demand
 */
export function useRefreshedTrailerUrlsQuery() {
  return useQuery<Record<string, string>>({
    queryKey: ['refreshedTrailerUrls'],
    queryFn: () => {
      // Start with empty cache - URLs will be populated by mutations
      return {};
    },
    initialData: {},
    staleTime: Infinity, // Never refetch automatically - only updated via mutations
    gcTime: Infinity,
  });
}

/**
 * Mutation for refreshing a trailer URL
 * Replaces manual refreshTrailerUrl useCallback + localStorage management
 * Based on TanStack Query useMutation with optimistic updates pattern
 * Reference: query-main/examples/react/optimistic-updates-cache
 */
export function useRefreshTrailerUrlMutation() {
  const queryClient = useQueryClient();

  return useMutation<
    string | null,
    Error,
    { doubanId: number | string; force?: boolean }
  >({
    mutationFn: async ({ doubanId, force = false }) => {
      console.log('[HeroBanner] 检测到trailer URL过期，重新获取:', doubanId, force ? '(强制刷新)' : '');

      const url = `/api/douban/refresh-trailer?id=${doubanId}${force ? '&force=true' : ''}`;
      const response = await fetch(url);
      const data = await response.json();

      // 如果是404且明确标记为NO_TRAILER，记录并返回特殊标记（带时间戳，24小时后重试）
      if (response.status === 404 && data.error === 'NO_TRAILER') {
        console.warn('[HeroBanner] 该影片没有预告片，记录状态避免重复请求');
        return `NO_TRAILER_${Date.now()}`;
      }

      // 如果是500或其他服务端错误，记录失败状态和时间戳，避免短时间内重复请求
      if (response.status >= 500) {
        console.error('[HeroBanner] 服务端错误，记录失败状态:', response.status);
        return `FAILED_${Date.now()}`;
      }

      if (!response.ok) {
        console.error('[HeroBanner] 刷新trailer URL失败:', response.status);
        return null;
      }

      if (data.code === 200 && data.data?.trailerUrl) {
        console.log('[HeroBanner] 成功获取新的trailer URL');
        return data.data.trailerUrl;
      }

      console.warn('[HeroBanner] 未能获取新的trailer URL:', data.message);
      return null;
    },
    onSuccess: (newUrl, { doubanId }) => {
      if (newUrl) {
        // Update React Query cache with new URL
        queryClient.setQueryData<Record<string, string>>(
          ['refreshedTrailerUrls'],
          (prev = {}) => ({ ...prev, [doubanId]: newUrl })
        );
      }
    },
  });
}

/**
 * Clear a specific trailer URL from cache
 * Used when a previously refreshed URL also expires (403)
 */
export function useClearTrailerUrlMutation() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    { doubanId: number | string }
  >({
    mutationFn: async ({ doubanId }) => {
      console.log('[HeroBanner] 清除过期的 trailer URL');

      // Update React Query cache - remove the expired URL
      queryClient.setQueryData<Record<string, string>>(
        ['refreshedTrailerUrls'],
        (prev = {}) => {
          const updated = { ...prev };
          delete updated[doubanId as string];
          return updated;
        }
      );
    },
  });
}
