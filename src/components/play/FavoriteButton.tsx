/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { memo } from 'react';
import { Heart } from 'lucide-react';

interface FavoriteButtonProps {
  favorited: boolean;
  onToggle: () => void;
}

/**
 * 收藏按钮组件 - 独立拆分以优化性能
 * 使用 React.memo 防止不必要的重新渲染
 */
const FavoriteButton = memo(function FavoriteButton({
  favorited,
  onToggle,
}: FavoriteButtonProps) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className='group relative shrink-0 transition-all duration-300 hover:scale-110'
      title={favorited ? '取消收藏' : '添加收藏'}
    >
      <div className='absolute inset-0 bg-linear-to-r from-red-400 to-pink-400 rounded-full opacity-0 group-hover:opacity-20 blur-lg transition-opacity duration-300'></div>
      <FavoriteIcon filled={favorited} />
    </button>
  );
});

/**
 * 收藏图标组件
 */
const FavoriteIcon = ({ filled }: { filled: boolean }) => {
  if (filled) {
    return (
      <Heart className='h-7 w-7 fill-red-500 stroke-red-500 stroke-[1.5] drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]' />
    );
  }
  return (
    <Heart className='h-7 w-7 stroke-[1] text-gray-600 dark:text-gray-300' />
  );
};

export default FavoriteButton;
