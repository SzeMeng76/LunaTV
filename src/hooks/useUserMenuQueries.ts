/* eslint-disable no-console */

import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { getAllPlayRecords, forceRefreshPlayRecordsCache } from '@/lib/db.client';
import { checkForUpdates, type UpdateStatus } from '@/lib/version_check';
import type { Favorite, PlayRecord } from '@/lib/types';

// ─── Emby Config Types ──────────────────────────────────────────────────────

export interface EmbySource {
  key: string;
  name: string;
  enabled: boolean;
  ServerURL: string;
  ApiKey?: string;
  Username?: string;
  Password?: string;
  removeEmbyPrefix?: boolean;
  appendMediaSourceId?: boolean;
  transcodeMp4?: boolean;
  proxyPlay?: boolean;
}

export interface EmbyConfig {
  sources: EmbySource[];
}

// ─── Emby Config Query Options (reusable key, type-safe) ─────────────────────

export const embyConfigQueryOptions = queryOptions({
  queryKey: ['user', 'emby-config'] as const,
  queryFn: async (): Promise<EmbyConfig> => {
    const res = await fetch('/api/user/emby-config');
    const data = await res.json();
    if (data.success && data.config) {
      return data.config as EmbyConfig;
    }
    return { sources: [] };
  },
  staleTime: 5 * 60 * 1000,  // 5 minutes - config rarely changes
  gcTime: 30 * 60 * 1000,
});

/**
 * Fetch user Emby config
 * Only fetches when isSettingsOpen - use enabled option at call site
 */
export function useEmbyConfigQuery(enabled: boolean) {
  return useQuery({
    ...embyConfigQueryOptions,
    enabled,
  });
}

/**
 * Save Emby config mutation
 * Invalidates emby-config query on success so ModernNav etc. refresh
 */
export function useSaveEmbyConfigMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (config: EmbyConfig) => {
      const res = await fetch('/api/user/emby-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || '保存失败');
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: embyConfigQueryOptions.queryKey });
    },
  });
}

/**
 * Fetch watch room config
 * Based on TanStack Query useQuery pattern with staleTime
 */
export function useWatchRoomConfigQuery() {
  return useQuery({
    queryKey: ['watchRoomConfig'],
    queryFn: async () => {
      const response = await fetch('/api/watch-room/config');
      const config = await response.json();
      return config.enabled === true;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes - config rarely changes
    gcTime: 30 * 60 * 1000,
  });
}

/**
 * Fetch server config (download enabled, etc.)
 * Based on TanStack Query useQuery pattern with staleTime
 */
export function useServerConfigQuery() {
  return useQuery({
    queryKey: ['serverConfig'],
    queryFn: async () => {
      const response = await fetch('/api/server-config');
      if (response.ok) {
        const config = await response.json();
        return { downloadEnabled: config.DownloadEnabled ?? true };
      }
      return { downloadEnabled: true };
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000,
  });
}

/**
 * Check for version updates
 * Based on TanStack Query useQuery pattern
 */
export function useVersionCheckQuery() {
  return useQuery<UpdateStatus>({
    queryKey: ['versionCheck'],
    queryFn: () => checkForUpdates(),
    staleTime: 30 * 60 * 1000, // 30 minutes - no need to check frequently
    gcTime: 60 * 60 * 1000,
    retry: 1,
  });
}

interface UsePlayRecordsQueryOptions {
  enabled: boolean;
  enableFilter: boolean;
  minProgress: number;
  maxProgress: number;
}

/**
 * Fetch play records with filtering
 * Based on TanStack Query useQuery with enabled option
 */
export function usePlayRecordsQuery({
  enabled,
  enableFilter,
  minProgress,
  maxProgress,
}: UsePlayRecordsQueryOptions) {
  return useQuery({
    queryKey: ['playRecords', 'userMenu', enableFilter, minProgress, maxProgress],
    queryFn: async () => {
      const records = await getAllPlayRecords();
      const recordsArray = Object.entries(records).map(([key, record]) => ({
        ...record,
        key,
      }));

      // Filter records that need continue watching
      const validPlayRecords = recordsArray.filter(record => {
        const progress = record.total_time === 0
          ? 0
          : (record.play_time / record.total_time) * 100;

        // Play time must exceed 2 minutes
        if (record.play_time < 120) return false;

        // If filter is disabled, show all records with > 2 min playtime
        if (!enableFilter) return true;

        // Filter by user's custom progress range
        return progress >= minProgress && progress <= maxProgress;
      });

      // Sort by last play time descending
      const sortedRecords = validPlayRecords.sort((a, b) => b.save_time - a.save_time);
      return sortedRecords.slice(0, 12); // Only take the latest 12
    },
    enabled,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000,
  });
}

interface UseFavoritesQueryOptions {
  enabled: boolean;
}

/**
 * Fetch favorites list
 * Based on TanStack Query useQuery with enabled option
 */
export function useFavoritesQuery({ enabled }: UseFavoritesQueryOptions) {
  return useQuery({
    queryKey: ['favorites', 'userMenu'],
    queryFn: async () => {
      const response = await fetch('/api/favorites');
      if (response.ok) {
        const favoritesData = await response.json() as Record<string, Favorite>;
        const favoritesArray = Object.entries(favoritesData).map(([key, favorite]) => ({
          ...(favorite as Favorite),
          key,
        }));
        // Sort by save time descending
        return favoritesArray.sort((a, b) => b.save_time - a.save_time);
      }
      return [];
    },
    enabled,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000,
  });
}

/**
 * Change password mutation
 * Based on TanStack Query useMutation pattern from source code
 */
export function useChangePasswordMutation() {
  return useMutation({
    mutationFn: async (newPassword: string) => {
      const response = await fetch('/api/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '修改密码失败');
      }

      return data;
    },
  });
}

/**
 * Invalidate play records and favorites queries
 * Useful when external events update data
 */
export function useInvalidateUserMenuData() {
  const queryClient = useQueryClient();

  return {
    invalidatePlayRecords: () => {
      forceRefreshPlayRecordsCache();
      queryClient.invalidateQueries({ queryKey: ['playRecords', 'userMenu'] });
    },
    invalidateFavorites: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites', 'userMenu'] });
    },
    invalidateAll: () => {
      forceRefreshPlayRecordsCache();
      queryClient.invalidateQueries({ queryKey: ['playRecords', 'userMenu'] });
      queryClient.invalidateQueries({ queryKey: ['favorites', 'userMenu'] });
    },
  };
}
