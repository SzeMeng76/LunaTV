'use client';

import Image from 'next/image';
import { Play } from 'lucide-react';
import { processImageUrl } from '@/lib/utils';

interface MiniVideoCardProps {
  title: string;
  year?: string;
  episode?: number;
  poster?: string;
  totalEpisodes?: number;  // 总集数（用于判断是否显示集数信息）
  onClick?: () => void;
}

export default function MiniVideoCard({
  title,
  year,
  episode,
  poster,
  totalEpisodes,
  onClick
}: MiniVideoCardProps) {
  // 默认海报
  const defaultPoster = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjQ1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjQ1MCIgZmlsbD0iIzM3NDE1MSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LXNpemU9IjE4IiBmaWxsPSIjOWNhM2FmIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIj7ml6Dlm77niYc8L3RleHQ+PC9zdmc+';

  const displayPoster = poster ? processImageUrl(poster) : defaultPoster;

  return (
    <div
      onClick={onClick}
      className="flex gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
    >
      {/* 海报缩略图 */}
      <div className="relative w-16 h-24 shrink-0 rounded overflow-hidden bg-gray-200 dark:bg-gray-700">
        <Image
          src={displayPoster}
          alt={title}
          fill
          sizes="64px"
          className="object-cover"
          referrerPolicy="no-referrer"
        />
        {/* 播放图标 */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <Play className="w-6 h-6 text-white" />
        </div>
      </div>

      {/* 信息 */}
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
          {title || '未知视频'}
        </h4>
        <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
          {year && <span>{year}</span>}
          {/* 只有总集数大于1时才显示集数（避免电影显示"第1集"） */}
          {totalEpisodes && totalEpisodes > 1 && episode !== undefined && episode !== null && (
            <>
              {year && <span>·</span>}
              <span>第 {episode + 1} 集</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
