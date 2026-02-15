'use client';

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { M3U8DownloadTask, parseM3U8, downloadM3U8Video, PauseResumeController, StreamSaverMode } from '@/lib/download';
import type { DownloadProgress } from '@/lib/download';
import { getBestStreamMode, detectStreamModeSupport, type StreamModeSupport } from '@/lib/download/stream-mode-detector';
import {
  getAllTasks,
  saveTask,
  deleteTask as deleteTaskFromIDB,
  updateTaskStatus,
  getTaskSegments,
  isStorageBucketsSupported,
} from '@/lib/download/download-idb';

export interface DownloadSettings {
  concurrency: number; // 并发线程数
  maxRetries: number; // 最大重试次数
  streamMode: StreamSaverMode; // 下载模式
  defaultType: 'TS' | 'MP4'; // 默认格式
}

interface DownloadContextType {
  tasks: M3U8DownloadTask[];
  showDownloadPanel: boolean;
  setShowDownloadPanel: (show: boolean) => void;
  settings: DownloadSettings;
  setSettings: (settings: DownloadSettings) => void;
  streamModeSupport: StreamModeSupport;
  createTask: (
    url: string,
    title: string,
    type?: 'TS' | 'MP4',
    requestHeaders?: { referer?: string; origin?: string; userAgent?: string }
  ) => Promise<void>;
  startTask: (taskId: string, taskSnapshot?: M3U8DownloadTask) => Promise<void>;
  pauseTask: (taskId: string) => void;
  cancelTask: (taskId: string) => void;
  retryFailedSegments: (taskId: string) => void;
  getProgress: (taskId: string) => number;
}

const DownloadContext = createContext<DownloadContextType | undefined>(undefined);

