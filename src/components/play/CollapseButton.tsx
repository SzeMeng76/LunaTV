'use client';

interface CollapseButtonProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

export default function CollapseButton({
  isCollapsed,
  onToggle,
}: CollapseButtonProps) {
  return (
    <button
      onClick={onToggle}
      className='hidden lg:flex group relative items-center gap-2 px-4 py-2 min-h-[44px] rounded-2xl bg-linear-to-br from-white/90 via-white/80 to-white/70 hover:from-white hover:via-white/95 hover:to-white/90 dark:from-gray-800/90 dark:via-gray-800/80 dark:to-gray-800/70 dark:hover:from-gray-800 dark:hover:via-gray-800/95 dark:hover:to-gray-800/90 backdrop-blur-md border border-white/60 dark:border-gray-700/60 shadow-[0_2px_8px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.1)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.3)] dark:hover:shadow-[0_4px_12px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.15)] hover:scale-105 active:scale-95 transition-all duration-300 overflow-hidden'
      title={isCollapsed ? '显示选集面板' : '隐藏选集面板'}
    >
      <div className='absolute inset-0 bg-linear-to-r from-transparent via-white/0 to-transparent group-hover:via-white/30 dark:group-hover:via-white/10 transition-all duration-500'></div>
      <svg
        className={`relative z-10 w-4 h-4 text-gray-500 dark:text-gray-400 transition-transform duration-200 ${
          isCollapsed ? 'rotate-180' : 'rotate-0'
        }`}
        fill='none'
        stroke='currentColor'
        viewBox='0 0 24 24'
      >
        <path
          strokeLinecap='round'
          strokeLinejoin='round'
          strokeWidth='2'
          d='M9 5l7 7-7 7'
        />
      </svg>
      <span className='relative z-10 text-xs font-medium text-gray-600 dark:text-gray-300'>
        {isCollapsed ? '显示' : '隐藏'}
      </span>

      {/* 精致的状态指示点 */}
      <div className='absolute -top-0.5 -right-0.5 z-20'>
        <div className='relative'>
          <div
            className={`absolute inset-0 rounded-full blur-sm opacity-75 ${
              isCollapsed ? 'bg-orange-400 animate-pulse' : 'bg-green-400'
            }`}
          ></div>
          <div
            className={`relative w-2 h-2 rounded-full shadow-lg ${
              isCollapsed
                ? 'bg-linear-to-br from-orange-400 to-orange-500'
                : 'bg-linear-to-br from-green-400 to-green-500'
            }`}
          ></div>
        </div>
      </div>
    </button>
  );
}
