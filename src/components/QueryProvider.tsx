'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { getQueryClient } from '@/lib/get-query-client';
import type * as React from 'react';

/**
 * QueryProvider - TanStack Query 全局状态管理提供者
 *
 * 功能：
 * - 为整个应用提供 QueryClient 实例
 * - 启用 React Query DevTools（仅开发环境）
 * - 管理全局数据缓存和请求状态
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
      {children}
      {/* React Query DevTools - 仅在开发环境显示 */}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
