'use client';

/**
 * 提醒管理的 TanStack Query Mutations
 *
 * 基于 TanStack Query 源码最佳实践实现：
 * 1. 使用 useMutation 管理所有数据修改操作
 * 2. 实现乐观更新（Optimistic Updates）提升用户体验
 * 3. 完善的错误处理和回滚机制
 * 4. 自动缓存失效和数据同步
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';
import {
  saveReminder,
  deleteReminder,
  clearAllReminders,
  type Reminder,
} from '@/lib/db.client';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 添加提醒的参数
 */
export interface AddReminderParams {
  source: string;
  id: string;
  reminder: Reminder;
}

/**
 * 删除提醒的参数
 */
export interface RemoveReminderParams {
  source: string;
  id: string;
}

/**
 * Mutation 上下文（用于乐观更新回滚）
 */
interface MutationContext {
  previousReminders?: Record<string, Reminder>;
}

// ============================================================================
// Hook: 添加提醒
// ============================================================================

export function useAddReminderMutation(): UseMutationResult<
  void,
  Error,
  AddReminderParams,
  MutationContext
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ source, id, reminder }: AddReminderParams) => {
      await saveReminder(source, id, reminder);
    },

    onMutate: async ({ source, id, reminder }: AddReminderParams) => {
      await queryClient.cancelQueries({ queryKey: ['reminders'] });

      const previousReminders = queryClient.getQueryData<Record<string, Reminder>>(['reminders']);

      queryClient.setQueryData<Record<string, Reminder>>(['reminders'], (old = {}) => {
        const key = `${source}+${id}`;
        return {
          ...old,
          [key]: reminder,
        };
      });

      return { previousReminders };
    },

    onError: (error, variables, context) => {
      console.error('添加提醒失败:', error);

      if (context?.previousReminders) {
        queryClient.setQueryData(['reminders'], context.previousReminders);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
    },
  });
}

// ============================================================================
// Hook: 删除提醒
// ============================================================================

export function useRemoveReminderMutation(): UseMutationResult<
  void,
  Error,
  RemoveReminderParams,
  MutationContext
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ source, id }: RemoveReminderParams) => {
      await deleteReminder(source, id);
    },

    onMutate: async ({ source, id }: RemoveReminderParams) => {
      await queryClient.cancelQueries({ queryKey: ['reminders'] });

      const previousReminders = queryClient.getQueryData<Record<string, Reminder>>(['reminders']);

      queryClient.setQueryData<Record<string, Reminder>>(['reminders'], (old = {}) => {
        const key = `${source}+${id}`;
        const newReminders = { ...old };
        delete newReminders[key];
        return newReminders;
      });

      return { previousReminders };
    },

    onError: (error, variables, context) => {
      console.error('删除提醒失败:', error);

      if (context?.previousReminders) {
        queryClient.setQueryData(['reminders'], context.previousReminders);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
    },
  });
}

// ============================================================================
// Hook: 清空所有提醒
// ============================================================================

export function useClearRemindersMutation(): UseMutationResult<
  void,
  Error,
  void,
  MutationContext
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await clearAllReminders();
    },

    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['reminders'] });

      const previousReminders = queryClient.getQueryData<Record<string, Reminder>>(['reminders']);

      queryClient.setQueryData(['reminders'], {});

      return { previousReminders };
    },

    onError: (error, variables, context) => {
      console.error('清空提醒失败:', error);

      if (context?.previousReminders) {
        queryClient.setQueryData(['reminders'], context.previousReminders);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
    },
  });
}

// ============================================================================
// Hook: 切换提醒状态（添加/删除）
// ============================================================================

export function useToggleReminderMutation(): UseMutationResult<
  void,
  Error,
  AddReminderParams & { isReminded: boolean },
  MutationContext
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ source, id, reminder, isReminded }) => {
      if (isReminded) {
        await deleteReminder(source, id);
      } else {
        await saveReminder(source, id, reminder);
      }
    },

    onMutate: async ({ source, id, reminder, isReminded }) => {
      await queryClient.cancelQueries({ queryKey: ['reminders'] });

      const previousReminders = queryClient.getQueryData<Record<string, Reminder>>(['reminders']);

      queryClient.setQueryData<Record<string, Reminder>>(['reminders'], (old = {}) => {
        const key = `${source}+${id}`;
        const newReminders = { ...old };

        if (isReminded) {
          // 删除
          delete newReminders[key];
        } else {
          // 添加
          newReminders[key] = reminder;
        }

        return newReminders;
      });

      return { previousReminders };
    },

    onError: (error, variables, context) => {
      console.error('切换提醒状态失败:', error);

      if (context?.previousReminders) {
        queryClient.setQueryData(['reminders'], context.previousReminders);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
    },
  });
}
