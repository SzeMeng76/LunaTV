/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { memo } from 'react';

interface LoadingProgressIndicatorProps {
  loadingStage: 'searching' | 'preferring' | 'fetching' | 'ready';
}

/**
 * 加载进度指示器组件
 */
const LoadingProgressIndicator = memo(function LoadingProgressIndicator({
  loadingStage,
}: LoadingProgressIndicatorProps) {
  return (
    <div className='mb-6 w-80 mx-auto'>
      <div className='flex justify-center space-x-2 mb-4'>
        <div
          className={`w-3 h-3 rounded-full transition-all duration-500 ${
            loadingStage === 'searching' || loadingStage === 'fetching'
              ? 'bg-green-500 scale-125'
              : loadingStage === 'preferring' || loadingStage === 'ready'
              ? 'bg-green-500'
              : 'bg-gray-300'
          }`}
        ></div>
        <div
          className={`w-3 h-3 rounded-full transition-all duration-500 ${
            loadingStage === 'preferring'
              ? 'bg-green-500 scale-125'
              : loadingStage === 'ready'
              ? 'bg-green-500'
              : 'bg-gray-300'
          }`}
        ></div>
        <div
          className={`w-3 h-3 rounded-full transition-all duration-500 ${
            loadingStage === 'ready' ? 'bg-green-500 scale-125' : 'bg-gray-300'
          }`}
        ></div>
      </div>

      {/* 进度条 */}
      <div className='w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden'>
        <div
          className='h-full bg-linear-to-r from-green-500 to-emerald-600 rounded-full transition-all duration-1000 ease-out'
          style={{
            width:
              loadingStage === 'searching' || loadingStage === 'fetching'
                ? '33%'
                : loadingStage === 'preferring'
                ? '66%'
                : '100%',
          }}
        ></div>
      </div>
    </div>
  );
});

export default LoadingProgressIndicator;
