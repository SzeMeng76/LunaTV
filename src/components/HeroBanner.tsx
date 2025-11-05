/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { ChevronLeft, ChevronRight, Info, Play } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

interface BannerItem {
  id: string | number;
  title: string;
  description?: string;
  poster: string;
  backdrop?: string;
  year?: string;
  rate?: string;
  douban_id?: number;
  type?: string;
}

interface HeroBannerProps {
  items: BannerItem[];
  autoPlayInterval?: number; // 自动播放间隔（毫秒）
  showControls?: boolean;
  showIndicators?: boolean;
}

export default function HeroBanner({
  items,
  autoPlayInterval = 5000,
  showControls = true,
  showIndicators = true,
}: HeroBannerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // 处理图片 URL，使用代理绕过防盗链
  const getProxiedImageUrl = (url: string) => {
    // 如果是豆瓣图片，使用代理
    if (url?.includes('douban') || url?.includes('doubanio')) {
      return `/api/image-proxy?url=${encodeURIComponent(url)}`;
    }
    return url;
  };

  // 预加载图片
  useEffect(() => {
    items.forEach((item) => {
      const img = new Image();
      const imageUrl = item.backdrop || item.poster;
      img.src = getProxiedImageUrl(imageUrl);
    });
  }, [items]);

  // 自动轮播
  useEffect(() => {
    if (!autoPlayInterval || isHovered || items.length <= 1) return;

    const interval = setInterval(() => {
      handleNext();
    }, autoPlayInterval);

    return () => clearInterval(interval);
  }, [currentIndex, isHovered, autoPlayInterval, items.length]);

  const handleNext = () => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setCurrentIndex((prev) => (prev + 1) % items.length);
    setTimeout(() => setIsTransitioning(false), 500);
  };

  const handlePrev = () => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setCurrentIndex((prev) => (prev - 1 + items.length) % items.length);
    setTimeout(() => setIsTransitioning(false), 500);
  };

  const handleIndicatorClick = (index: number) => {
    if (isTransitioning || index === currentIndex) return;
    setIsTransitioning(true);
    setCurrentIndex(index);
    setTimeout(() => setIsTransitioning(false), 500);
  };

  if (!items || items.length === 0) {
    return null;
  }

  const currentItem = items[currentIndex];
  const imageUrl = currentItem.backdrop || currentItem.poster;

  return (
    <div
      className='relative w-full h-[280px] sm:h-[320px] md:h-[360px] overflow-hidden rounded-2xl group'
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* 渐变背景 */}
      <div className='absolute inset-0'>
        {items.map((item, index) => {
          // 根据索引生成不同的渐变色
          const gradients = [
            'from-blue-600 via-purple-600 to-pink-600',
            'from-red-600 via-orange-600 to-yellow-600',
            'from-green-600 via-teal-600 to-cyan-600',
            'from-indigo-600 via-purple-600 to-pink-600',
            'from-emerald-600 via-green-600 to-lime-600',
            'from-violet-600 via-fuchsia-600 to-pink-600',
            'from-cyan-600 via-blue-600 to-indigo-600',
            'from-amber-600 via-orange-600 to-red-600',
          ];
          const gradient = gradients[index % gradients.length];

          return (
            <div
              key={item.id}
              className={`absolute inset-0 bg-gradient-to-r ${gradient} transition-opacity duration-700 ease-in-out ${
                index === currentIndex ? 'opacity-100' : 'opacity-0'
              }`}
            >
              {/* 噪点纹理 */}
              <div className='absolute inset-0 opacity-10' style={{
                backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' /%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\' /%3E%3C/svg%3E")',
              }}></div>
            </div>
          );
        })}
      </div>

      {/* 主要内容区域 - 左图右文布局 */}
      <div className='relative h-full flex items-center gap-3 sm:gap-6 md:gap-8 lg:gap-12 px-4 sm:px-6 md:px-8 lg:px-12'>
        {/* 左侧：海报图片 - 移动端也显示 */}
        <div className='flex-shrink-0'>
          {items.map((item, index) => (
            <div
              key={item.id}
              className={`transition-opacity duration-700 ease-in-out ${
                index === currentIndex ? 'opacity-100' : 'opacity-0 absolute'
              }`}
            >
              <img
                src={getProxiedImageUrl(item.poster)}
                alt={item.title}
                className='w-20 sm:w-32 md:w-40 lg:w-48 h-auto rounded-lg shadow-2xl ring-2 ring-white/20'
              />
            </div>
          ))}
        </div>

        {/* 右侧：内容信息 */}
        <div className='flex-1 min-w-0 flex flex-col justify-center gap-1 sm:gap-2 md:gap-2.5 max-h-full py-2'>
          {/* 标题 */}
          <h1 className='text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-white drop-shadow-lg leading-tight line-clamp-2 flex-shrink-0'>
            {currentItem.title}
          </h1>

          {/* 元数据 */}
          <div className='flex items-center gap-2 sm:gap-3 text-xs sm:text-sm flex-shrink-0 flex-wrap'>
            {currentItem.year && (
              <span className='text-white/90 font-medium'>{currentItem.year}</span>
            )}
            {currentItem.rate && (
              <div className='flex items-center gap-1 px-2 py-1 bg-white/20 backdrop-blur-sm rounded'>
                <span className='text-yellow-400'>★</span>
                <span className='text-white font-semibold'>{currentItem.rate}</span>
              </div>
            )}
            {currentItem.type && (
              <span className='px-2 py-1 bg-white/20 backdrop-blur-sm rounded text-white/90'>
                {currentItem.type === 'movie' ? '电影' :
                 currentItem.type === 'tv' ? '剧集' :
                 currentItem.type === 'variety' ? '综艺' :
                 currentItem.type === 'shortdrama' ? '短剧' :
                 currentItem.type === 'anime' ? '动漫' : '剧集'}
              </span>
            )}
          </div>

          {/* 描述 - 只在较大屏幕显示，且限制最多2行 */}
          {currentItem.description && (
            <p className='hidden md:block text-sm lg:text-base text-white/80 line-clamp-2 max-w-2xl flex-shrink min-h-0'>
              {currentItem.description}
            </p>
          )}

          {/* 操作按钮 */}
          <div className='flex flex-wrap gap-2 sm:gap-3 flex-shrink-0'>
            <Link
              href={`/play?title=${encodeURIComponent(currentItem.title)}${currentItem.year ? `&year=${currentItem.year}` : ''}${currentItem.douban_id ? `&douban_id=${currentItem.douban_id}` : ''}`}
              className='flex items-center gap-2 px-4 sm:px-5 py-2 bg-white text-black font-semibold rounded-lg hover:bg-gray-200 transition-all transform hover:scale-105 shadow-lg text-sm sm:text-base'
            >
              <Play className='w-4 h-4' fill='currentColor' />
              <span>播放</span>
            </Link>
            <Link
              href={
                currentItem.type === 'shortdrama'
                  ? '/shortdrama'
                  : `/douban?type=${
                      currentItem.type === 'variety' ? 'show' : (currentItem.type || 'movie')
                    }`
              }
              className='flex items-center gap-2 px-4 sm:px-5 py-2 bg-white/20 backdrop-blur-sm text-white font-semibold rounded-lg hover:bg-white/30 transition-all transform hover:scale-105 text-sm sm:text-base'
            >
              <Info className='w-4 h-4' />
              <span>更多</span>
            </Link>
          </div>
        </div>
      </div>

      {/* 导航按钮 */}
      {showControls && items.length > 1 && (
        <>
          <button
            onClick={handlePrev}
            className='absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-black/30 backdrop-blur-sm text-white flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-black/50 transition-all transform hover:scale-110'
            aria-label='上一张'
          >
            <ChevronLeft className='w-5 h-5 sm:w-6 sm:h-6' />
          </button>
          <button
            onClick={handleNext}
            className='absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-black/30 backdrop-blur-sm text-white flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-black/50 transition-all transform hover:scale-110'
            aria-label='下一张'
          >
            <ChevronRight className='w-5 h-5 sm:w-6 sm:h-6' />
          </button>
        </>
      )}

      {/* 指示器 */}
      {showIndicators && items.length > 1 && (
        <div className='absolute bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 flex gap-2'>
          {items.map((_, index) => (
            <button
              key={index}
              onClick={() => handleIndicatorClick(index)}
              className={`h-1 sm:h-1.5 rounded-full transition-all duration-300 ${
                index === currentIndex
                  ? 'w-8 sm:w-10 bg-white'
                  : 'w-1 sm:w-1.5 bg-white/50 hover:bg-white/75'
              }`}
              aria-label={`跳转到第 ${index + 1} 张`}
            />
          ))}
        </div>
      )}

      {/* 计数器 */}
      <div className='absolute top-4 right-4 px-3 py-1.5 bg-black/40 backdrop-blur-sm rounded-full text-white text-xs sm:text-sm font-medium'>
        {currentIndex + 1} / {items.length}
      </div>
    </div>
  );
}
