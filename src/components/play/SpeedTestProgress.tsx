/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { memo } from 'react';

interface SpeedTestProgressProps {
  progress: {
    current: number;
    total: number;
    currentSource: string;
    result?: string;
  };
}

/**
 * 测速进度组件
 */
const SpeedTestProgress = memo(function SpeedTestProgress({
  progress,
}: SpeedTestProgressProps) {
  return (
    <div className='mt-6 space-y-3'>
      {/* 进度条容器 */}
      <div className='relative w-full'>
        {/* 背景进度条 */}
        <div className='h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden'>
          {/* 动态进度条 - Netflix红色 */}
          <div
            className='h-full bg-gradient-to-r from-red-600 to-red-500 rounded-full transition-all duration-300 ease-out relative overflow-hidden'
            style={{
              width: `${(progress.current / progress.total) * 100}%`,
            }}
          >
            {/* 闪烁效果 */}
            <div className='absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer'></div>
          </div>
        </div>

        {/* 进度数字 - 靠右显示 */}
        <div className='absolute -top-6 right-0 text-xs font-medium text-gray-500 dark:text-gray-400'>
          {progress.current}/{progress.total}
        </div>
      </div>

      {/* 当前测试源信息卡片 */}
      <div className='bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 border border-gray-200 dark:border-gray-700'>
        <div className='flex items-center gap-2'>
          {/* 脉动指示器 */}
          <div className='relative'>
            <div className='w-2 h-2 bg-red-500 rounded-full animate-pulse'></div>
            <div className='absolute inset-0 w-2 h-2 bg-red-500 rounded-full animate-ping'></div>
          </div>

          {/* 源名称 */}
          <span className='text-sm font-semibold text-gray-700 dark:text-gray-300 truncate flex-1'>
            {progress.currentSource}
          </span>
        </div>

        {/* 测试结果 */}
        {progress.result && (
          <div className='mt-2 flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 font-mono'>
            {progress.result === '测速失败' ? (
              <span className='text-red-500 flex items-center gap-1'>
                <svg className='w-3 h-3' fill='currentColor' viewBox='0 0 20 20'>
                  <path fillRule='evenodd' d='M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z' clipRule='evenodd' />
                </svg>
                连接失败
              </span>
            ) : (
              <span className='text-green-600 dark:text-green-400 flex items-center gap-1'>
                <svg className='w-3 h-3' fill='currentColor' viewBox='0 0 20 20'>
                  <path fillRule='evenodd' d='M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z' clipRule='evenodd' />
                </svg>
                {progress.result}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

export default SpeedTestProgress;
