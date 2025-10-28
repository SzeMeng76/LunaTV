/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import { Play, Star } from 'lucide-react';
import Link from 'next/link';
import { memo, useEffect, useState } from 'react';

import { ShortDramaItem } from '@/lib/types';
import {
  SHORTDRAMA_CACHE_EXPIRE,
  getCacheKey,
  getCache,
  setCache,
} from '@/lib/shortdrama-cache';

interface ShortDramaCardProps {
  drama: ShortDramaItem;
  showDescription?: boolean;
  className?: string;
}

function ShortDramaCard({
  drama,
  showDescription = false,
  className = '',
}: ShortDramaCardProps) {
  const [realEpisodeCount, setRealEpisodeCount] = useState<number>(drama.episode_count);
  const [imageLoaded, setImageLoaded] = useState(false); // 图片加载状态

  // 获取真实集数（带统一缓存）
  useEffect(() => {
    const fetchEpisodeCount = async () => {
      const cacheKey = getCacheKey('episodes', { id: drama.id });

      // 检查统一缓存
      const cached = await getCache(cacheKey);
      if (cached && typeof cached === 'number' && cached > 0) {
        setRealEpisodeCount(cached);
        return;
      }

      try {
        // 先尝试第1集（episode=0）
        let response = await fetch(`/api/shortdrama/parse?id=${drama.id}&episode=0`);
        let result = null;

        if (response.ok) {
          result = await response.json();
        }

        // 如果第1集失败，尝试第2集（episode=1）
        if (!result || !result.totalEpisodes) {
          response = await fetch(`/api/shortdrama/parse?id=${drama.id}&episode=1`);
          if (response.ok) {
            result = await response.json();
          }
        }

        if (result && result.totalEpisodes > 0) {
          setRealEpisodeCount(result.totalEpisodes);
          // 使用统一缓存系统缓存结果
          await setCache(cacheKey, result.totalEpisodes, SHORTDRAMA_CACHE_EXPIRE.episodes);
        } else {
          // 如果解析失败，缓存失败结果避免重复请求
          await setCache(cacheKey, 1, SHORTDRAMA_CACHE_EXPIRE.episodes / 24); // 1小时后重试
        }
      } catch (error) {
        console.error('获取集数失败:', error);
        // 网络错误时也缓存失败结果
        await setCache(cacheKey, 1, SHORTDRAMA_CACHE_EXPIRE.episodes / 24); // 1小时后重试
      }
    };

    // 只有当前集数为1（默认值）时才尝试获取真实集数
    if (drama.episode_count === 1) {
      fetchEpisodeCount();
    }
  }, [drama.id, drama.episode_count]);

  const formatScore = (score: number) => {
    return score > 0 ? score.toFixed(1) : '--';
  };

  const formatUpdateTime = (updateTime: string) => {
    try {
      const date = new Date(updateTime);
      return date.toLocaleDateString('zh-CN');
    } catch {
      return updateTime;
    }
  };

  return (
    <div className={`group relative ${className} transition-all duration-300 ease-in-out hover:scale-[1.05] hover:z-[500] hover:drop-shadow-2xl`}>
      <Link
        href={`/play?source=shortdrama&id=${drama.id}&title=${encodeURIComponent(drama.name)}`}
        className="block"
      >
        {/* 封面图片 */}
        <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-gray-200 dark:bg-gray-800">
          {/* 渐变光泽动画层 */}
          <div
            className='absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none z-10'
            style={{
              background: 'linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.15) 45%, rgba(255,255,255,0.4) 50%, rgba(255,255,255,0.15) 55%, transparent 70%)',
              backgroundSize: '200% 100%',
              animation: 'card-shimmer 2.5s ease-in-out infinite',
            }}
          />

          <img
            src={drama.cover}
            alt={drama.name}
            className={`h-full w-full object-cover transition-all duration-700 ease-out ${
              imageLoaded ? 'opacity-100 blur-0 scale-100 group-hover:scale-105' : 'opacity-0 blur-md scale-105'
            }`}
            loading="lazy"
            onLoad={() => setImageLoaded(true)}
            onError={(e) => {
              (e.target as HTMLImageElement).src = '/placeholder-cover.jpg';
              setImageLoaded(true);
            }}
          />

          {/* 悬浮播放按钮 - 玻璃态效果 */}
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black/80 via-black/20 to-transparent backdrop-blur-[2px] opacity-0 transition-all duration-300 group-hover:opacity-100">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-black shadow-lg transition-transform group-hover:scale-110">
              <Play className="h-5 w-5 ml-0.5" fill="currentColor" />
            </div>
          </div>

          {/* 集数标识 - 玻璃态美化 */}
          <div className="absolute top-2 left-2 rounded-full bg-gradient-to-br from-purple-500/90 via-pink-500/90 to-rose-500/90 backdrop-blur-md px-3 py-1.5 text-xs font-bold text-white shadow-lg ring-2 ring-white/30 transition-all duration-300 group-hover:scale-110 group-hover:shadow-purple-500/50">
            <span className="flex items-center gap-1">
              <Play size={10} className="fill-current" />
              {realEpisodeCount}集
            </span>
          </div>

          {/* 评分 */}
          {drama.score > 0 && (
            <div className="absolute top-2 right-2 flex items-center rounded bg-yellow-500 px-2 py-1 text-xs text-white">
              <Star className="h-3 w-3 mr-1" fill="currentColor" />
              {formatScore(drama.score)}
            </div>
          )}
        </div>

        {/* 信息区域 */}
        <div className="mt-2 space-y-1.5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white line-clamp-2 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-blue-600 group-hover:to-purple-600 dark:group-hover:from-blue-400 dark:group-hover:to-purple-400 transition-all duration-300">
            {drama.name}
          </h3>

          <div className="flex items-center gap-1.5 text-xs">
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200/50 dark:border-green-700/50">
              <svg className="w-3 h-3 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              <span className="text-green-700 dark:text-green-300 font-medium">{formatUpdateTime(drama.update_time)}</span>
            </div>
          </div>

          {/* 描述信息（可选） */}
          {showDescription && drama.description && (
            <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mt-1">
              {drama.description}
            </p>
          )}
        </div>
      </Link>
    </div>
  );
}

export default memo(ShortDramaCard);