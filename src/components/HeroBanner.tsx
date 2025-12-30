/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { ChevronLeft, ChevronRight, Info, Play, Volume2, VolumeX } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState, useRef } from 'react';

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
  trailerUrl?: string; // 预告片视频URL（可选）
}

interface HeroBannerProps {
  items: BannerItem[];
  autoPlayInterval?: number;
  showControls?: boolean;
  showIndicators?: boolean;
  enableVideo?: boolean; // 是否启用视频自动播放
}

export default function HeroBanner({
  items,
  autoPlayInterval = 8000, // Netflix风格：更长的停留时间
  showControls = true,
  showIndicators = true,
  enableVideo = false,
}: HeroBannerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // 处理图片 URL，使用代理绕过防盗链
  const getProxiedImageUrl = (url: string) => {
    if (url?.includes('douban') || url?.includes('doubanio')) {
      return `/api/image-proxy?url=${encodeURIComponent(url)}`;
    }
    return url;
  };

  // 预加载背景图片
  useEffect(() => {
    items.forEach((item) => {
      const img = new window.Image();
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

  // 视频自动播放（延迟3秒，Netflix风格）
  useEffect(() => {
    if (!enableVideo || !videoRef.current) return;

    const timer = setTimeout(() => {
      videoRef.current?.play().catch(() => {
        // 自动播放失败时静默处理
      });
    }, 3000);

    return () => clearTimeout(timer);
  }, [currentIndex, enableVideo]);

  const handleNext = () => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setCurrentIndex((prev) => (prev + 1) % items.length);
    setTimeout(() => setIsTransitioning(false), 800); // Netflix风格：更慢的过渡
  };

  const handlePrev = () => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setCurrentIndex((prev) => (prev - 1 + items.length) % items.length);
    setTimeout(() => setIsTransitioning(false), 800);
  };

  const handleIndicatorClick = (index: number) => {
    if (isTransitioning || index === currentIndex) return;
    setIsTransitioning(true);
    setCurrentIndex(index);
    setTimeout(() => setIsTransitioning(false), 800);
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  // 触摸手势处理
  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;

    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe) {
      handleNext();
    } else if (isRightSwipe) {
      handlePrev();
    }
  };

  if (!items || items.length === 0) {
    return null;
  }

  const currentItem = items[currentIndex];
  const backgroundImage = currentItem.backdrop || currentItem.poster;

  return (
    <div
      className="relative w-full h-[70vh] sm:h-[75vh] md:h-[80vh] lg:h-[85vh] xl:h-[90vh] overflow-hidden group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* 背景图片/视频层 */}
      <div className="absolute inset-0">
        {items.map((item, index) => (
          <div
            key={item.id}
            className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
              index === currentIndex ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {/* 视频背景（如果启用且有预告片URL） */}
            {enableVideo && item.trailerUrl && index === currentIndex ? (
              <video
                ref={videoRef}
                className="absolute inset-0 w-full h-full object-cover"
                muted={isMuted}
                loop
                playsInline
                preload="metadata"
              >
                <source src={item.trailerUrl} type="video/mp4" />
              </video>
            ) : (
              /* 静态背景图片 */
              <Image
                src={getProxiedImageUrl(item.backdrop || item.poster)}
                alt={item.title}
                fill
                className="object-cover object-center"
                priority={index === 0}
                quality={85}
                sizes="100vw"
              />
            )}
          </div>
        ))}

        {/* Netflix经典渐变遮罩：底部黑→中间透明→顶部黑 */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/80" />

        {/* 左侧额外渐变（增强文字可读性） */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-transparent" />
      </div>

      {/* 内容叠加层 - Netflix风格：左下角 */}
      <div className="absolute bottom-0 left-0 right-0 px-4 sm:px-8 md:px-12 lg:px-16 xl:px-20 pb-12 sm:pb-16 md:pb-20 lg:pb-24">
        <div className="max-w-2xl space-y-3 sm:space-y-4 md:space-y-5 lg:space-y-6">
          {/* 标题 - Netflix风格：超大字体 */}
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold text-white drop-shadow-2xl leading-tight">
            {currentItem.title}
          </h1>

          {/* 元数据 */}
          <div className="flex items-center gap-3 sm:gap-4 text-sm sm:text-base md:text-lg flex-wrap">
            {currentItem.rate && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-yellow-500/90 backdrop-blur-sm rounded">
                <span className="text-white font-bold">★</span>
                <span className="text-white font-bold">{currentItem.rate}</span>
              </div>
            )}
            {currentItem.year && (
              <span className="text-white/90 font-semibold drop-shadow-md">
                {currentItem.year}
              </span>
            )}
            {currentItem.type && (
              <span className="px-3 py-1 bg-white/20 backdrop-blur-sm rounded text-white/90 font-medium border border-white/30">
                {currentItem.type === 'movie' ? '电影' :
                 currentItem.type === 'tv' ? '剧集' :
                 currentItem.type === 'variety' ? '综艺' :
                 currentItem.type === 'shortdrama' ? '短剧' :
                 currentItem.type === 'anime' ? '动漫' : '剧集'}
              </span>
            )}
          </div>

          {/* 描述 - 限制3行 */}
          {currentItem.description && (
            <p className="text-sm sm:text-base md:text-lg lg:text-xl text-white/90 line-clamp-3 drop-shadow-lg leading-relaxed max-w-xl">
              {currentItem.description}
            </p>
          )}

          {/* 操作按钮 - Netflix风格 */}
          <div className="flex gap-3 sm:gap-4 pt-2">
            <Link
              href={
                currentItem.type === 'shortdrama'
                  ? `/play?title=${encodeURIComponent(currentItem.title)}&shortdrama_id=${currentItem.id}`
                  : `/play?title=${encodeURIComponent(currentItem.title)}${currentItem.year ? `&year=${currentItem.year}` : ''}${currentItem.douban_id ? `&douban_id=${currentItem.douban_id}` : ''}${currentItem.type ? `&stype=${currentItem.type}` : ''}`
              }
              className="flex items-center gap-2 px-6 sm:px-8 md:px-10 py-2.5 sm:py-3 md:py-4 bg-white text-black font-bold rounded hover:bg-white/90 transition-all transform hover:scale-105 active:scale-95 shadow-xl text-base sm:text-lg md:text-xl"
            >
              <Play className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7" fill="currentColor" />
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
              className="flex items-center gap-2 px-6 sm:px-8 md:px-10 py-2.5 sm:py-3 md:py-4 bg-white/30 backdrop-blur-md text-white font-bold rounded hover:bg-white/40 transition-all transform hover:scale-105 active:scale-95 shadow-xl text-base sm:text-lg md:text-xl border border-white/50"
            >
              <Info className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7" />
              <span>更多信息</span>
            </Link>
          </div>
        </div>
      </div>

      {/* 音量控制按钮（仅视频模式） */}
      {enableVideo && currentItem.trailerUrl && (
        <button
          onClick={toggleMute}
          className="absolute bottom-28 sm:bottom-32 md:bottom-36 right-4 sm:right-8 md:right-12 lg:right-16 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-black/50 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/70 transition-all border border-white/50"
          aria-label={isMuted ? '取消静音' : '静音'}
        >
          {isMuted ? (
            <VolumeX className="w-5 h-5 sm:w-6 sm:h-6" />
          ) : (
            <Volume2 className="w-5 h-5 sm:w-6 sm:h-6" />
          )}
        </button>
      )}

      {/* 导航按钮 - 桌面端显示 */}
      {showControls && items.length > 1 && (
        <>
          <button
            onClick={handlePrev}
            className="hidden md:flex absolute left-4 lg:left-8 top-1/2 -translate-y-1/2 w-12 h-12 lg:w-14 lg:h-14 rounded-full bg-black/50 backdrop-blur-sm text-white items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-black/70 transition-all transform hover:scale-110 border border-white/30"
            aria-label="上一张"
          >
            <ChevronLeft className="w-7 h-7 lg:w-8 lg:h-8" />
          </button>
          <button
            onClick={handleNext}
            className="hidden md:flex absolute right-4 lg:right-8 top-1/2 -translate-y-1/2 w-12 h-12 lg:w-14 lg:h-14 rounded-full bg-black/50 backdrop-blur-sm text-white items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-black/70 transition-all transform hover:scale-110 border border-white/30"
            aria-label="下一张"
          >
            <ChevronRight className="w-7 h-7 lg:w-8 lg:h-8" />
          </button>
        </>
      )}

      {/* 指示器 - Netflix风格：底部居中 */}
      {showIndicators && items.length > 1 && (
        <div className="absolute bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
          {items.map((_, index) => (
            <button
              key={index}
              onClick={() => handleIndicatorClick(index)}
              className={`h-1 rounded-full transition-all duration-300 ${
                index === currentIndex
                  ? 'w-8 sm:w-10 bg-white shadow-lg'
                  : 'w-2 bg-white/50 hover:bg-white/75'
              }`}
              aria-label={`跳转到第 ${index + 1} 张`}
            />
          ))}
        </div>
      )}

      {/* 年龄分级标识（可选） */}
      <div className="absolute top-4 sm:top-6 md:top-8 right-4 sm:right-8 md:right-12">
        <div className="px-2 py-1 bg-black/60 backdrop-blur-sm border-2 border-white/70 rounded text-white text-xs sm:text-sm font-bold">
          {currentIndex + 1} / {items.length}
        </div>
      </div>
    </div>
  );
}
