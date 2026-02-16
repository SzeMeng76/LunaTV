/* eslint-disable no-console */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * Query for refreshed trailer URLs cache
 * Replaces localStorage-based refreshedTrailerUrls state
 * Based on TanStack Query useQuery with initialData pattern (react-native example)
 */
export function useRefreshedTrailerUrlsQuery() {
  return useQuery<Record<string, string>>({
    queryKey: ['refreshedTrailerUrls'],
    queryFn: () => {
      // Read from localStorage as the source of truth
      if (typeof window !== 'undefined') {
        try {
          const stored = localStorage.getItem('refreshed-trailer-urls');
          return stored ? JSON.parse(stored) : {};
        } catch (error) {
          console.error('[HeroBanner] 读取localStorage失败:', error);
          return {};
        }
      }
      return {};
    },
    // Initialize immediately from localStorage (no loading state)
    initialData: () => {
      if (typeof window !== 'undefined') {
        try {
          const stored = localStorage.getItem('refreshed-trailer-urls');
          return stored ? JSON.parse(stored) : {};
        } catch {
          return {};
        }
      }
      return {};
    },
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
    { doubanId: number | string }
  >({
    mutationFn: async ({ doubanId }) => {
      console.log('[HeroBanner] 检测到trailer URL过期，重新获取:', doubanId);

      const response = await fetch(`/api/douban/refresh-trailer?id=${doubanId}`);

      if (!response.ok) {
        console.error('[HeroBanner] 刷新trailer URL失败:', response.status);
        return null;
      }

      const data = await response.json();
      if (data.code === 200 && data.data?.trailerUrl) {
        console.log('[HeroBanner] 成功获取新的trailer URL');
        return data.data.trailerUrl;
      }

      console.warn('[HeroBanner] 未能获取新的trailer URL:', data.message);
      return null;
    },
    onSuccess: (newUrl, { doubanId }) => {
      if (newUrl) {
        // Update query cache with new URL
        queryClient.setQueryData<Record<string, string>>(
          ['refreshedTrailerUrls'],
          (prev = {}) => {
            const updated = { ...prev, [doubanId]: newUrl };

            // Persist to localStorage
            try {
              localStorage.setItem('refreshed-trailer-urls', JSON.stringify(updated));
            } catch (error) {
              console.error('[HeroBanner] 保存到localStorage失败:', error);
            }

            return updated;
          }
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
      console.log('[HeroBanner] localStorage中的URL也过期了，清除并重新获取');

      // Update query cache - remove the expired URL
      queryClient.setQueryData<Record<string, string>>(
        ['refreshedTrailerUrls'],
        (prev = {}) => {
          const updated = { ...prev };
          delete updated[doubanId as string];

          // Persist to localStorage
          try {
            localStorage.setItem('refreshed-trailer-urls', JSON.stringify(updated));
          } catch (error) {
            console.error('[HeroBanner] 清除localStorage失败:', error);
          }

          return updated;
        }
      );
    },
  });
}
