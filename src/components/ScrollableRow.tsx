import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Children, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import AnimatedCardGrid from '@/components/AnimatedCardGrid';

interface ScrollableRowProps {
  children: React.ReactNode;
  scrollDistance?: number;
  enableAnimation?: boolean;
}

function ScrollableRow({
  children,
  scrollDistance = 1000,
  enableAnimation = true,
}: ScrollableRowProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showLeftScroll, setShowLeftScroll] = useState(false);
  const [showRightScroll, setShowRightScroll] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const checkScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkScroll = useCallback(() => {
    if (containerRef.current) {
      const { scrollWidth, clientWidth, scrollLeft } = containerRef.current;

      // 计算是否需要左右滚动按钮
      const threshold = 1; // 容差值，避免浮点误差
      const canScrollRight =
        scrollWidth - (scrollLeft + clientWidth) > threshold;
      const canScrollLeft = scrollLeft > threshold;

      setShowRightScroll((prev) => (prev !== canScrollRight ? canScrollRight : prev));
      setShowLeftScroll((prev) => (prev !== canScrollLeft ? canScrollLeft : prev));
    }
  }, []);

  // 使用 useMemo 缓存 children 数量，减少不必要的 effect 触发
  const childrenCount = useMemo(() => Children.count(children), [children]);

  useEffect(() => {
    // 延迟检查，确保内容已完全渲染
    if (checkScrollTimeoutRef.current) {
      clearTimeout(checkScrollTimeoutRef.current);
      checkScrollTimeoutRef.current = null;
    }
    checkScrollTimeoutRef.current = setTimeout(() => {
      checkScroll();
    }, 100);

    // 监听窗口大小变化（使用防抖）
    let resizeTimeout: ReturnType<typeof setTimeout> | undefined;
    const handleResize = () => {
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      resizeTimeout = setTimeout(checkScroll, 150);
    };

    window.addEventListener('resize', handleResize);

    // 创建一个 ResizeObserver 来监听容器大小变化
    const resizeObserver = new ResizeObserver(() => {
      // 使用防抖来减少不必要的检查
      if (checkScrollTimeoutRef.current) {
        clearTimeout(checkScrollTimeoutRef.current);
        checkScrollTimeoutRef.current = null;
      }
      checkScrollTimeoutRef.current = setTimeout(checkScroll, 100);
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      if (checkScrollTimeoutRef.current) {
        clearTimeout(checkScrollTimeoutRef.current);
      }
    };
  }, [childrenCount, checkScroll]);

  const handleScrollRightClick = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.scrollBy({
        left: scrollDistance,
        behavior: 'smooth',
      });
    }
  }, [scrollDistance]);

  const handleScrollLeftClick = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.scrollBy({
        left: -scrollDistance,
        behavior: 'smooth',
      });
    }
  }, [scrollDistance]);

  return (
    <div
      className='relative'
      onMouseEnter={() => {
        setIsHovered(true);
        // 当鼠标进入时重新检查一次
        checkScroll();
      }}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        ref={containerRef}
        className='flex space-x-6 overflow-x-auto scrollbar-hide py-1 sm:py-2 pb-12 sm:pb-14 px-4 sm:px-6'
        onScroll={checkScroll}
      >
        {enableAnimation ? (
          <AnimatedCardGrid className="flex space-x-6">
            {children}
          </AnimatedCardGrid>
        ) : (
          children
        )}
      </div>
      {showLeftScroll && (
        <div
          className={`hidden sm:flex absolute left-0 top-0 bottom-0 w-16 items-center justify-center z-[600] transition-opacity duration-200 ${
            isHovered ? 'opacity-100' : 'opacity-0'
          }`}
          style={{
            background: 'transparent',
            pointerEvents: 'none', // 允许点击穿透
          }}
        >
          <div
            className='absolute inset-0 flex items-center justify-center'
            style={{
              top: '40%',
              bottom: '60%',
              left: '-4.5rem',
              pointerEvents: 'auto',
            }}
          >
            <button
              onClick={handleScrollLeftClick}
              className='w-12 h-12 bg-white/95 rounded-full shadow-lg flex items-center justify-center hover:bg-white border border-gray-200 transition-transform hover:scale-105 dark:bg-gray-800/90 dark:hover:bg-gray-700 dark:border-gray-600'
            >
              <ChevronLeft className='w-6 h-6 text-gray-600 dark:text-gray-300' />
            </button>
          </div>
        </div>
      )}

      {showRightScroll && (
        <div
          className={`hidden sm:flex absolute right-0 top-0 bottom-0 w-16 items-center justify-center z-[600] transition-opacity duration-200 ${
            isHovered ? 'opacity-100' : 'opacity-0'
          }`}
          style={{
            background: 'transparent',
            pointerEvents: 'none', // 允许点击穿透
          }}
        >
          <div
            className='absolute inset-0 flex items-center justify-center'
            style={{
              top: '40%',
              bottom: '60%',
              right: '-4.5rem',
              pointerEvents: 'auto',
            }}
          >
            <button
              onClick={handleScrollRightClick}
              className='w-12 h-12 bg-white/95 rounded-full shadow-lg flex items-center justify-center hover:bg-white border border-gray-200 transition-transform hover:scale-105 dark:bg-gray-800/90 dark:hover:bg-gray-700 dark:border-gray-600'
            >
              <ChevronRight className='w-6 h-6 text-gray-600 dark:text-gray-300' />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(ScrollableRow);
