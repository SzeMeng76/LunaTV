'use client';

interface VideoCoverDisplayProps {
  videoCover: string;
  bangumiDetails: {
    images?: {
      large?: string;
    };
  } | null;
  videoTitle: string;
  videoDoubanId: number;
  processImageUrl: (url: string) => string;
}

export default function VideoCoverDisplay({
  videoCover,
  bangumiDetails,
  videoTitle,
  videoDoubanId,
  processImageUrl,
}: VideoCoverDisplayProps) {
  return (
    <div className='hidden md:block md:col-span-1 md:order-first'>
      <div className='pl-0 py-4 pr-6'>
        <div className='group relative bg-gray-300 dark:bg-gray-700 aspect-[2/3] flex items-center justify-center rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-500 hover:scale-[1.02]'>
          {(videoCover || bangumiDetails?.images?.large) ? (
            <>
              {/* 渐变光泽动画层 */}
              <div
                className='absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none z-10'
                style={{
                  background: 'linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.15) 45%, rgba(255,255,255,0.4) 50%, rgba(255,255,255,0.15) 55%, transparent 70%)',
                  backgroundSize: '200% 100%',
                  animation: 'shimmer 2.5s ease-in-out infinite',
                }}
              />

              <img
                src={processImageUrl(bangumiDetails?.images?.large || videoCover)}
                alt={videoTitle}
                className='w-full h-full object-cover transition-transform duration-500 group-hover:scale-105'
              />

              {/* 悬浮遮罩 */}
              <div className='absolute inset-0 bg-linear-to-t from-black/60 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500'></div>

              {/* 链接按钮（bangumi或豆瓣） */}
              {videoDoubanId !== 0 && (
                <a
                  href={
                    bangumiDetails
                      ? `https://bgm.tv/subject/${videoDoubanId.toString()}`
                      : `https://movie.douban.com/subject/${videoDoubanId.toString()}`
                  }
                  target='_blank'
                  rel='noopener noreferrer'
                  className='absolute top-3 left-3 z-20'
                >
                  <div className={`relative ${bangumiDetails ? 'bg-linear-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600' : 'bg-linear-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600'} text-white text-xs font-bold w-10 h-10 rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-300 ease-out hover:scale-110 group/link`}>
                    <div className={`absolute inset-0 ${bangumiDetails ? 'bg-pink-400' : 'bg-green-400'} rounded-full opacity-0 group-hover/link:opacity-30 blur transition-opacity duration-300`}></div>
                    <svg
                      width='18'
                      height='18'
                      viewBox='0 0 24 24'
                      fill='none'
                      stroke='currentColor'
                      strokeWidth='2'
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      className='relative z-10'
                    >
                      <path d='M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71'></path>
                      <path d='M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'></path>
                    </svg>
                  </div>
                </a>
              )}
            </>
          ) : (
            <span className='text-gray-600 dark:text-gray-400'>
              封面图片
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
