'use client';

/**
 * 提醒查询的 TanStack Query Hook
 *
 * 功能：
 * - 统一管理提醒数据的获取
 * - 自动缓存、去重、后台同步
 * - 替代 db.client.ts 的 getAllReminders() 直接 fetch
 */

import { useQuery, queryOptions } from '@tanstack/react-query';
import type { Reminder } from '@/lib/db.client';

// ============================================================================
// Query Options
// ============================================================================

/**
 * 提醒查询配置
 */
export const remindersQueryOptions = queryOptions({
  queryKey: ['reminders'] as const,
  queryFn: async (): Promise<Record<string, Reminder>> => {
    const response = await fetch('/api/reminders');

    if (!response.ok) {
      throw new Error(`Failed to fetch reminders: ${response.status}`);
    }

    const data = await response.json();
    return data as Record<string, Reminder>;
  },
  staleTime: 5 * 60 * 1000, // 5分钟
  gcTime: 10 * 60 * 1000,   // 10分钟
  retry: 1,
});

// ============================================================================
// Hook: 获取所有提醒
// ============================================================================

/**
 * 获取所有提醒
 *
 * @example
 * ```tsx
 * function MyReminders() {
 *   const { data, isLoading } = useRemindersQuery();
 *
 *   if (isLoading) return <div>加载中...</div>;
 *
 *   return <div>{Object.keys(data).length} 个提醒</div>;
 * }
 * ```
 */
export function useRemindersQuery(options?: { enabled?: boolean }) {
  return useQuery({
    ...remindersQueryOptions,
    enabled: options?.enabled,
  });
}

// ============================================================================
// Hook: 获取提醒数组（已排序）
// ============================================================================

/**
 * 获取提醒数组（按上映日期排序）
 *
 * @example
 * ```tsx
 * function RemindersList() {
 *   const { data: reminders } = useRemindersArrayQuery();
 *
 *   return (
 *     <div>
 *       {reminders?.map(reminder => (
 *         <div key={reminder.key}>{reminder.title}</div>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function useRemindersArrayQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['reminders', 'array'] as const,
    queryFn: async () => {
      const response = await fetch('/api/reminders');

      if (!response.ok) {
        throw new Error(`Failed to fetch reminders: ${response.status}`);
      }

      const data = await response.json() as Record<string, Reminder>;

      // 转换为数组并排序
      const remindersArray = Object.entries(data).map(([key, reminder]) => ({
        ...reminder,
        key,
      }));

      // 按上映日期排序（最近的在前）
      return remindersArray.sort((a, b) => {
        const dateA = new Date(a.releaseDate).getTime();
        const dateB = new Date(b.releaseDate).getTime();
        return dateA - dateB;
      });
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
    enabled: options?.enabled,
  });
}

// ============================================================================
// Hook: 检查是否已设置提醒
// ============================================================================

/**
 * 检查是否已设置提醒
 *
 * @example
 * ```tsx
 * function ReminderButton({ source, id }: { source: string; id: string }) {
 *   const { data: isReminded } = useIsRemindedQuery(source, id);
 *
 *   return (
 *     <button>
 *       {isReminded ? '已提醒' : '设置提醒'}
 *     </button>
 *   );
 * }
 * ```
 */
export function useIsRemindedQuery(
  source: string,
  id: string,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ['reminders', 'check', source, id] as const,
    queryFn: async () => {
      const response = await fetch('/api/reminders');

      if (!response.ok) {
        throw new Error(`Failed to fetch reminders: ${response.status}`);
      }

      const data = await response.json() as Record<string, Reminder>;
      const key = `${source}+${id}`;

      return !!data[key];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
    enabled: options?.enabled,
  });
}
