'use client';

/**
 * 收藏管理的 TanStack Query Mutations
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
  saveFavorite,
  deleteFavorite,
  clearAllFavorites,
  type Favorite,
} from '@/lib/db.client';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 添加收藏的参数
 */
export interface AddFavoriteParams {
  source: string;
  id: string;
  favorite: Favorite;
}

/**
 * 删除收藏的参数
 */
export interface RemoveFavoriteParams {
  source: string;
  id: string;
}

/**
 * Mutation 上下文（用于乐观更新回滚）
 */
interface MutationContext {
  previousFavorites?: Record<string, Favorite>;
}

// ============================================================================
// Hook: 添加收藏
// ============================================================================

/**
 * 添加收藏的 Mutation Hook
 *
 * 特性：
 * - 乐观更新：立即更新 UI，无需等待服务器响应
 * - 错误回滚：失败时自动恢复到之前的状态
 * - 自动缓存失效：成功后刷新相关查询
 *
 * @example
 * ```tsx
 * const addFavorite = useAddFavoriteMutation();
 *
 * // 使用 mutate（不返回 Promise）
 * addFavorite.mutate({
 *   source: 'douban',
 *   id: '123',
 *   favorite: { title: '电影名', ... }
 * });
 *
 * // 使用 mutateAsync（返回 Promise）
 * try {
 *   await addFavorite.mutateAsync({ ... });
 *   console.log('添加成功');
 * } catch (error) {
 *   console.error('添加失败', error);
 * }
 * ```
 */
export function useAddFavoriteMutation(): UseMutationResult<
  void,
  Error,
  AddFavoriteParams,
  MutationContext
