'use client';

import { useState } from 'react';
import Image from 'next/image';

interface BilibiliVideo {
  type: 'video' | 'bangumi';
  bvid?: string;
  aid?: number;
  season_id?: number;
  media_id?: number;
  title: string;
  pic?: string;
  cover?: string;
  author?: string;
  duration?: string;
  play?: number;
  danmaku?: number;
  favorites?: number;
  review?: number;
  pubdate?: number;
  description?: string;
  media_score?: { score: number };
  badges?: any[];
}

interface BilibiliVideoCardProps {
  video: BilibiliVideo;
}

const BilibiliVideoCard = ({ video }: BilibiliVideoCardProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [imageError, setImageError] = useState(false);

  const handleEmbedPlay = () => {
    setIsPlaying(true);
  };

  const handleOpenInNewTab = () => {
    let url = '';
    if (video.type === 'video' && video.bvid) {
      url = `https://www.bilibili.com/video/${video.bvid}`;
    } else if (video.type === 'bangumi' && video.season_id) {
      url = `https://www.bilibili.com/bangumi/play/ss${video.season_id}`;
    }
    if (url) {
      window.open(url, '_blank');
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 10000) {
      return `${(num / 10000).toFixed(1)}万`;
    }
    return num.toString();
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const truncateTitle = (title: string, maxLength = 50) => {
    return title.length > maxLength ? title.substring(0, maxLength) + '...' : title;
  };

  const coverUrl = video.pic || video.cover || '';
  const proxiedCoverUrl = coverUrl ? `/api/image-proxy?url=${encodeURIComponent(coverUrl)}` : '';
  const isBangumi = video.type === 'bangumi';
  const hasBadge = isBangumi && video.badges && video.badges.length > 0;

  // 生成 embed URL
  const getEmbedUrl = () => {
    if (video.type === 'video' && video.bvid) {
      return `https://player.bilibili.com/player.html?bvid=${video.bvid}&autoplay=1`;
    } else if (video.type === 'bangumi' && video.season_id) {
      return `https://player.bilibili.com/player.html?season_id=${video.season_id}&autoplay=1`;
    }
    return '';
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-lg transition-shadow duration-300 overflow-hidden">
      {/* 视频缩略图区域 */}
      <div className="relative aspect-video bg-gray-200 dark:bg-gray-700">
        {isPlaying ? (
          <div className="w-full h-full">
            <iframe
              src={getEmbedUrl()}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              title={video.title}
            />
            {/* 关闭播放按钮 */}
            <button
              onClick={() => setIsPlaying(false)}
              className="absolute top-2 right-2 bg-black/75 text-white p-2 rounded-full hover:bg-black/90 transition-opacity z-10"
              aria-label="关闭播放"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : (
          <>
            {!imageError && proxiedCoverUrl ? (
              <Image
                src={proxiedCoverUrl}
                alt={video.title}
                fill
                className="object-cover"
                onError={() => setImageError(true)}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gray-300 dark:bg-gray-600">
                <svg className="w-12 h-12 text-gray-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773s-2.262 1.524-3.773 1.56H5.333c-1.51-.036-2.769-.556-3.773-1.56S.036 18.858 0 17.347v-7.36c.036-1.511.556-2.765 1.56-3.76 1.004-.996 2.262-1.52 3.773-1.574h.774l-1.174-1.12a1.234 1.234 0 0 1-.373-.906c0-.356.124-.658.373-.907l.027-.027c.267-.249.573-.373.92-.373.347 0 .653.124.92.373L9.653 4.44c.071.071.134.142.187.213h4.267a.836.836 0 0 1 .16-.213l2.853-2.747c.267-.249.573-.373.92-.373.347 0 .662.151.929.4.267.249.391.551.391.907 0 .355-.124.657-.373.906zM5.333 7.24c-.746.018-1.373.276-1.88.773-.506.498-.769 1.13-.786 1.894v7.52c.017.764.28 1.395.786 1.893.507.498 1.134.756 1.88.773h13.334c.746-.017 1.373-.275 1.88-.773.506-.498.769-1.129.786-1.893v-7.52c-.017-.765-.28-1.396-.786-1.894-.507-.497-1.134-.755-1.88-.773zM8 11.107c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c.017-.391.15-.711.4-.96.249-.249.56-.373.933-.373zm8 0c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c.017-.391.15-.711.4-.96.249-.249.56-.373.933-.373z"/>
                </svg>
              </div>
            )}

            {/* 播放按钮覆盖层 */}
            <div className="absolute inset-0 bg-black/0 hover:bg-black/30 transition-all duration-300 flex items-center justify-center group">
              <button
                onClick={handleEmbedPlay}
                className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-pink-600 hover:bg-pink-700 text-white rounded-full p-4 transform hover:scale-110 transition-transform"
                aria-label="播放视频"
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              </button>
            </div>

            {/* B站标识 */}
            <div className="absolute bottom-2 right-2 bg-pink-600 text-white text-xs px-2 py-1 rounded flex items-center">
              <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773s-2.262 1.524-3.773 1.56H5.333c-1.51-.036-2.769-.556-3.773-1.56S.036 18.858 0 17.347v-7.36c.036-1.511.556-2.765 1.56-3.76 1.004-.996 2.262-1.52 3.773-1.574h.774l-1.174-1.12a1.234 1.234 0 0 1-.373-.906c0-.356.124-.658.373-.907l.027-.027c.267-.249.573-.373.92-.373.347 0 .653.124.92.373L9.653 4.44c.071.071.134.142.187.213h4.267a.836.836 0 0 1 .16-.213l2.853-2.747c.267-.249.573-.373.92-.373.347 0 .662.151.929.4.267.249.391.551.391.907 0 .355-.124.657-.373.906zM5.333 7.24c-.746.018-1.373.276-1.88.773-.506.498-.769 1.13-.786 1.894v7.52c.017.764.28 1.395.786 1.893.507.498 1.134.756 1.88.773h13.334c.746-.017 1.373-.275 1.88-.773.506-.498.769-1.129.786-1.893v-7.52c-.017-.765-.28-1.396-.786-1.894-.507-.497-1.134-.755-1.88-.773zM8 11.107c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c.017-.391.15-.711.4-.96.249-.249.56-.373.933-.373zm8 0c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c.017-.391.15-.711.4-.96.249-.249.56-.373.933-.373z"/>
              </svg>
              Bilibili
            </div>

            {/* 时长标签（仅视频） */}
            {!isBangumi && video.duration && (
              <div className="absolute bottom-2 left-2 bg-black/75 text-white text-xs px-2 py-1 rounded">
                {video.duration}
              </div>
            )}

            {/* 会员标识（番剧） */}
            {hasBadge && (
              <div className="absolute top-2 left-2 bg-pink-600 text-white text-xs px-2 py-1 rounded">
                {video.badges![0].text}
              </div>
            )}
          </>
        )}
      </div>

      {/* 视频信息区域 */}
      <div className="p-4">
        <h3 className="font-semibold text-gray-900 dark:text-white text-sm mb-2 line-clamp-2">
          {truncateTitle(video.title)}
        </h3>

        {/* 作者/评分信息 */}
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-3">
          {!isBangumi ? (
            <>
              <span className="truncate">{video.author}</span>
              {video.pubdate && <span>{formatDate(video.pubdate)}</span>}
            </>
          ) : (
            <>
              <span>{video.type === 'bangumi' ? '番剧' : '影视'}</span>
              {video.media_score && (
                <span className="text-yellow-500">⭐ {video.media_score.score}</span>
              )}
            </>
          )}
        </div>

        {/* 播放数据（仅视频） */}
        {!isBangumi && (video.play > 0 || video.favorites > 0 || video.review > 0) && (
          <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400 mb-3">
            {video.play > 0 && (
              <span className="flex items-center">
                <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
                {formatNumber(video.play)}
              </span>
            )}
            {video.favorites > 0 && (
              <span className="flex items-center">
                <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>
                </svg>
                {formatNumber(video.favorites)}
              </span>
            )}
            {video.review > 0 && (
              <span className="flex items-center">
                <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4V4c0-1.1-.9-2-2-2zm0 15.17L18.83 16H4V4h16v13.17z"/>
                </svg>
                {formatNumber(video.review)}
              </span>
            )}
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex space-x-2">
          <button
            onClick={handleEmbedPlay}
            className="flex-1 bg-pink-600 hover:bg-pink-700 text-white text-xs py-2 px-3 rounded transition-colors flex items-center justify-center"
          >
            <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>
            嵌入播放
          </button>
          <button
            onClick={handleOpenInNewTab}
            className="flex-1 bg-gray-600 hover:bg-gray-700 text-white text-xs py-2 px-3 rounded transition-colors flex items-center justify-center"
          >
            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            新窗口
          </button>
        </div>

        {/* 播放提示 */}
        {isBangumi && hasBadge && (
          <div className="mt-2 text-xs text-yellow-600 dark:text-yellow-400">
            ⚠️ 此内容可能需要大会员
          </div>
        )}
      </div>
    </div>
  );
};

export default BilibiliVideoCard;
