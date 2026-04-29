'use client';

import { useState } from 'react';
import Image from 'next/image';

interface BilibiliUpuser {
  type: 'upuser';
  mid: number;
  uname: string;
  usign: string;
  fans: number;
  videos: number;
  upic: string;
  level: number;
  gender: number;
  is_upuser: number;
  is_live: number;
  room_id: number;
  official_verify?: {
    type: number;
    desc: string;
  };
  res: Array<{
    aid: number;
    bvid: string;
    title: string;
    pic: string;
    play: string;
    duration: string;
    pubdate: number;
  }>;
}

interface BilibiliUpuserCardProps {
  upuser: BilibiliUpuser;
}

const BilibiliUpuserCard = ({ upuser }: BilibiliUpuserCardProps) => {
  const [imageError, setImageError] = useState(false);
  const [playingVideo, setPlayingVideo] = useState<string | null>(null); // 正在播放的视频 bvid

  const handleOpenProfile = () => {
    window.open(`https://space.bilibili.com/${upuser.mid}`, '_blank');
  };

  const handleOpenVideo = (bvid: string) => {
    window.open(`https://www.bilibili.com/video/${bvid}`, '_blank');
  };

  const handlePlayVideo = (bvid: string, e: React.MouseEvent) => {
    e.stopPropagation(); // 阻止事件冒泡
    setPlayingVideo(bvid);
  };

  const handleClosePlayer = () => {
    setPlayingVideo(null);
  };

  const formatNumber = (num: number | string) => {
    const n = typeof num === 'string' ? parseInt(num) : num;
    if (n >= 10000) {
      return `${(n / 10000).toFixed(1)}万`;
    }
    return n.toString();
  };

  const proxiedUpic = upuser.upic ? `/api/image-proxy?url=${encodeURIComponent(upuser.upic)}` : '';
  const isVerified = upuser.official_verify && upuser.official_verify.type !== -1;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-lg transition-shadow duration-300 overflow-hidden">
      {/* UP主信息区域 */}
      <div className="p-4">
        <div className="flex items-start space-x-3 mb-3">
          {/* 头像 */}
          <div className="relative flex-shrink-0">
            {!imageError && proxiedUpic ? (
              <Image
                src={proxiedUpic}
                alt={upuser.uname}
                width={64}
                height={64}
                className="rounded-full"
                onError={() => setImageError(true)}
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
                <svg className="w-8 h-8 text-gray-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                </svg>
              </div>
            )}
            {upuser.is_live === 1 && (
              <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded">
                直播中
              </div>
            )}
          </div>

          {/* UP主信息 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2 mb-1">
              <h3 className="font-semibold text-gray-900 dark:text-white text-base truncate">
                {upuser.uname}
              </h3>
              {isVerified && (
                <span className="flex-shrink-0 text-xs bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 px-2 py-0.5 rounded">
                  {upuser.official_verify!.type === 0 ? '个人认证' : '机构认证'}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-2">
              {upuser.usign || '这个UP主很懒，什么都没有留下'}
            </p>
            <div className="flex items-center space-x-4 text-xs text-gray-500 dark:text-gray-400">
              <span>粉丝 {formatNumber(upuser.fans)}</span>
              <span>视频 {upuser.videos}</span>
              <span>Lv{upuser.level}</span>
            </div>
          </div>
        </div>

        {/* 代表作视频 */}
        {upuser.res && upuser.res.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">代表作：</div>
            <div className="space-y-2">
              {upuser.res.slice(0, 3).map((video) => {
                const proxiedPic = video.pic ? `/api/image-proxy?url=${encodeURIComponent(video.pic)}` : '';
                const isPlaying = playingVideo === video.bvid;

                return (
                  <div key={video.bvid} className="relative">
                    {isPlaying ? (
                      // 播放器
                      <div className="relative w-full aspect-video bg-black rounded overflow-hidden">
                        <iframe
                          src={`https://player.bilibili.com/player.html?bvid=${video.bvid}&autoplay=1`}
                          className="w-full h-full"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                          allowFullScreen
                          title={video.title}
                        />
                        <button
                          onClick={handleClosePlayer}
                          className="absolute top-2 right-2 bg-black/75 text-white p-1.5 rounded-full hover:bg-black/90 transition-opacity z-10"
                          aria-label="关闭播放"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      // 视频缩略图
                      <div className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 rounded p-1 transition-colors group">
                        <div
                          className="relative w-20 h-12 flex-shrink-0 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden"
                          onClick={(e) => handlePlayVideo(video.bvid, e)}
                        >
                          {proxiedPic && (
                            <Image
                              src={proxiedPic}
                              alt={video.title}
                              fill
                              className="object-cover"
                            />
                          )}
                          {/* 播放按钮覆盖层 */}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-300 flex items-center justify-center">
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-pink-600 hover:bg-pink-700 text-white rounded-full p-1">
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z"/>
                              </svg>
                            </div>
                          </div>
                          <div className="absolute bottom-0 right-0 bg-black/75 text-white text-xs px-1">
                            {video.duration}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0" onClick={() => handleOpenVideo(video.bvid)}>
                          <p className="text-xs text-gray-900 dark:text-gray-100 line-clamp-2">
                            {video.title}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {formatNumber(video.play)} 播放
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 操作按钮 */}
        <div className="mt-3">
          <button
            onClick={handleOpenProfile}
            className="w-full bg-pink-600 hover:bg-pink-700 text-white text-sm py-2 px-3 rounded transition-colors flex items-center justify-center"
          >
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            查看主页
          </button>
        </div>
      </div>
    </div>
  );
};

export default BilibiliUpuserCard;
