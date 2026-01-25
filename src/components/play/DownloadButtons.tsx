/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { memo } from 'react';
import { Download } from 'lucide-react';

interface DownloadButtonsProps {
  downloadEnabled: boolean;
  onDownloadClick: () => void;
  onDownloadPanelClick: () => void;
}

/**
 * 下载按钮组件 - 独立拆分以优化性能
 * 包含下载视频按钮和下载管理按钮
 */
const DownloadButtons = memo(function DownloadButtons({
  downloadEnabled,
  onDownloadClick,
  onDownloadPanelClick,
}: DownloadButtonsProps) {
  if (!downloadEnabled) {
    return null;
  }

  return (
    <>
      {/* 下载按钮 */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDownloadClick();
        }}
        className='flex group relative items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 min-h-[40px] sm:min-h-[44px] rounded-2xl bg-linear-to-br from-white/90 via-white/80 to-white/70 hover:from-white hover:via-white/95 hover:to-white/90 dark:from-gray-800/90 dark:via-gray-800/80 dark:to-gray-800/70 dark:hover:from-gray-800 dark:hover:via-gray-800/95 dark:hover:to-gray-800/90 backdrop-blur-md border border-white/60 dark:border-gray-700/60 shadow-[0_2px_8px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.1)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.3)] dark:hover:shadow-[0_4px_12px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.15)] hover:scale-105 active:scale-95 transition-all duration-300 overflow-hidden'
        title='下载视频'
      >
        <div className='absolute inset-0 bg-linear-to-r from-transparent via-white/0 to-transparent group-hover:via-white/30 dark:group-hover:via-white/10 transition-all duration-500'></div>
        <Download className='relative z-10 w-3.5 sm:w-4 h-3.5 sm:h-4 text-gray-600 dark:text-gray-400' />
        <span className='relative z-10 hidden sm:inline text-xs font-medium text-gray-600 dark:text-gray-300'>
          下载
        </span>
      </button>

      {/* 下载管理按钮 */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDownloadPanelClick();
        }}
        className='flex group relative items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 min-h-[40px] sm:min-h-[44px] rounded-2xl bg-linear-to-br from-white/90 via-white/80 to-white/70 hover:from-white hover:via-white/95 hover:to-white/90 dark:from-gray-800/90 dark:via-gray-800/80 dark:to-gray-800/70 dark:hover:from-gray-800 dark:hover:via-gray-800/95 dark:hover:to-gray-800/90 backdrop-blur-md border border-white/60 dark:border-gray-700/60 shadow-[0_2px_8px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.1)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.3)] dark:hover:shadow-[0_4px_12px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.15)] hover:scale-105 active:scale-95 transition-all duration-300 overflow-hidden'
        title='下载管理'
      >
        <div className='absolute inset-0 bg-linear-to-r from-transparent via-white/0 to-transparent group-hover:via-white/30 dark:group-hover:via-white/10 transition-all duration-500'></div>
        <span className='relative z-10 text-sm sm:text-base'>📥</span>
        <span className='relative z-10 hidden sm:inline text-xs font-medium text-gray-600 dark:text-gray-300'>
          下载管理
        </span>
      </button>
    </>
  );
});

export default DownloadButtons;
