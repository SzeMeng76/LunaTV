/* eslint-disable no-console */

import { useQuery, useQueryClient, queryOptions } from '@tanstack/react-query';
import type { PlayStatsResult } from '@/lib/types';
import {
  getCachedWatchingUpdates,
  getDetailedWatchingUpdates,
  checkWatchingUpdates,
  forceClearWatchingUpdatesCache,
  type WatchingUpdate,
} from '@/lib/watching-updates';
import type { ReleaseCalendarItem } from '@/lib/types';

/**
 * Query options for admin play stats
 */
const adminStatsOptions = () => queryOptions<PlayStatsResult>({
  queryKey: ['playStats', 'admin'],
  queryFn: async () => {
    console.log('开始获取管理员统计数据...');
    const response = await fetch('/api/admin/play-stats');

    if (response.status === 401) {
      throw new Error('UNAUTHORIZED');
    }

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    console.log('管理员统计数据获取成功');
    return data;
  },
  staleTime: 5 * 60 * 1000, // 5 minutes
  gcTime: 10 * 60 * 1000,
  retry: 1,
});

/**
 * Fetch admin play stats
 * Based on TanStack Query useQuery with enabled option
 */
export function useAdminStatsQuery(enabled: boolean) {
  return useQuery({
    ...adminStatsOptions(),
    enabled,
  });
}

/**
 * Query options for user personal stats
 */
const userStatsOptions = () => queryOptions({
  queryKey: ['playStats', 'user'],
  queryFn: async () => {
    console.log('开始获取用户个人统计数据...');
    const response = await fetch('/api/user/my-stats');

    if (response.status === 401) {
      throw new Error('UNAUTHORIZED');
    }

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    console.log('用户个人统计数据获取成功');
    return data;
  },
  staleTime: 5 * 60 * 1000, // 5 minutes
  gcTime: 10 * 60 * 1000,
  retry: 1,
});

/**
 * Fetch user personal stats
 * Based on TanStack Query useQuery with enabled option
 */
export function useUserStatsQuery(enabled: boolean) {
  return useQuery({
    ...userStatsOptions(),
    enabled,
  });
}

/**
 * Query options for watching updates
 */
const playStatsWatchingUpdatesOptions = () => queryOptions<WatchingUpdate | null>({
  queryKey: ['watchingUpdates', 'playStats'],
  queryFn: async () => {
    const cached = getCachedWatchingUpdates();
    if (cached) {
      return getDetailedWatchingUpdates();
    }
    await checkWatchingUpdates();
    return getDetailedWatchingUpdates();
  },
  staleTime: 5 * 60 * 1000, // 5 minutes
  gcTime: 30 * 60 * 1000,
});

/**
 * Fetch watching updates for play-stats page
 * Based on TanStack Query useQuery with enabled option
 */
export function usePlayStatsWatchingUpdatesQuery(enabled: boolean) {
  return useQuery({
    ...playStatsWatchingUpdatesOptions(),
    enabled,
  });
}

/**
 * Query options for upcoming releases
 */
const upcomingReleasesOptions = () => queryOptions<ReleaseCalendarItem[]>({
  queryKey: ['upcomingReleases'],
  queryFn: async () => {
    const today = new Date();
    const twoWeeks = new Date(today);
    twoWeeks.setDate(today.getDate() + 14);

    const response = await fetch(
      `/api/release-calendar?dateFrom=${today.toISOString().split('T')[0]}&dateTo=${twoWeeks.toISOString().split('T')[0]}`
    );

    if (response.ok) {
      const data = await response.json();
      const items = data.items || [];
      console.log(`📊 获取到 ${items.length} 条即将上映数据`);
      return items;
    }

    console.error('获取即将上映内容失败:', response.status);
    return [];
  },
  staleTime: 10 * 60 * 1000, // 10 minutes
  gcTime: 30 * 60 * 1000,
});

/**
 * Fetch upcoming releases for play-stats page
 * Based on TanStack Query useQuery with enabled option
 */
export function useUpcomingReleasesQuery(enabled: boolean) {
  return useQuery({
    ...upcomingReleasesOptions(),
    enabled,
  });
}

/**
 * Invalidate all play-stats queries for refresh
 */
export function useInvalidatePlayStats() {
  const queryClient = useQueryClient();

  return async () => {
    // Clear watching updates cache
    localStorage.removeItem('moontv_watching_updates');
    localStorage.removeItem('moontv_last_update_check');
    localStorage.removeItem('upcoming_releases_cache');
    localStorage.removeItem('upcoming_releases_cache_time');

    // Force refresh watching updates
    await checkWatchingUpdates(true);

    // Invalidate all play-stats related queries
    await queryClient.invalidateQueries({ queryKey: ['playStats'] });
    await queryClient.invalidateQueries({ queryKey: ['watchingUpdates', 'playStats'] });
    await queryClient.invalidateQueries({ queryKey: ['upcomingReleases'] });
  };
}
