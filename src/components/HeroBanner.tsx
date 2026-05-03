/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { ChevronLeft, ChevronRight, Info, Play, Volume2, VolumeX } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState, useRef, useCallback, memo } from 'react';
import { useAutoplay } from './hooks/useAutoplay';
import { useSwipeGesture } from './hooks/useSwipeGesture';
// 🚀 TanStack Query Queries & Mutations
import {
  useRefreshedTrailerUrlsQuery,
  useRefreshTrailerUrlMutation,
  useClearTrailerUrlMutation,
} from '@/hooks/useHeroBannerQueries';

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

// 🚀 优化方案6：使用React.memo防止不必要的重渲染
function HeroBanner({
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
  const [videoLoaded, setVideoLoaded] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const isMountedRef = useRef(true);
  const transitionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const videoErrorRetryCount = useRef<Record<string, number>>({});

  // 🚀 TanStack Query - 刷新后的trailer URL缓存
  // 替换 useState + localStorage 手动管理
  const { data: refreshedTrailerUrls = {} } = useRefreshedTrailerUrlsQuery();
  const refreshTrailerMutation = useRefreshTrailerUrlMutation();
  const clearTrailerMutation = useClearTrailerUrlMutation();

  // 重置越界的 currentIndex - 立即同步重置，避免渲染崩溃
  useEffect(() => {
    if (items.length > 0 && currentIndex >= items.length) {
      console.warn('[HeroBanner] currentIndex out of bounds, resetting to 0');
      setCurrentIndex(0);
      setVideoLoaded(false); // 重置视频加载状态
    }
  }, [items.length, currentIndex]);

  // 监听items变化，立即重置状态
  useEffect(() => {
    if (items.length === 0) {
      setCurrentIndex(0);
      setVideoLoaded(false);
      setIsTransitioning(false);
    }

    // 当items变化时，停止当前视频播放，避免引用过期的item
    if (videoRef.current) {
      try {
        videoRef.current.pause();
        videoRef.current.src = '';
        videoRef.current.load();
      } catch (error) {
        console.warn('[HeroBanner] 清理视频失败:', error);
      }
    }
    setVideoLoaded(false);
  }, [items]);

  // 处理图片 URL，使用代理绕过防盗链
  const getProxiedImageUrl = (url: string) => {
    if (url?.includes('douban') || url?.includes('doubanio')) {
      return `/api/image-proxy?url=${encodeURIComponent(url)}`;
    }
    return url;
  };

  // 确保 backdrop 是高清版本
  const getHDBackdrop = (url?: string) => {
    if (!url) return url;
    return url
      .replace('/view/photo/s/', '/view/photo/l/')
      .replace('/view/photo/m/', '/view/photo/l/')
      .replace('/view/photo/sqxs/', '/view/photo/l/')
      .replace('/s_ratio_poster/', '/l_ratio_poster/')
      .replace('/m_ratio_poster/', '/l_ratio_poster/');
  };

  // 处理视频 URL，使用代理绕过防盗链
  const getProxiedVideoUrl = (url: string) => {
    if (url?.includes('douban') || url?.includes('doubanio')) {
      return `/api/video-proxy?url=${encodeURIComponent(url)}`;
    }
    return url;
  };

  // 🚀 TanStack Query - 刷新过期的trailer URL
  // 替换手动 useCallback + setState + localStorage
  const refreshTrailerUrl = useCallback(async (doubanId: number | string) => {
    const result = await refreshTrailerMutation.mutateAsync({ doubanId });
    return result;
  }, [refreshTrailerMutation]);

  // 获取当前有效的trailer URL（优先使用刷新后的）
  const getEffectiveTrailerUrl = (item: BannerItem) => {
    if (item.douban_id && refreshedTrailerUrls[item.douban_id]) {
      return refreshedTrailerUrls[item.douban_id];
    }
    return item.trailerUrl;
  };

  // 导航函数
  const handleNext = useCallback(() => {
    if (isTransitioning || !isMountedRef.current) return;
    setIsTransitioning(true);
    setVideoLoaded(false); // 重置视频加载状态
    setCurrentIndex((prev) => (prev + 1) % items.length);

    // 清除之前的timeout
    if (transitionTimeoutRef.current) {
      clearTimeout(transitionTimeoutRef.current);
    }

    // 设置新的timeout
    transitionTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        setIsTransitioning(false);
      }
    }, 800); // Netflix风格：更慢的过渡
  }, [isTransitioning, items.length]);

  const handlePrev = useCallback(() => {
    if (isTransitioning || !isMountedRef.current) return;
    setIsTransitioning(true);
    setVideoLoaded(false); // 重置视频加载状态
    setCurrentIndex((prev) => (prev - 1 + items.length) % items.length);

    // 清除之前的timeout
    if (transitionTimeoutRef.current) {
      clearTimeout(transitionTimeoutRef.current);
    }

    // 设置新的timeout
    transitionTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        setIsTransitioning(false);
      }
    }, 800);
  }, [isTransitioning, items.length]);

  const handleIndicatorClick = (index: number) => {
    if (isTransitioning || index === currentIndex || !isMountedRef.current) return;
    setIsTransitioning(true);
    setVideoLoaded(false); // 重置视频加载状态
    setCurrentIndex(index);

    // 清除之前的timeout
    if (transitionTimeoutRef.current) {
      clearTimeout(transitionTimeoutRef.current);
    }

    // 设置新的timeout
    transitionTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        setIsTransitioning(false);
      }
    }, 800);
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  // 使用自动轮播 Hook
  useAutoplay({
    currentIndex,
    isHovered,
    autoPlayInterval,
    itemsLength: items.length,
    onNext: handleNext,
  });

  // 使用滑动手势 Hook
  const swipeHandlers = useSwipeGesture({
    onSwipeLeft: handleNext,
    onSwipeRight: handlePrev,
  });

  // 预加载背景图片（只预加载当前和相邻的图片，优化性能）
  useEffect(() => {
    // 预加载当前、前一张、后一张
    const indicesToPreload = [
      currentIndex,
      (currentIndex - 1 + items.length) % items.length,
      (currentIndex + 1) % items.length,
    ];

    indicesToPreload.forEach((index) => {
      const item = items[index];
      if (item) {
        const img = new window.Image();
        const imageUrl = getHDBackdrop(item.backdrop) || item.poster;
        img.src = getProxiedImageUrl(imageUrl);
      }
    });
  }, [items, currentIndex]);

  if (!items || items.length === 0) {
    return null;
  }

  // 确保 currentIndex 在有效范围内
  const safeIndex = Math.min(currentIndex, items.length - 1);
  const currentItem = items[safeIndex];

  // 防御性检查：如果 currentItem 仍然是 undefined，返回 null
  if (!currentItem) {
    console.error('[HeroBanner] currentItem is undefined, items:', items, 'currentIndex:', currentIndex);
    return null;
  }

  const backgroundImage = getHDBackdrop(currentItem.backdrop) || currentItem.poster;

  // 🔍 调试日志
  console.log('[HeroBanner] 当前项目:', {
    title: currentItem.title,
    hasBackdrop: !!currentItem.backdrop,
    hasTrailer: !!currentItem.trailerUrl,
    trailerUrl: currentItem.trailerUrl,
    enableVideo,
  });

  // 🎯 检查并刷新缺失的 trailer URL（仅当前显示的item）
  useEffect(() => {
    // 如果禁用了视频，不需要刷新 trailer
    if (!enableVideo || items.length === 0) {
      return;
    }

    const currentItem = items[currentIndex];
    if (!currentItem) return;

    // 只处理当前显示的item，避免批量请求导致崩溃
    const checkCurrentItemTrailer = async () => {
      // 检查组件是否仍然挂载
      if (!isMountedRef.current) return;

      // 如果有 douban_id 但没有 trailerUrl，尝试获取
      if (currentItem.douban_id && !currentItem.trailerUrl && !refreshedTrailerUrls[currentItem.douban_id]) {
        console.log('[HeroBanner] 当前item缺失trailer，尝试获取:', currentItem.title);
        try {
          await refreshTrailerUrl(currentItem.douban_id);
        } catch (error) {
          // 静默处理错误
          console.warn('[HeroBanner] 获取当前item的trailer失败:', error);
        }
      }
    };

    // 延迟执行，避免阻塞渲染
    const timer = setTimeout(() => {
      if (isMountedRef.current) {
        checkCurrentItemTrailer();
      }
    }, 1500);

    return () => {
      clearTimeout(timer);
    };
  }, [currentIndex, items, refreshedTrailerUrls, refreshTrailerUrl, enableVideo]);

  // 🔥 修复第一个视频不自动播放的问题
  // 当 trailer URL 准备好时，确保 video 元素正确加载和播放
  useEffect(() => {
    if (!enableVideo || !videoRef.current || !isMountedRef.current) return;

    const currentItem = items[currentIndex];
    if (!currentItem) return;

    const trailerUrl = getEffectiveTrailerUrl(currentItem);
    if (!trailerUrl) {
      console.log('[HeroBanner] 当前item没有trailer URL:', currentItem.title);
      return;
    }

    const video = videoRef.current;

    // 检查 video 的 src 是否已经设置
    const currentSrc = video.querySelector('source')?.src;
    const expectedSrc = getProxiedVideoUrl(trailerUrl);

    console.log('[HeroBanner] 检查视频状态:', {
      title: currentItem.title,
      currentIndex,
      hasSrc: !!currentSrc,
      srcMatch: currentSrc === expectedSrc,
      paused: video.paused,
      readyState: video.readyState,
    });

    // 如果 src 已经正确设置，但视频还没开始播放，尝试播放
    if (currentSrc === expectedSrc && video.paused) {
      console.log('[HeroBanner] Trailer URL 已准备好，尝试播放视频:', currentItem.title);

      // 确保视频已加载足够的数据
      if (video.readyState >= 2) { // HAVE_CURRENT_DATA or higher
        console.log('[HeroBanner] 视频数据已准备好 (readyState >= 2)，立即播放');
        video.play().catch((error) => {
          console.warn('[HeroBanner] 视频播放失败:', error);
        });
      } else {
        // 如果数据还没准备好，等待 loadeddata 事件
        console.log('[HeroBanner] 视频数据未准备好，等待 loadeddata 事件');
        const handleLoadedData = () => {
          console.log('[HeroBanner] loadeddata 事件触发，尝试播放');
          if (isMountedRef.current && video.paused) {
            video.play().catch((error) => {
              console.warn('[HeroBanner] 视频播放失败 (loadeddata):', error);
            });
          }
        };
        video.addEventListener('loadeddata', handleLoadedData, { once: true });

        // 清理函数
        return () => {
          video.removeEventListener('loadeddata', handleLoadedData);
        };
      }
    }
  }, [currentIndex, items, refreshedTrailerUrls, enableVideo, getEffectiveTrailerUrl]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      // 清理所有pending的timeouts
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
      }
      // 清理重试计数
      videoErrorRetryCount.current = {};
    };
  }, []);

  return (
    <div
      className="relative w-full h-[50vh] sm:h-[55vh] md:h-[60vh] overflow-hidden group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      {...swipeHandlers}
    >
      {/* 背景图片/视频层 */}
      <div className="absolute inset-0">
        {/* 只渲染当前、前一张、后一张（性能优化） */}
        {items.map((item, index) => {
          // 计算是否应该渲染此项
          const prevIndex = (currentIndex - 1 + items.length) % items.length;
          const nextIndex = (currentIndex + 1) % items.length;
          const shouldRender = index === currentIndex || index === prevIndex || index === nextIndex;

          if (!shouldRender) return null;

          return (
            <div
              key={item.id}
              className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
                index === currentIndex ? 'opacity-100' : 'opacity-0'
              }`}
            >
              {/* 背景图片（始终显示，作为视频的占位符） */}
              <Image
                src={getProxiedImageUrl(getHDBackdrop(item.backdrop) || item.poster)}
                alt={item.title}
                fill
                className="object-cover object-center"
                priority={index === 0}
                quality={100}
                sizes="100vw"
                unoptimized={item.backdrop?.includes('/l/') || item.backdrop?.includes('/l_ratio_poster/') || false}
              />

              {/* 视频背景（如果启用且有预告片URL，加载完成后淡入） */}
              {enableVideo && getEffectiveTrailerUrl(item) && index === currentIndex && index === safeIndex && (
                <video
                  ref={videoRef}
                  className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${
                    videoLoaded ? 'opacity-100' : 'opacity-0'
                  }`}
                  autoPlay
                  muted={isMuted}
                  loop
                  playsInline
                  preload="metadata"
                  onError={async (e) => {
                    if (!isMountedRef.current) return;

                    const video = e.currentTarget;
                    const itemKey = `${item.douban_id || item.id}`;

                    console.error('[HeroBanner] 视频加载失败:', {
                      title: item.title,
                      trailerUrl: item.trailerUrl,
                      error: e,
                    });

                    // 防止无限重试：每个视频最多重试1次
                    const retryCount = videoErrorRetryCount.current[itemKey] || 0;
                    if (retryCount >= 1) {
                      console.warn('[HeroBanner] 视频已重试过，不再尝试，显示背景图片');
                      return;
                    }

                    // 检测是否是403错误（trailer URL过期）
                    if (item.douban_id && isMountedRef.current) {
                      try {
                        // 记录重试次数
                        videoErrorRetryCount.current[itemKey] = retryCount + 1;

                        // 如果缓存中有URL，说明之前刷新过，但现在又失败了
                        // 需要清除缓存中的旧URL，重新刷新
                        if (refreshedTrailerUrls[item.douban_id]) {
                          clearTrailerMutation.mutate({ doubanId: item.douban_id });
                        }

                        // 重新刷新URL
                        const newUrl = await refreshTrailerUrl(item.douban_id);
                        // 再次检查组件是否仍然挂载，避免在卸载后操作 video 元素
                        if (newUrl && isMountedRef.current && video && !video.error) {
                          // 重新加载视频
                          video.load();
                        }
                      } catch (error) {
                        // 静默处理错误，避免页面崩溃
                        if (isMountedRef.current) {
                          console.warn('[HeroBanner] 刷新trailer URL失败，将继续显示背景图片:', error);
                        }
                      }
                    }
                  }}
                  onLoadedData={(e) => {
                    if (!isMountedRef.current) return;

                    console.log('[HeroBanner] 视频加载成功:', item.title);
                    if (isMountedRef.current) {
                      setVideoLoaded(true); // 视频加载完成，淡入显示
                    }
                    // 确保视频开始播放
                    const video = e.currentTarget;
                    video.play().catch((error) => {
                      if (isMountedRef.current) {
                        console.error('[HeroBanner] 视频自动播放失败:', error);
                      }
                    });
                  }}
                >
                  <source src={getProxiedVideoUrl(getEffectiveTrailerUrl(item) || '')} type="video/mp4" />
                </video>
              )}
            </div>
          );
        })}

        {/* Netflix经典渐变遮罩：底部黑→中间透明→顶部黑 */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/80" />

        {/* 左侧额外渐变（增强文字可读性） */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-transparent" />
      </div>

      {/* 内容叠加层 - Netflix风格：左下角 */}
      <div className="absolute bottom-0 left-0 right-0 px-4 sm:px-8 md:px-12 lg:px-16 xl:px-20 pb-12 sm:pb-16 md:pb-20 lg:pb-24">
        <div className="space-y-3 sm:space-y-4 md:space-y-5 lg:space-y-6">
          {/* 标题 - Netflix风格：超大字体 */}
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold text-white drop-shadow-2xl leading-tight break-words">
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

      {/* 音量控制按钮（仅视频模式） - 底部右下角，避免遮挡简介 */}
      {enableVideo && currentItem && getEffectiveTrailerUrl(currentItem) && (
        <button
          onClick={toggleMute}
          className="absolute bottom-6 sm:bottom-8 right-4 sm:right-8 md:right-12 lg:right-16 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-black/50 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/70 transition-all border border-white/50 z-10"
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

export default memo(HeroBanner);
