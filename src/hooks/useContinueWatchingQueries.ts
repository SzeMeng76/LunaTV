/* eslint-disable no-console */

import { useQuery, useQueryClient, queryOptions } from '@tanstack/react-query';
import { useEffect } from 'react';
import {
  getAllPlayRecords,
} from '@/lib/db.client';
import {
  getDetailedWatchingUpdates,
  subscribeToWatchingUpdatesEvent,
  checkWatchingUpdates,
  type WatchingUpdate,
} from '@/lib/watching-updates';

/**
 * Query options for continue watching records
 */
const continueWatchingOptions = () => queryOptions({
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

/**
 * Fetch all play records sorted by save_time
 * Based on TanStack Query useQuery with event-driven invalidation
 */
export function useContinueWatchingQuery() {
  return useQuery(continueWatchingOptions());
}

/**
 * Query options for watching updates
 */
const watchingUpdatesOptions = () => queryOptions<WatchingUpdate | null>({
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
  staleTime: 5 * 60 * 1000, // 5 minutes
  gcTime: 30 * 60 * 1000,
});

/**
 * Fetch watching updates (new episodes detection)
 * Based on TanStack Query useQuery with enabled option
 */
export function useWatchingUpdatesQuery(hasPlayRecords: boolean) {
  const queryClient = useQueryClient();

  const query = useQuery({
    ...watchingUpdatesOptions(),
    enabled: hasPlayRecords, // Only fetch when play records exist
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
