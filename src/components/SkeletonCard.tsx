export default function SkeletonCard() {
  return (
    <div className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'>
      {/* 海报骨架 */}
      <div className='relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-gray-200 dark:bg-gray-800'>
        {/* Shimmer 效果 */}
        <div
          className='absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/20 to-transparent'
          style={{
            animationDuration: '1.5s',
            animationIterationCount: 'infinite',
          }}
        />
        <div className='absolute inset-0 bg-gray-300 dark:bg-gray-700'></div>
      </div>

      {/* 标题骨架 */}
      <div className='mt-2 space-y-2'>
        <div className='h-4 bg-gray-200 dark:bg-gray-800 rounded overflow-hidden relative'>
          <div
            className='absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/20 to-transparent'
            style={{
              animationDuration: '1.5s',
              animationIterationCount: 'infinite',
              animationDelay: '0.1s',
            }}
          />
        </div>
        <div className='h-3 w-3/4 bg-gray-200 dark:bg-gray-800 rounded overflow-hidden relative'>
          <div
            className='absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/20 to-transparent'
            style={{
              animationDuration: '1.5s',
              animationIterationCount: 'infinite',
              animationDelay: '0.2s',
            }}
          />
        </div>
      </div>
    </div>
  );
}