> {
  const queryClient = useQueryClient();

  return useMutation({
    // ========== mutationFn: 实际的 API 调用 ==========
    mutationFn: async ({ source, id, favorite }: AddFavoriteParams) => {
      await saveFavorite(source, id, favorite);
    },

    // ========== onMutate: 乐观更新（在 mutationFn 执行前） ==========
    onMutate: async ({ source, id, favorite }: AddFavoriteParams) => {
      // 1. 取消任何进行中的查询，防止覆盖乐观更新
      await queryClient.cancelQueries({ queryKey: ['favorites'] });

      // 2. 保存旧数据用于回滚
      const previousFavorites = queryClient.getQueryData<Record<string, Favorite>>(['favorites']);

      // 3. 立即更新缓存（乐观更新）
      queryClient.setQueryData<Record<string, Favorite>>(['favorites'], (old = {}) => {
        const key = `${source}+${id}`;
        return {
          ...old,
          [key]: favorite,
        };
      });

      // 4. 返回上下文，用于 onError 回滚
      return { previousFavorites };
    },

    // ========== onError: 失败时回滚 ==========
    onError: (error, variables, context) => {
      console.error('添加收藏失败:', error);

      // 回滚到之前的状态
      if (context?.previousFavorites) {
        queryClient.setQueryData(['favorites'], context.previousFavorites);
      }
    },

    // ========== onSettled: 无论成功还是失败都执行 ==========
    onSettled: () => {
      // 重新获取最新数据，确保数据一致性
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
 * 特性：
 * - 乐观更新：立即从 UI 移除，无需等待服务器响应
 * - 错误回滚：失败时自动恢复
 * - 自动缓存失效：成功后刷新相关查询
 *
 * @example
 * ```tsx
 * const removeFavorite = useRemoveFavoriteMutation();
 *
 * removeFavorite.mutate({
 *   source: 'douban',
 *   id: '123'
 * });
 * ```
 */
export function useRemoveFavoriteMutation(): UseMutationResult<
  void,
  Error,
  RemoveFavoriteParams,
  MutationContext
> {
  const queryClient = useQueryClient();

  return useMutation({
    // ========== mutationFn: 实际的 API 调用 ==========
    mutationFn: async ({ source, id }: RemoveFavoriteParams) => {
      await deleteFavorite(source, id);
    },

    // ========== onMutate: 乐观更新 ==========
    onMutate: async ({ source, id }: RemoveFavoriteParams) => {
      // 1. 取消进行中的查询
      await queryClient.cancelQueries({ queryKey: ['favorites'] });

      // 2. 保存旧数据
      const previousFavorites = queryClient.getQueryData<Record<string, Favorite>>(['favorites']);

      // 3. 立即从缓存中删除
      queryClient.setQueryData<Record<string, Favorite>>(['favorites'], (old = {}) => {
        const key = `${source}+${id}`;
        const newFavorites = { ...old };
        delete newFavorites[key];
        return newFavorites;
      });

      return { previousFavorites };
    },

    // ========== onError: 失败时回滚 ==========
    onError: (error, variables, context) => {
      console.error('删除收藏失败:', error);

      if (context?.previousFavorites) {
        queryClient.setQueryData(['favorites'], context.previousFavorites);
      }
    },

    // ========== onSettled: 刷新数据 ==========
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
    },
  });
}

// ============================================================================
// Hook: 清空所有收藏
// ============================================================================

/**
 * 清空所有收藏的 Mutation Hook
 *
 * 特性：
 * - 乐观更新：立即清空 UI
 * - 错误回滚：失败时恢复所有数据
 * - 自动缓存失效：成功后刷新
 *
 * @example
 * ```tsx
 * const clearFavorites = useClearFavoritesMutation();
 *
 * clearFavorites.mutate();
 * ```
 */
export function useClearFavoritesMutation(): UseMutationResult<
  void,
  Error,
  void,
  MutationContext
> {
  const queryClient = useQueryClient();

  return useMutation({
    // ========== mutationFn: 实际的 API 调用 ==========
    mutationFn: async () => {
      await clearAllFavorites();
    },

    // ========== onMutate: 乐观更新 ==========
    onMutate: async () => {
      // 1. 取消进行中的查询
      await queryClient.cancelQueries({ queryKey: ['favorites'] });

      // 2. 保存旧数据
      const previousFavorites = queryClient.getQueryData<Record<string, Favorite>>(['favorites']);

      // 3. 立即清空缓存
      queryClient.setQueryData(['favorites'], {});

      return { previousFavorites };
    },

    // ========== onError: 失败时回滚 ==========
    onError: (error, variables, context) => {
      console.error('清空收藏失败:', error);

      if (context?.previousFavorites) {
        queryClient.setQueryData(['favorites'], context.previousFavorites);
      }
    },

    // ========== onSettled: 刷新数据 ==========
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
    },
  });
}

// ============================================================================
// Hook: 切换收藏状态（添加/删除）
// ============================================================================

/**
 * 切换收藏状态的 Mutation Hook
 *
 * 根据当前状态自动选择添加或删除操作
 *
 * @example
 * ```tsx
 * const toggleFavorite = useToggleFavoriteMutation();
 *
 * toggleFavorite.mutate({
 *   source: 'douban',
 *   id: '123',
 *   favorite: { title: '电影名', ... },
 *   isFavorited: false // 当前是否已收藏
 * });
 * ```
 */
export function useToggleFavoriteMutation(): UseMutationResult<
  void,
  Error,
  AddFavoriteParams & { isFavorited: boolean },
  MutationContext
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ source, id, favorite, isFavorited }) => {
      if (isFavorited) {
        await deleteFavorite(source, id);
      } else {
        await saveFavorite(source, id, favorite);
      }
    },

    onMutate: async ({ source, id, favorite, isFavorited }) => {
      await queryClient.cancelQueries({ queryKey: ['favorites'] });

      const previousFavorites = queryClient.getQueryData<Record<string, Favorite>>(['favorites']);

      queryClient.setQueryData<Record<string, Favorite>>(['favorites'], (old = {}) => {
        const key = `${source}+${id}`;
        const newFavorites = { ...old };

        if (isFavorited) {
          // 删除
          delete newFavorites[key];
        } else {
          // 添加
          newFavorites[key] = favorite;
        }

        return newFavorites;
      });

      return { previousFavorites };
    },

    onError: (error, variables, context) => {
      console.error('切换收藏状态失败:', error);

      if (context?.previousFavorites) {
        queryClient.setQueryData(['favorites'], context.previousFavorites);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
    },
  });
}
