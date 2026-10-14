'use client';

/**
 * Trusted Network 配置的 TanStack Query Hooks
 *
 * 基于 TanStack Query 源码最佳实践实现：
 * 1. 使用 useQuery 替代 useState + useEffect
 * 2. 使用 useMutation 处理配置保存
 * 3. 实现乐观更新提升用户体验
 * 4. 自动缓存、重试、错误处理
 *
 * 参考：
 * - query-main/examples/react/optimistic-updates-cache
 * - TanStack Query useMutation 源码
 */

import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

// ============================================================================
// 类型定义
// ============================================================================

export interface TrustedNetworkConfig {
  enabled: boolean;
  trustedIPs: string[];
  blockAdminAccess?: boolean;
}

export interface TrustedNetworkResponse {
  success: boolean;
  data: {
    config: TrustedNetworkConfig;
    envConfig: {
      hasEnvConfig: boolean;
      trustedIPs: string[];
    };
  };
}

// ============================================================================
// Query Options
// ============================================================================

/**
 * Trusted Network 配置查询选项
 */
const trustedNetworkOptions = queryOptions({
  queryKey: ['trustedNetwork'],
  queryFn: async (): Promise<TrustedNetworkResponse> => {
    const response = await fetch('/api/admin/trusted-network');

    if (!response.ok) {
      throw new Error(
        `Failed to fetch trusted network config: ${response.status}`,
      );
    }

    return response.json();
  },
  staleTime: 5 * 60 * 1000, // 5分钟 - 配置很少变化
  gcTime: 10 * 60 * 1000, // 10分钟
  retry: 2, // 失败重试 2 次
});

// ============================================================================
// Hook: Trusted Network 配置查询
// ============================================================================

/**
 * 查询 Trusted Network 配置
 */
export function useTrustedNetworkQuery(): UseQueryResult<
  TrustedNetworkResponse,
  Error
> {
  return useQuery(trustedNetworkOptions);
}

// ============================================================================
// Hook: 保存 Trusted Network 配置
// ============================================================================

/**
 * 保存 Trusted Network 配置 Mutation
 *
 * 特性：
 * - 乐观更新：立即更新 UI，无需等待服务器响应
 * - 自动回滚：保存失败时自动恢复之前的状态
 * - 自动刷新：保存成功后刷新相关查询
 */
export function useSaveTrustedNetworkMutation(): UseMutationResult<
  { success: boolean },
  Error,
  TrustedNetworkConfig,
  { previousConfig?: TrustedNetworkResponse }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (newConfig: TrustedNetworkConfig) => {
      const response = await fetch('/api/admin/trusted-network', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '保存失败');
      }

      return response.json();
    },

    // 乐观更新：在请求发送前立即更新 UI
    onMutate: async (newConfig) => {
      // 取消所有正在进行的查询（避免覆盖乐观更新）
      await queryClient.cancelQueries({ queryKey: ['trustedNetwork'] });

      // 保存之前的配置（用于回滚）
      const previousConfig = queryClient.getQueryData<TrustedNetworkResponse>([
        'trustedNetwork',
      ]);

      // 乐观更新：立即更新缓存
      if (previousConfig) {
        queryClient.setQueryData<TrustedNetworkResponse>(['trustedNetwork'], {
          ...previousConfig,
          data: {
            ...previousConfig.data,
            config: newConfig,
          },
        });
      }

      // 返回上下文（用于回滚）
      return { previousConfig };
    },

    // 保存失败：回滚到之前的状态
    onError: (error, variables, context) => {
      if (context?.previousConfig) {
        queryClient.setQueryData<TrustedNetworkResponse>(
          ['trustedNetwork'],
          context.previousConfig,
        );
      }
    },

    // 保存完成（成功或失败）：刷新相关查询
    onSettled: () => {
      // 刷新 Trusted Network 配置
      queryClient.invalidateQueries({ queryKey: ['trustedNetwork'] });
      // 刷新管理员配置（父组件可能需要）
      queryClient.invalidateQueries({ queryKey: ['adminConfig'] });
    },
  });
}
