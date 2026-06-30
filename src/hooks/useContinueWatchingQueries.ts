/* eslint-disable no-console */

import { useQuery, queryOptions } from '@tanstack/react-query';
import { usePlayRecordsArrayQuery } from './usePlayRecordsQuery';
import { useWatchingUpdatesQuery as useWatchingUpdates } from './useWatchingUpdates';

/**
 * Query options for continue watching records
 */
const continueWatchingOptions = () => queryOptions({
  queryKey: ['playRecords', 'continueWatching'],
  queryFn: async () => {
    const response = await fetch('/api/playrecords');
    if (!response.ok) {
      throw new Error(`Failed to fetch play records: ${response.status}`);
    }
    const allRecords = await response.json();
    const recordsArray = Object.entries(allRecords).map(([key, record]: [string, any]) => ({
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
 * Fetch watching updates (new episodes detection)
 * Uses the new TanStack Query implementation
 */
export function useWatchingUpdatesQuery(options?: { enabled?: boolean }) {
  return useWatchingUpdates(options);
}
