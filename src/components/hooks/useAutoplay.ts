import { useEffect } from 'react';

interface UseAutoplayOptions {
  currentIndex: number;
  isHovered: boolean;
  autoPlayInterval: number | undefined;
  itemsLength: number;
  onNext: () => void;
}

/**
 * 自动轮播 Hook（Netflix 风格）
 *
 * @param currentIndex - 当前索引
 * @param isHovered - 是否鼠标悬停
 * @param autoPlayInterval - 自动播放间隔（毫秒）
 * @param itemsLength - 项目总数
 * @param onNext - 切换到下一项的回调函数
 */
export function useAutoplay({
  currentIndex,
  isHovered,
  autoPlayInterval,
  itemsLength,
  onNext,
}: UseAutoplayOptions) {
  useEffect(() => {
    if (!autoPlayInterval || isHovered || itemsLength <= 1) return;

    const interval = setInterval(() => {
      onNext();
    }, autoPlayInterval);

    return () => clearInterval(interval);
  }, [currentIndex, isHovered, autoPlayInterval, itemsLength, onNext]);
}
