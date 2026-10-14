'use client';

import { memo } from 'react';

import PageLayout from '@/components/PageLayout';

import LoadingProgressIndicator from './LoadingProgressIndicator';
import SpeedTestProgress from './SpeedTestProgress';

interface LoadingScreenProps {
  loadingStage: 'searching' | 'preferring' | 'fetching' | 'ready';
  loadingMessage: string;
  speedTestProgress?: {
    current: number;
    total: number;
    currentSource: string;
    result?: string;
  } | null;
}

/**
 * 加载状态组件 - 独立拆分以优化性能
 * 使用 React.memo 防止不必要的重新渲染
 */
const LoadingScreen = memo(function LoadingScreen({
  loadingStage,
  loadingMessage,
  speedTestProgress,
}: LoadingScreenProps) {
  return (
    <PageLayout activePath='/play'>
      <div className='flex items-center justify-center min-h-screen bg-transparent'>
        <div className='text-center max-w-md mx-auto px-6'>
          {/* 动画影院图标 */}
          <div className='relative mb-8'>
            <div className='relative mx-auto w-24 h-24 bg-linear-to-r from-green-500 to-emerald-600 rounded-2xl shadow-2xl flex items-center justify-center transform hover:scale-105 transition-transform duration-300'>
              <div className='text-white text-4xl'>
                {loadingStage === 'searching' && '🔍'}
                {loadingStage === 'preferring' && '⚡'}
                {loadingStage === 'fetching' && '🎬'}
                {loadingStage === 'ready' && '✨'}
              </div>
              {/* 旋转光环 */}
              <div className='absolute -inset-2 bg-linear-to-r from-green-500 to-emerald-600 rounded-2xl opacity-20 animate-spin'></div>
            </div>

            {/* 浮动粒子效果 */}
            <div className='absolute top-0 left-0 w-full h-full pointer-events-none'>
              <div className='absolute top-2 left-2 w-2 h-2 bg-green-400 rounded-full animate-bounce'></div>
              <div
                className='absolute top-4 right-4 w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce'
                style={{ animationDelay: '0.5s' }}
              ></div>
              <div
                className='absolute bottom-3 left-6 w-1 h-1 bg-lime-400 rounded-full animate-bounce'
                style={{ animationDelay: '1s' }}
              ></div>
            </div>
          </div>

          {/* 进度指示器 */}
          <LoadingProgressIndicator loadingStage={loadingStage} />

          {/* 加载消息 */}
          <div className='space-y-2'>
            <p className='text-xl font-semibold text-gray-800 dark:text-gray-200 animate-pulse'>
              {loadingMessage}
            </p>

            {/* Netflix风格测速进度显示 */}
            {speedTestProgress && (
              <SpeedTestProgress progress={speedTestProgress} />
            )}
          </div>
        </div>
      </div>
    </PageLayout>
  );
});

export default LoadingScreen;
