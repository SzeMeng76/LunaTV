'use client';

import { QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useEffect } from 'react';
import { getQueryClient } from '@/lib/get-query-client';
import { subscribeToDataUpdates } from '@/lib/db.client';
import type * as React from 'react';

/**
 * 全局事件订阅：统一监听数据更新事件并 invalidate 相关 query 缓存
 * 集中在此处避免多个组件重复监听导致多次 invalidate
 */
function GlobalCacheInvalidator() {
  const queryClient = useQueryClient();

  useEffect(() => {
    // 设置全局 queryClient 实例供 db.client.ts 使用
    if (typeof window !== 'undefined') {
      (window as any).__queryClient = queryClient;
    }

    const unsubscribePlayRecords = subscribeToDataUpdates(
      'playRecordsUpdated',
      () => {
        queryClient.invalidateQueries({ queryKey: ['playRecords'] });
      }
    );

    const unsubscribeFavorites = subscribeToDataUpdates(
      'favoritesUpdated',
      () => {
        queryClient.invalidateQueries({ queryKey: ['favorites'] });
      }
    );

    const unsubscribeReminders = subscribeToDataUpdates(
      'remindersUpdated',
      () => {
        queryClient.invalidateQueries({ queryKey: ['reminders'] });
      }
    );

    return () => {
      unsubscribePlayRecords();
      unsubscribeFavorites();
      unsubscribeReminders();
    };
  }, [queryClient]);

  return null;
}

/**
 * QueryProvider - TanStack Query 全局状态管理提供者
 *
 * 功能：
 * - 为整个应用提供 QueryClient 实例
 * - 启用 React Query DevTools（仅开发环境）
 * - 管理全局数据缓存和请求状态
 * - 全局监听数据更新事件，统一 invalidate 缓存
 *
 * 使用场景：
 * - 在 layout.tsx 中包裹 children
 * - 所有子组件都可以使用 useQuery/useMutation hooks
 */
export default function QueryProvider({ children }: { children: React.ReactNode }) {
  // 获取 QueryClient 实例（浏览器端单例，服务端每次新建）
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <GlobalCacheInvalidator />
      {children}
      {/* React Query DevTools - 仅在开发环境显示 */}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
