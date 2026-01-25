/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

interface NetDiskButtonProps {
  videoTitle: string;
  netdiskLoading: boolean;
  netdiskTotal: number;
  netdiskResults: any;
  onSearch: (title: string) => void;
  onOpenModal: () => void;
}

export default function NetDiskButton({
  videoTitle,
  netdiskLoading,
  netdiskTotal,
  netdiskResults,
  onSearch,
  onOpenModal,
}: NetDiskButtonProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // 触发网盘搜索（如果还没搜索过）
    if (!netdiskResults && !netdiskLoading && videoTitle) {
      onSearch(videoTitle);
    }
    // 打开网盘模态框
    onOpenModal();
  };

  return (
    <button
      onClick={handleClick}
      className='flex group relative items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 min-h-[40px] sm:min-h-[44px] rounded-2xl bg-linear-to-br from-white/90 via-white/80 to-white/70 hover:from-white hover:via-white/95 hover:to-white/90 dark:from-gray-800/90 dark:via-gray-800/80 dark:to-gray-800/70 dark:hover:from-gray-800 dark:hover:via-gray-800/95 dark:hover:to-gray-800/90 backdrop-blur-md border border-white/60 dark:border-gray-700/60 shadow-[0_2px_8px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.1)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.3)] dark:hover:shadow-[0_4px_12px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.15)] hover:scale-105 active:scale-95 transition-all duration-300 overflow-hidden'
      title='网盘资源'
    >
      <div className='absolute inset-0 bg-linear-to-r from-transparent via-white/0 to-transparent group-hover:via-white/30 dark:group-hover:via-white/10 transition-all duration-500'></div>
      <span className='relative z-10 text-sm sm:text-base'>📁</span>
      <span className='relative z-10 hidden sm:inline text-xs font-medium text-gray-600 dark:text-gray-300'>
        {netdiskLoading ? (
          <span className='flex items-center gap-1'>
            <span className='inline-block h-3 w-3 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin'></span>
            搜索中
          </span>
        ) : netdiskTotal > 0 ? (
          `网盘 (${netdiskTotal})`
        ) : (
          '网盘'
        )}
      </span>

      {/* 状态指示点 */}
      {netdiskTotal > 0 && (
        <div className='absolute -top-0.5 -right-0.5 z-20'>
          <div className='relative'>
            <div className='absolute inset-0 bg-blue-400 rounded-full blur-sm opacity-75 animate-pulse'></div>
            <div className='relative w-2 h-2 rounded-full bg-linear-to-br from-blue-400 to-blue-500 shadow-lg'></div>
          </div>
        </div>
      )}
    </button>
  );
}
