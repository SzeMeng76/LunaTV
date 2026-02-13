'use client';

/**
 * Play Page 数据操作的 TanStack Query Mutations
 *
 * 基于 TanStack Query 源码最佳实践实现：
 * 1. 使用 useMutation 管理播放记录和收藏操作
 * 2. 实现乐观更新提升用户体验
 * 3. 完善的错误处理和回滚机制
 * 4. 自动缓存失效和数据同步
 *
 * 参考：
 * - TanStack Query useMutation 源码
 * - Optimistic Updates 模式
 * - Cache invalidation 策略
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';
import {
  savePlayRecord,
  saveFavorite,
  deleteFavorite,
  type PlayRecord,
  type Favorite,
} from '@/lib/db.client';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 保存播放记录的参数
 */
export interface SavePlayRecordParams {
  source: string;
  id: string;
  record: PlayRecord;
}

/**
 * 保存收藏的参数
 */
export interface SaveFavoriteParams {
  source: string;
  id: string;
  favorite: Favorite;
}

/**
 * 删除收藏的参数
 */
export interface DeleteFavoriteParams {
  source: string;
  id: string;
}

/**
 * Mutation 上下文（用于乐观更新回滚）
 */
interface MutationContext {
  previousPlayRecords?: Record<string, PlayRecord>;
  previousFavorites?: Record<string, Favorite>;
}

// ============================================================================
// Hook: 保存播放记录
// ============================================================================

/**
 * 保存播放记录的 Mutation Hook
 *
 * 特性：
 * - 乐观更新：立即更新 UI
 * - 错误回滚：失败时自动恢复
 * - 自动缓存失效：成功后刷新相关查询
 *
 * @example
 * ```tsx
 * const savePlayRecordMutation = useSavePlayRecordMutation();
 *
 * savePlayRecordMutation.mutate({
 *   source: 'douban',
 *   id: '123',
 *   record: { title: '电影名', index: 1, ... }
 * });
 * ```
 */
export function useSavePlayRecordMutation(): UseMutationResult<
  void,
  Error,
  SavePlayRecordParams,
  MutationContext
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ source, id, record }: SavePlayRecordParams) => {
      await savePlayRecord(source, id, record);
    },

    onMutate: async ({ source, id, record }) => {
      // 1. 取消正在进行的查询，避免覆盖乐观更新
      await queryClient.cancelQueries({ queryKey: ['playRecords'] });

      // 2. 保存当前数据快照
      const previousPlayRecords = queryClient.getQueryData<Record<string, PlayRecord>>(['playRecords']);

      // 3. 乐观更新缓存
      queryClient.setQueryData<Record<string, PlayRecord>>(['playRecords'], (old = {}) => {
        const key = `${source}+${id}`;
        return {
          ...old,
          [key]: record,
        };
      });

      return { previousPlayRecords };
    },

    onError: (error, variables, context) => {
      console.error('保存播放记录失败:', error);

      // 回滚到之前的状态
      if (context?.previousPlayRecords) {
        queryClient.setQueryData(['playRecords'], context.previousPlayRecords);
      }
    },

    onSettled: () => {
      // 刷新播放记录查询
      queryClient.invalidateQueries({ queryKey: ['playRecords'] });
    },
  });
}

// ============================================================================
// Hook: 保存收藏
// ============================================================================

/**
 * 保存收藏的 Mutation Hook
 *
 * @example
 * ```tsx
 * const saveFavoriteMutation = useSaveFavoriteMutation();
 *
 * saveFavoriteMutation.mutate({
 *   source: 'douban',
 *   id: '123',
 *   favorite: { title: '电影名', ... }
 * });
 * ```
 */
export function useSaveFavoriteMutation(): UseMutationResult<
  void,
  Error,
  SaveFavoriteParams,
  MutationContext
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ source, id, favorite }: SaveFavoriteParams) => {
      await saveFavorite(source, id, favorite);
    },

    onMutate: async ({ source, id, favorite }) => {
      await queryClient.cancelQueries({ queryKey: ['favorites'] });

      const previousFavorites = queryClient.getQueryData<Record<string, Favorite>>(['favorites']);

      queryClient.setQueryData<Record<string, Favorite>>(['favorites'], (old = {}) => {
        const key = `${source}+${id}`;
        return {
          ...old,
          [key]: favorite,
        };
      });

      return { previousFavorites };
    },

    onError: (error, variables, context) => {
      console.error('保存收藏失败:', error);

      if (context?.previousFavorites) {
        queryClient.setQueryData(['favorites'], context.previousFavorites);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
    },
  });
}

// ============================================================================
// Hook: 删除收藏
// ============================================================================

/**
 * 删除收藏的 Mutation Hook
 *
 * @example
 * ```tsx
 * const deleteFavoriteMutation = useDeleteFavoriteMutation();
 *
 * deleteFavoriteMutation.mutate({
 *   source: 'douban',
 *   id: '123'
 * });
 * ```
 */
export function useDeleteFavoriteMutation(): UseMutationResult<
  void,
  Error,
  DeleteFavoriteParams,
  MutationContext
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ source, id }: DeleteFavoriteParams) => {
      await deleteFavorite(source, id);
    },

    onMutate: async ({ source, id }) => {
      await queryClient.cancelQueries({ queryKey: ['favorites'] });

      const previousFavorites = queryClient.getQueryData<Record<string, Favorite>>(['favorites']);

      queryClient.setQueryData<Record<string, Favorite>>(['favorites'], (old = {}) => {
        const key = `${source}+${id}`;
        const newFavorites = { ...old };
        delete newFavorites[key];
        return newFavorites;
      });

      return { previousFavorites };
    },

    onError: (error, variables, context) => {
      console.error('删除收藏失败:', error);

      if (context?.previousFavorites) {
        queryClient.setQueryData(['favorites'], context.previousFavorites);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
    },
  });
}