export function DownloadProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<M3U8DownloadTask[]>([]);
  const [showDownloadPanel, setShowDownloadPanel] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);
  const [streamModeSupport, setStreamModeSupport] = useState<StreamModeSupport>({
    fileSystem: false,
    serviceWorker: false,
    blob: true,
  });

  // 下载设置（从 localStorage 恢复或使用默认值）
  const [settings, setSettings] = useState<DownloadSettings>(() => {
    if (typeof window === 'undefined') {
      return {
        concurrency: 6,
        maxRetries: 3,
        streamMode: 'disabled' as StreamSaverMode,
        defaultType: 'TS' as 'TS' | 'MP4',
      };
    }

    const savedSettings = localStorage.getItem('downloadSettings');
    if (savedSettings) {
      try {
        return JSON.parse(savedSettings);
      } catch {
        // 解析失败，使用默认值
      }
    }

    // 自动检测最佳模式
    const bestMode = getBestStreamMode();
    return {
      concurrency: 6,
      maxRetries: 3,
      streamMode: bestMode,
      defaultType: 'TS' as 'TS' | 'MP4',
    };
  });

  // 检测浏览器支持情况
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const support = detectStreamModeSupport();
      setStreamModeSupport(support);

      // 输出 Storage Buckets 支持情况
      if (isStorageBucketsSupported()) {
        console.log('✅ Storage Buckets API enabled for optimized segment storage');
      }
    }
  }, []);

  // 从 IndexedDB 恢复任务
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const restoreTasks = async () => {
      try {
        const storedTasks = await getAllTasks();

        // 转换为 M3U8DownloadTask 格式
        const restoredTasks: M3U8DownloadTask[] = await Promise.all(
          storedTasks.map(async (stored) => {
            // 恢复已下载的片段
            const downloadedSegments = await getTaskSegments(stored.id);

            // 状态标准化：未完成的任务统一设为 pause（参考 DecoTV 实现）
            const normalizedStatus =
              stored.status === 'done' || stored.status === 'error' || stored.status === 'pause'
                ? stored.status
                : 'pause';

            return {
              ...stored.task,
              id: stored.id,
              status: normalizedStatus,
              downloadedSegments,
              // 根据已下载片段数更新 finishNum
              finishNum: downloadedSegments.size,
              downloadIndex: downloadedSegments.size,
            };
          })
        );

        if (restoredTasks.length > 0) {
          setTasks(restoredTasks);
          // 不自动显示面板，保持用户上次的状态
          console.log(`✅ 恢复了 ${restoredTasks.length} 个下载任务（面板状态已保留）`);
        }
      } catch (error) {
        console.error('恢复任务失败:', error);
      } finally {
        setIsRestoring(false);
      }
    };

    restoreTasks();
  }, []);

  // 保存设置到 localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('downloadSettings', JSON.stringify(settings));
    }
  }, [settings]);

  // 存储每个任务的控制器和 AbortController
  const taskControllers = useRef<Map<string, {
    pauseController: PauseResumeController;
    abortController: AbortController;
  }>>(new Map());

  // 使用 ref 保存最新的 tasks，避免 stale closure 问题
  const tasksRef = useRef<M3U8DownloadTask[]>(tasks);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  const updateTask = useCallback((taskId: string, updates: Partial<M3U8DownloadTask>) => {
    setTasks(prev => prev.map(task =>
      task.id === taskId ? { ...task, ...updates } : task
    ));
  }, []);

  const createTask = useCallback(
    async (
      url: string,
      title: string,
      type: 'TS' | 'MP4' = 'TS',
      requestHeaders?: { referer?: string; origin?: string; userAgent?: string }
    ) => {
      try {
        // 解析 M3U8，传递请求头
        const m3u8Task = await parseM3U8(url, requestHeaders);

        // 创建任务对象
        const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const newTask: M3U8DownloadTask = {
          ...m3u8Task,
          id: taskId,
          title,
          type,
          status: 'ready',
        };

        setTasks(prev => [...prev, newTask]);

        // 保存到 IndexedDB
        await saveTask(taskId, m3u8Task, 'ready');

        // 自动开始下载（传递 task snapshot 避免 stale closure）
        await startTask(taskId, newTask);

        // 显示下载面板
        setShowDownloadPanel(true);
      } catch (error) {
        console.error('创建下载任务失败:', error);
        throw error;
      }
    },
    []
  );

  const startTask = useCallback(
    async (taskId: string, taskSnapshot?: M3U8DownloadTask) => {
      const task = taskSnapshot || tasksRef.current.find(t => t.id === taskId);
      if (!task) return;

      // 如果已经在下载中，不重复启动
      if (taskControllers.current.has(taskId)) return;

      // 创建新的控制器
      const pauseController = new PauseResumeController();
      const abortController = new AbortController();
      taskControllers.current.set(taskId, { pauseController, abortController });

      // 更新状态为下载中
      updateTask(taskId, { status: 'downloading' });
      await updateTaskStatus(taskId, 'downloading');

      try {
        // 开始下载（使用用户设置）
        await downloadM3U8Video(
          task,
          (progress: DownloadProgress) => {
            // 更新进度（包含优化的消息）
            updateTask(taskId, {
              finishNum: progress.current,
              downloadIndex: progress.current,
              progress, // 保存完整的 progress 对象
            });
          },
          abortController.signal,
          pauseController,
          settings.concurrency, // 使用设置的并发数
          settings.streamMode, // 使用设置的下载模式
          settings.maxRetries, // 使用设置的重试次数
          undefined, // completeStreamRef（暂不使用）
          taskId // 传递 taskId 用于保存片段到 IndexedDB
        );

        // 下载完成
        updateTask(taskId, { status: 'done' });
        await updateTaskStatus(taskId, 'done');
        console.log('下载完成:', task.title);
      } catch (error: unknown) {
        if (error instanceof Error && error.name === 'AbortError') {
          // 用户取消
          console.log('下载已取消:', task.title);
        } else {
          // 下载错误
          console.error('下载错误:', task.title, error);
          updateTask(taskId, { status: 'error' });
          await updateTaskStatus(taskId, 'error');
        }
      } finally {
        // 清理控制器
        taskControllers.current.delete(taskId);
      }
    },
    [updateTask, settings]
  );

  const pauseTask = useCallback(
    async (taskId: string) => {
      const controllers = taskControllers.current.get(taskId);
      if (controllers) {
        controllers.pauseController.pause();
        updateTask(taskId, { status: 'pause' });
        await updateTaskStatus(taskId, 'pause');
      }
    },
    [updateTask]
  );

  const cancelTask = useCallback(
    async (taskId: string) => {
      const controllers = taskControllers.current.get(taskId);
      if (controllers) {
        controllers.abortController.abort();
        taskControllers.current.delete(taskId);
      }

      // 从任务列表中移除
      setTasks(prev => prev.filter(task => task.id !== taskId));

      // 从 IndexedDB 中删除
      await deleteTaskFromIDB(taskId);
    },
    []
  );

  const retryFailedSegments = useCallback(
    async (taskId: string) => {
      const task = tasksRef.current.find(t => t.id === taskId);
      if (!task) return;

      // 重置错误计数
      updateTask(taskId, { errorNum: 0 });

      // 重新开始下载
      await startTask(taskId);
    },
    [updateTask, startTask]
  );

  const getProgress = useCallback((taskId: string): number => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return 0;

    const total = task.rangeDownload.targetSegment;
    if (total === 0) return 0;

    return (task.finishNum / total) * 100;
  }, [tasks]);

  return (
    <DownloadContext.Provider
      value={{
        tasks,
        showDownloadPanel,
        setShowDownloadPanel,
        settings,
        setSettings,
        streamModeSupport,
        createTask,
        startTask,
        pauseTask,
        cancelTask,
        retryFailedSegments,
        getProgress,
      }}
    >
      {children}
    </DownloadContext.Provider>
  );
}

export function useDownload() {
  const context = useContext(DownloadContext);
  if (context === undefined) {
    throw new Error('useDownload must be used within a DownloadProvider');
  }
  return context;
}
