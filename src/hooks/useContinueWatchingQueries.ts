/* eslint-disable no-console */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import {
  getAllPlayRecords,
  subscribeToDataUpdates,
  type PlayRecord,
} from '@/lib/db.client';
import {
  getDetailedWatchingUpdates,
  subscribeToWatchingUpdatesEvent,
  checkWatchingUpdates,
  type WatchingUpdate,
} from '@/lib/watching-updates';

/**
 * Fetch all play records sorted by save_time
 * Based on TanStack Query useQuery with event-driven invalidation
 *
 * 参考源码模式：
 * - useQuery with queryFn for data fetching
 * - External event subscriptions trigger invalidateQueries
 * - staleTime controls when data is considered fresh
 */
export function useContinueWatchingQuery() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['playRecords', 'continueWatching'],
    queryFn: async () => {
      const allRecords = await getAllPlayRecords();
      const recordsArray = Object.entries(allRecords).map(([key, record]) => ({
        ...record,
        key,
      }));
      // Sort by save_time descending (newest first)
      return recordsArray.sort((a, b) => b.save_time - a.save_time);
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000,
  });

  // Subscribe to external events and invalidate query cache
  useEffect(() => {
    const unsubscribe = subscribeToDataUpdates(
      'playRecordsUpdated',
      () => {
        console.log('ContinueWatching: 播放记录更新，invalidate query');
        queryClient.invalidateQueries({ queryKey: ['playRecords', 'continueWatching'] });
      }
    );

    return unsubscribe;
  }, [queryClient]);

  return query;
}

/**
 * Fetch watching updates (new episodes detection)
 * Based on TanStack Query useQuery with enabled option
 *
 * 参考源码模式：
 * - enabled option controls when query runs (only when play records exist)
 * - Event subscriptions trigger cache invalidation
 */
export function useWatchingUpdatesQuery(hasPlayRecords: boolean) {
  const queryClient = useQueryClient();

  const query = useQuery<WatchingUpdate | null>({
    queryKey: ['watchingUpdates'],
    queryFn: async () => {
      // First try from cache
      let updates = getDetailedWatchingUpdates();

      // If no cache, actively check
      if (!updates) {
        console.log('ContinueWatching: 缓存为空，主动检查更新...');
        await checkWatchingUpdates();
        updates = getDetailedWatchingUpdates();
      }

      return updates;
    },
    enabled: hasPlayRecords, // Only fetch when play records exist
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000,
  });

  // Subscribe to watching updates events
  useEffect(() => {
    if (!hasPlayRecords) return;

    const unsubscribe = subscribeToWatchingUpdatesEvent(() => {
      console.log('ContinueWatching: 收到watching updates事件，invalidate query');
      queryClient.invalidateQueries({ queryKey: ['watchingUpdates'] });
    });

    return unsubscribe;
  }, [hasPlayRecords, queryClient]);

  return query;
}
