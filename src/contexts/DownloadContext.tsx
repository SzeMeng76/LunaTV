'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { M3U8Downloader, M3U8DownloadTask } from '@/lib/download/m3u8-downloader';

interface DownloadContextType {
  tasks: M3U8DownloadTask[];
  showDownloadPanel: boolean;
  setShowDownloadPanel: (show: boolean) => void;
  createTask: (url: string, title: string, type?: 'TS' | 'MP4') => Promise<void>;
  startTask: (taskId: string) => Promise<void>;
  pauseTask: (taskId: string) => void;
  cancelTask: (taskId: string) => void;
  retryFailedSegments: (taskId: string) => void;
  getProgress: (taskId: string) => number;
}

const DownloadContext = createContext<DownloadContextType | undefined>(undefined);

// 全局下载器实例
let downloaderInstance: M3U8Downloader | null = null;

function getDownloader(updateTasks: () => void): M3U8Downloader {
  if (!downloaderInstance) {
    downloaderInstance = new M3U8Downloader({
      onProgress: () => {
        updateTasks();
      },
      onComplete: (task) => {
        console.log('下载完成:', task.title);
        updateTasks();
      },
      onError: (task, error) => {
        console.error('下载错误:', task.title, error);
        updateTasks();
      },
    });
  }
  return downloaderInstance;
}

export function DownloadProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<M3U8DownloadTask[]>([]);
  const [showDownloadPanel, setShowDownloadPanel] = useState(false);

  const updateTasks = useCallback(() => {
    const downloader = getDownloader(updateTasks);
    setTasks([...downloader.getAllTasks()]);
  }, []);

  const createTask = useCallback(
    async (url: string, title: string, type: 'TS' | 'MP4' = 'TS') => {
      try {
        const downloader = getDownloader(updateTasks);
        const taskId = await downloader.createTask(url, title, type);
        updateTasks();

        // 自动开始下载
        await downloader.startTask(taskId);
        updateTasks();

        // 显示下载面板
        setShowDownloadPanel(true);
      } catch (error) {
        console.error('创建下载任务失败:', error);
        throw error;
      }
    },
    [updateTasks]
  );

  const startTask = useCallback(
    async (taskId: string) => {
      const downloader = getDownloader(updateTasks);
      await downloader.startTask(taskId);
      updateTasks();
    },
    [updateTasks]
  );

  const pauseTask = useCallback(
    (taskId: string) => {
      const downloader = getDownloader(updateTasks);
      downloader.pauseTask(taskId);
      updateTasks();
    },
    [updateTasks]
  );

  const cancelTask = useCallback(
    (taskId: string) => {
      const downloader = getDownloader(updateTasks);
      downloader.cancelTask(taskId);
      updateTasks();
    },
    [updateTasks]
  );

  const retryFailedSegments = useCallback(
    (taskId: string) => {
      const downloader = getDownloader(updateTasks);
      downloader.retryFailedSegments(taskId);
      updateTasks();
    },
    [updateTasks]
  );

  const getProgress = useCallback((taskId: string): number => {
    const downloader = getDownloader(updateTasks);
    return downloader.getProgress(taskId);
  }, [updateTasks]);

  return (
    <DownloadContext.Provider
      value={{
        tasks,
        showDownloadPanel,
        setShowDownloadPanel,
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
