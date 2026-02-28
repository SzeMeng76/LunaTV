/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { GridScrollSeekPlaceholderProps, VirtuosoGrid, VirtuosoGridHandle } from 'react-virtuoso';

import { DoubanItem } from '@/lib/types';
import { useImagePreload } from '@/hooks/useImagePreload';
import VideoCard from '@/components/VideoCard';
import DoubanCardSkeleton from '@/components/DoubanCardSkeleton';

export interface VirtualDoubanGridRef {
  scrollToTop: () => void;
}

interface VirtualDoubanGridProps {
  doubanData: DoubanItem[];
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  type: string;
  loading: boolean;
  primarySelection?: string;
  isBangumi?: boolean;
  aiEnabled?: boolean;
  aiCheckComplete?: boolean;
}

const INITIAL_PRIORITY_COUNT = 30;
const skeletonData = Array.from({ length: 25 }, (_, i) => i);

const INCREASE_VIEWPORT_BY = { top: 300, bottom: 600 };

const SCROLL_SEEK_CONFIG = {
  enter: (velocity: number) => Math.abs(velocity) > 1000,
  exit: (velocity: number) => Math.abs(velocity) < 100,
};

// List 容器：flex wrap，对应原来的 grid class
const ListContainer = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ style, children, ...props }, ref) => (
    <div
      ref={ref}
      {...props}
      style={style}
      className='flex flex-wrap px-0 sm:px-2'
    >
      {children}
    </div>
  ),
);
ListContainer.displayName = 'ListContainer';

// Item 容器：每个卡片的宽度，对应原来的 grid column
const ItemContainer = ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    {...props}
    className='w-1/3 sm:w-[calc(100%/4)] md:w-[calc(100%/5)] lg:w-[calc(100%/6)] xl:w-[calc(100%/7)] 2xl:w-[calc(100%/8)] px-1 sm:px-4 pb-12 sm:pb-20 box-border'
  >
    {children}
  </div>
);

// 快速滚动时的占位符，必须接收 height/width 撑开，否则 grid 会闪烁
const ScrollSeekPlaceholder = ({ height, width }: GridScrollSeekPlaceholderProps) => (
  <div style={{ height, width }} className='bg-gray-200 dark:bg-gray-700 animate-pulse rounded-lg' />
);

