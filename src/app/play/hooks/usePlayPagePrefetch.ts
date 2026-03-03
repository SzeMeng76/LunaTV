import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import type { SearchResult } from '@/lib/types';

interface UsePrefetchNextEpisodeOptions {
  detail: SearchResult | null;
  currentEpisodeIndex: number;
  currentTime: number;
  duration: number;
  source: string;
  id: string;
}

/**
 * Prefetch next episode when user reaches 80% progress
 * Based on TanStack Query prefetchQuery pattern from source code
 */
export function usePrefetchNextEpisode({
  detail,
  currentEpisodeIndex,
  currentTime,
  duration,
  source,
  id,
}: UsePrefetchNextEpisodeOptions) {
  const queryClient = useQueryClient();
  const hasPrefetchedRef = useRef(false);

  useEffect(() => {
    // Reset prefetch flag when episode changes
    hasPrefetchedRef.current = false;
  }, [currentEpisodeIndex]);

  useEffect(() => {
    if (!detail || !detail.episodes || hasPrefetchedRef.current) {
      return;
    }

    const progress = duration > 0 ? currentTime / duration : 0;
    const hasNextEpisode = currentEpisodeIndex < detail.episodes.length - 1;

    // Prefetch when user reaches 80% progress
    if (progress >= 0.8 && hasNextEpisode) {
      hasPrefetchedRef.current = true;

      const nextEpisodeIndex = currentEpisodeIndex + 1;
      const nextEpisode = detail.episodes[nextEpisodeIndex];

      console.log(`🚀 预取下一集: 第${nextEpisodeIndex + 1}集`);

      // Prefetch video detail for next episode
      // This will cache the data so when user clicks next, it loads instantly
      queryClient.prefetchQuery({
        queryKey: ['videoDetail', source, id, nextEpisodeIndex],
        queryFn: async () => {
          // The actual video detail is already loaded, we just cache the episode info
          return {
            ...detail,
            currentEpisode: nextEpisode,
            currentEpisodeIndex: nextEpisodeIndex,
          };
        },
        staleTime: 5 * 60 * 1000, // 5 minutes
      });
    }
  }, [currentTime, duration, currentEpisodeIndex, detail, source, id, queryClient]);
}

interface UsePrefetchDoubanDataOptions {
  videoDoubanId: string | null;
  enabled: boolean;
}

/**
 * Prefetch Douban data when video loads
 * Based on TanStack Query prefetchQuery pattern from source code
 */
export function usePrefetchDoubanData({
  videoDoubanId,
  enabled,
}: UsePrefetchDoubanDataOptions) {
  const queryClient = useQueryClient();
  const hasPrefetchedRef = useRef(false);

  useEffect(() => {
    if (!enabled || !videoDoubanId || hasPrefetchedRef.current) {
      return;
    }

    hasPrefetchedRef.current = true;

    console.log(`🚀 预取豆瓣数据: ${videoDoubanId}`);

    // Prefetch Douban details
    queryClient.prefetchQuery({
      queryKey: ['doubanDetails', videoDoubanId],
      queryFn: async () => {
        const { getDoubanDetails } = await import('@/lib/douban.client');
        return getDoubanDetails(videoDoubanId);
      },
      staleTime: 30 * 60 * 1000, // 30 minutes - external API data
    });

    // Prefetch Douban comments
    queryClient.prefetchQuery({
      queryKey: ['doubanComments', videoDoubanId],
      queryFn: async () => {
        const { getDoubanComments } = await import('@/lib/douban.client');
        return getDoubanComments({ id: videoDoubanId });
      },
      staleTime: 30 * 60 * 1000, // 30 minutes - external API data
    });
  }, [videoDoubanId, enabled, queryClient]);

  // Reset prefetch flag when videoDoubanId changes
  useEffect(() => {
    hasPrefetchedRef.current = false;
  }, [videoDoubanId]);
}
