'use client';

/**
 * 播放记录管理的 TanStack Query Mutations
 *
 * 基于 TanStack Query 源码最佳实践实现：
 * 1. 使用 useMutation 管理所有数据修改操作
 * 2. 实现乐观更新（Optimistic Updates）提升用户体验
 * 3. 完善的错误处理和回滚机制
 * 4. 自动缓存失效和数据同步
 *
 * 参考：
 * - TanStack Query useMutation 源码
 * - Mutation 生命周期：onMutate -> mutationFn -> onSuccess/onError -> onSettled
 * - 乐观更新模式：立即更新 UI，失败时回滚
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';
import {
  savePlayRecord,
  deletePlayRecord,
  clearAllPlayRecords,
  type PlayRecord,
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
 * 删除播放记录的参数
 */
export interface DeletePlayRecordParams {
  source: string;
  id: string;
}

/**
 * Mutation 上下文（用于乐观更新回滚）
 */
interface MutationContext {
  previousPlayRecords?: Record<string, PlayRecord>;
}

// ============================================================================
// Hook: 保存播放记录
// ============================================================================

/**
 * 保存播放记录的 Mutation Hook
 *
 * 特性：
 * - 乐观更新：立即更新 UI，无需等待服务器响应
 * - 错误回滚：失败时自动恢复到之前的状态
 * - 自动缓存失效：成功后刷新相关查询
 *
 * @example
 * ```tsx
 * const saveRecord = useSavePlayRecordMutation();
 *
 * // 使用 mutate（不返回 Promise）
 * saveRecord.mutate({
 *   source: 'douban',
 *   id: '123',
 *   record: { title: '电影名', index: 1, play_time: 100, ... }
 * });
 *
 * // 使用 mutateAsync（返回 Promise）
 * try {
 *   await saveRecord.mutateAsync({ ... });
 *   console.log('保存成功');
 * } catch (error) {
 *   console.error('保存失败', error);
 * }
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
    // ========== mutationFn: 实际的 API 调用 ==========
    mutationFn: async ({ source, id, record }: SavePlayRecordParams) => {
      await savePlayRecord(source, id, record);
    },

    // ========== onMutate: 乐观更新（在 mutationFn 执行前） ==========
    onMutate: async ({ source, id, record }: SavePlayRecordParams) => {
      // 1. 取消任何进行中的查询，防止覆盖乐观更新
      await queryClient.cancelQueries({ queryKey: ['playRecords'] });

      // 2. 保存旧数据用于回滚
      const previousPlayRecords = queryClient.getQueryData<Record<string, PlayRecord>>(['playRecords']);

      // 3. 立即更新缓存（乐观更新）
      queryClient.setQueryData<Record<string, PlayRecord>>(['playRecords'], (old = {}) => {
        const key = `${source}+${id}`;
        return {
          ...old,
          [key]: record,
        };
      });

      // 4. 返回上下文，用于 onError 回滚
      return { previousPlayRecords };
    },

    // ========== onError: 失败时回滚 ==========
    onError: (error, variables, context) => {
      console.error('保存播放记录失败:', error);

      // 回滚到之前的状态
      if (context?.previousPlayRecords) {
        queryClient.setQueryData(['playRecords'], context.previousPlayRecords);
      }
    },

    // ========== onSettled: 无论成功还是失败都执行 ==========
    onSettled: () => {
      // 重新获取最新数据，确保数据一致性
      queryClient.invalidateQueries({ queryKey: ['playRecords'] });
    },
  });
}

// ============================================================================
// Hook: 删除播放记录
// ============================================================================

/**
 * 删除播放记录的 Mutation Hook
 *
 * 特性：
 * - 乐观更新：立即从 UI 移除，无需等待服务器响应
 * - 错误回滚：失败时自动恢复
 * - 自动缓存失效：成功后刷新相关查询
 *
 * @example
 * ```tsx
 * const deleteRecord = useDeletePlayRecordMutation();
 *
 * deleteRecord.mutate({
 *   source: 'douban',
 *   id: '123'
 * });
 * ```
 */
export function useDeletePlayRecordMutation(): UseMutationResult<
  void,
  Error,
  DeletePlayRecordParams,
  MutationContext
> {
  const queryClient = useQueryClient();

  return useMutation({
    // ========== mutationFn: 实际的 API 调用 ==========
    mutationFn: async ({ source, id }: DeletePlayRecordParams) => {
      await deletePlayRecord(source, id);
    },

    // ========== onMutate: 乐观更新 ==========
    onMutate: async ({ source, id }: DeletePlayRecordParams) => {
      // 1. 取消进行中的查询
      await queryClient.cancelQueries({ queryKey: ['playRecords'] });

      // 2. 保存旧数据
      const previousPlayRecords = queryClient.getQueryData<Record<string, PlayRecord>>(['playRecords']);

      // 3. 立即从缓存中删除
      queryClient.setQueryData<Record<string, PlayRecord>>(['playRecords'], (old = {}) => {
        const key = `${source}+${id}`;
        const newRecords = { ...old };
        delete newRecords[key];
        return newRecords;
      });

      return { previousPlayRecords };
    },

    // ========== onError: 失败时回滚 ==========
    onError: (error, variables, context) => {
      console.error('删除播放记录失败:', error);

      if (context?.previousPlayRecords) {
        queryClient.setQueryData(['playRecords'], context.previousPlayRecords);
      }
    },

    // ========== onSettled: 刷新数据 ==========
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['playRecords'] });
    },
  });
}

// ============================================================================
// Hook: 清空所有播放记录
// ============================================================================

/**
 * 清空所有播放记录的 Mutation Hook
 *
 * 特性：
 * - 乐观更新：立即清空 UI
 * - 错误回滚：失败时恢复所有数据
 * - 自动缓存失效：成功后刷新
 *
 * @example
 * ```tsx
 * const clearRecords = useClearPlayRecordsMutation();
 *
 * clearRecords.mutate();
 * ```
 */
export function useClearPlayRecordsMutation(): UseMutationResult<
  void,
  Error,
  void,
  MutationContext
> {
  const queryClient = useQueryClient();

  return useMutation({
    // ========== mutationFn: 实际的 API 调用 ==========
    mutationFn: async () => {
      await clearAllPlayRecords();
    },

    // ========== onMutate: 乐观更新 ==========
    onMutate: async () => {
      // 1. 取消进行中的查询
      await queryClient.cancelQueries({ queryKey: ['playRecords'] });

      // 2. 保存旧数据
      const previousPlayRecords = queryClient.getQueryData<Record<string, PlayRecord>>(['playRecords']);

      // 3. 立即清空缓存
      queryClient.setQueryData(['playRecords'], {});

      return { previousPlayRecords };
    },

    // ========== onError: 失败时回滚 ==========
    onError: (error, variables, context) => {
      console.error('清空播放记录失败:', error);

      if (context?.previousPlayRecords) {
        queryClient.setQueryData(['playRecords'], context.previousPlayRecords);
      }
    },

    // ========== onSettled: 刷新数据 ==========
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['playRecords'] });
    },
  });
}