export const VirtualDoubanGrid = React.forwardRef<VirtualDoubanGridRef, VirtualDoubanGridProps>(
  (
    {
      doubanData,
      hasMore,
      isLoadingMore,
      onLoadMore,
      type,
      loading,
      primarySelection,
      isBangumi = false,
      aiEnabled = false,
      aiCheckComplete = false,
    },
    ref,
  ) => {
    const virtuosoRef = useRef<VirtuosoGridHandle>(null);
    const [scrollParent, setScrollParent] = useState<HTMLElement | null>(null);

    useEffect(() => {
      setScrollParent(document.body);
    }, []);

    const imagesToPreload = useMemo(() => {
      return doubanData
        .slice(0, Math.min(30, doubanData.length))
        .map((item) => item.poster)
        .filter(Boolean) as string[];
    }, [doubanData]);

    useImagePreload(imagesToPreload, doubanData.length > 0);

    useImperativeHandle(ref, () => ({
      scrollToTop: () => {
        virtuosoRef.current?.scrollToIndex({ index: 0, behavior: 'smooth' });
      },
    }));

    const computeItemKey = useCallback(
      (index: number, item: DoubanItem) => `douban-${item.id ?? index}`,
      [],
    );

    if (loading) {
      return (
        <div className='flex flex-wrap px-0 sm:px-2'>
          {skeletonData.map((i) => (
            <div key={i} className='w-1/3 sm:w-[calc(100%/4)] md:w-[calc(100%/5)] lg:w-[calc(100%/6)] xl:w-[calc(100%/7)] 2xl:w-[calc(100%/8)] px-1 sm:px-4 pb-12 sm:pb-20 box-border'>
              <DoubanCardSkeleton />
            </div>
          ))}
        </div>
      );
    }

    if (doubanData.length === 0) {
      return (
        <div className='flex justify-center py-16'>
          <div className='relative px-12 py-10 rounded-3xl bg-linear-to-br from-gray-50 via-slate-50 to-gray-100 dark:from-gray-800/40 dark:via-slate-800/40 dark:to-gray-800/50 border border-gray-200/50 dark:border-gray-700/50 shadow-xl backdrop-blur-sm overflow-hidden max-w-md'>
            <div className='absolute top-0 left-0 w-32 h-32 bg-linear-to-br from-blue-200/20 to-purple-200/20 rounded-full blur-3xl'></div>
            <div className='absolute bottom-0 right-0 w-32 h-32 bg-linear-to-br from-pink-200/20 to-orange-200/20 rounded-full blur-3xl'></div>
            <div className='relative flex flex-col items-center gap-4'>
              <div className='relative'>
                <div className='w-24 h-24 rounded-full bg-linear-to-br from-gray-100 to-slate-200 dark:from-gray-700 dark:to-slate-700 flex items-center justify-center shadow-lg'>
                  <svg className='w-12 h-12 text-gray-400 dark:text-gray-500' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                    <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='1.5' d='M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4'></path>
                  </svg>
                </div>
                <div className='absolute -top-1 -right-1 w-3 h-3 bg-blue-400 rounded-full animate-ping'></div>
                <div className='absolute -bottom-1 -left-1 w-2 h-2 bg-purple-400 rounded-full animate-pulse'></div>
              </div>
              <div className='text-center space-y-2'>
                <h3 className='text-xl font-bold text-gray-800 dark:text-gray-200'>暂无相关内容</h3>
                <p className='text-sm text-gray-600 dark:text-gray-400 max-w-xs'>尝试调整筛选条件或切换其他分类查看更多内容</p>
              </div>
              <div className='w-16 h-1 bg-linear-to-r from-transparent via-gray-300 to-transparent dark:via-gray-600 rounded-full'></div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <VirtuosoGrid
        ref={virtuosoRef}
        customScrollParent={scrollParent ?? undefined}
        data={doubanData}
        increaseViewportBy={INCREASE_VIEWPORT_BY}
        scrollSeekConfiguration={SCROLL_SEEK_CONFIG}
        computeItemKey={computeItemKey}
        endReached={() => {
          if (hasMore && !isLoadingMore) onLoadMore();
        }}
        components={{
          List: ListContainer,
          Item: ItemContainer,
          ScrollSeekPlaceholder,
          Footer: () =>
            isLoadingMore ? (
              <div className='flex justify-center mt-8 py-8'>
                <div className='relative px-8 py-4 rounded-2xl bg-gradient-to-r from-green-50 via-emerald-50 to-teal-50 dark:from-green-900/20 dark:via-emerald-900/20 dark:to-teal-900/20 border border-green-200/50 dark:border-green-700/50 shadow-lg overflow-hidden'>
                  <div className='absolute inset-0 bg-gradient-to-r from-green-400/10 via-emerald-400/10 to-teal-400/10 animate-pulse'></div>
                  <div className='relative flex items-center gap-3'>
                    <div className='relative'>
                      <div className='animate-spin rounded-full h-8 w-8 border-[3px] border-green-200 dark:border-green-800'></div>
                      <div className='absolute inset-0 animate-spin rounded-full h-8 w-8 border-[3px] border-transparent border-t-green-500 dark:border-t-green-400'></div>
                    </div>
                    <div className='flex items-center gap-1'>
                      <span className='text-sm font-medium text-gray-700 dark:text-gray-300'>加载中</span>
                      <span className='flex gap-0.5'>
                        <span className='animate-bounce' style={{ animationDelay: '0ms' }}>.</span>
                        <span className='animate-bounce' style={{ animationDelay: '150ms' }}>.</span>
                        <span className='animate-bounce' style={{ animationDelay: '300ms' }}>.</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : !hasMore && doubanData.length > 0 ? (
              <div className='flex justify-center mt-8 py-8'>
                <div className='relative px-8 py-5 rounded-2xl bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 dark:from-blue-900/20 dark:via-indigo-900/20 dark:to-purple-900/20 border border-blue-200/50 dark:border-blue-700/50 shadow-lg overflow-hidden'>
                  <div className='absolute inset-0 bg-gradient-to-br from-blue-100/20 to-purple-100/20 dark:from-blue-800/10 dark:to-purple-800/10'></div>
                  <div className='relative flex flex-col items-center gap-2'>
                    <div className='relative'>
                      <div className='w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center shadow-lg'>
                        {isBangumi ? (
                          <svg className='w-7 h-7 text-white' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z'></path>
                          </svg>
                        ) : (
                          <svg className='w-7 h-7 text-white' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2.5' d='M5 13l4 4L19 7'></path>
                          </svg>
                        )}
                      </div>
                      <div className='absolute inset-0 rounded-full bg-blue-400/30 animate-ping'></div>
                    </div>
                    <div className='text-center'>
                      <p className='text-base font-semibold text-gray-800 dark:text-gray-200 mb-1'>
                        {isBangumi ? '本日番剧已全部显示' : '已加载全部内容'}
                      </p>
                      <p className='text-xs text-gray-600 dark:text-gray-400'>
                        {isBangumi ? `今日共 ${doubanData.length} 部` : `共 ${doubanData.length} 项`}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : null,
        }}
        itemContent={(index, item) => (
          <VideoCard
            from='douban'
            source='douban'
            id={item.id}
            source_name='豆瓣'
            title={item.title}
            poster={item.poster}
            douban_id={Number(item.id)}
            rate={item.rate}
            year={item.year}
            type={
              type === 'movie' ? 'movie'
              : type === 'show' ? 'variety'
              : type === 'tv' ? 'tv'
              : type === 'anime' ? 'anime'
              : ''
            }
            isBangumi={isBangumi}
            priority={index < INITIAL_PRIORITY_COUNT}
            aiEnabled={aiEnabled}
            aiCheckComplete={aiCheckComplete}
          />
        )}
      />
    );
  },
);

VirtualDoubanGrid.displayName = 'VirtualDoubanGrid';

export default VirtualDoubanGrid;
