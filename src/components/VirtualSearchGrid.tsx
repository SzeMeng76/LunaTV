/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { VirtuosoGrid, VirtuosoGridHandle } from 'react-virtuoso';

import { SearchResult } from '@/lib/types';
import { useImagePreload } from '@/hooks/useImagePreload';
import VideoCard from '@/components/VideoCard';

export interface VirtualSearchGridRef {
  scrollToTop: () => void;
}

interface VirtualSearchGridProps {
  allResults: SearchResult[];
  filteredResults: SearchResult[];
  aggregatedResults: [string, SearchResult[]][];
  filteredAggResults: [string, SearchResult[]][];
  viewMode: 'agg' | 'all';
  searchQuery: string;
  isLoading: boolean;
  groupRefs: React.MutableRefObject<Map<string, React.RefObject<any>>>;
  groupStatsRef: React.MutableRefObject<Map<string, any>>;
  getGroupRef: (key: string) => React.RefObject<any>;
  computeGroupStats: (group: SearchResult[]) => any;
}

const INITIAL_PRIORITY_COUNT = 24;

const INCREASE_VIEWPORT_BY = { top: 300, bottom: 600 };

// List 容器：flex wrap
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

// Item 容器：每个卡片的宽度
const ItemContainer = ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    {...props}
    className='w-1/3 sm:w-[calc(100%/4)] md:w-[calc(100%/5)] lg:w-[calc(100%/6)] xl:w-[calc(100%/7)] 2xl:w-[calc(100%/8)] px-1 sm:px-4 pb-14 sm:pb-20 box-border'
  >
    {children}
  </div>
);

export const VirtualSearchGrid = React.forwardRef<VirtualSearchGridRef, VirtualSearchGridProps>(
  (
    {
      filteredResults,
      filteredAggResults,
      viewMode,
      searchQuery,
      isLoading,
      groupStatsRef,
      getGroupRef,
      computeGroupStats,
    },
    ref,
  ) => {
    const virtuosoRef = useRef<VirtuosoGridHandle>(null);
    const [scrollParent, setScrollParent] = useState<HTMLElement | null>(null);
    const currentData = viewMode === 'agg' ? filteredAggResults : filteredResults;

    useEffect(() => {
      setScrollParent(document.body);
    }, []);
    const totalItemCount = currentData.length;

    const imagesToPreload = useMemo(() => {
      return currentData
        .slice(0, Math.min(30, totalItemCount))
        .map((item) => {
          if (viewMode === 'agg') {
            const [, group] = item as [string, SearchResult[]];
            return group[0]?.poster;
          }
          return (item as SearchResult).poster;
        })
        .filter(Boolean) as string[];
    }, [currentData, totalItemCount, viewMode]);

    useImagePreload(imagesToPreload, totalItemCount > 0);

    useImperativeHandle(ref, () => ({
      scrollToTop: () => {
        virtuosoRef.current?.scrollToIndex({ index: 0, behavior: 'smooth' });
      },
    }));

    const computeItemKey = useCallback(
      (index: number, item: any) => {
        if (viewMode === 'agg') {
          const [mapKey] = item as [string, SearchResult[]];
          return `agg-${mapKey}`;
        }
        const s = item as SearchResult;
        return `search-${s.source}-${s.id ?? index}`;
      },
      [viewMode],
    );

    if (totalItemCount === 0) {
      return (
        <div className='flex justify-center items-center min-h-[300px]'>
          {isLoading ? (
            <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-green-500'></div>
          ) : (
            <div className='relative px-8 py-6 rounded-2xl bg-gradient-to-r from-gray-50 via-slate-50 to-gray-50 dark:from-gray-800/40 dark:via-slate-800/40 dark:to-gray-800/40 border border-gray-200/50 dark:border-gray-700/50 shadow-lg overflow-hidden'>
              <div className='absolute inset-0 bg-gradient-to-br from-gray-100/20 to-slate-100/20 dark:from-gray-700/10 dark:to-slate-700/10'></div>
              <div className='relative flex flex-col items-center gap-3'>
                <div className='text-4xl'>🔍</div>
                <div className='text-center text-gray-600 dark:text-gray-300 font-medium'>未搜索到结果</div>
                <div className='text-sm text-gray-500 dark:text-gray-400'>试试其他关键词吧</div>
              </div>
            </div>
          )}
        </div>
      );
    }

    return (
      <VirtuosoGrid
        ref={virtuosoRef}
        customScrollParent={scrollParent ?? undefined}
        data={currentData as any[]}
        increaseViewportBy={INCREASE_VIEWPORT_BY}
        computeItemKey={computeItemKey}
        components={{
          List: ListContainer,
          Item: ItemContainer,
          Footer: () =>
            isLoading && totalItemCount > 0 ? (
              <div className='fixed bottom-0 left-0 right-0 z-50 flex justify-center py-3 bg-white/98 dark:bg-gray-900/98 border-t border-gray-200/80 dark:border-gray-700/80'>
                <div className='flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400'>
                  <div className='animate-spin rounded-full h-4 w-4 border-2 border-gray-300 dark:border-gray-600 border-t-green-500 dark:border-t-green-400'></div>
                  <span>正在搜索更多结果...</span>
                </div>
              </div>
            ) : !isLoading && totalItemCount > 0 ? (
              <div className='flex justify-center mt-8 py-8'>
                <div className='relative px-8 py-5 rounded-2xl bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 dark:from-blue-900/20 dark:via-indigo-900/20 dark:to-purple-900/20 border border-blue-200/50 dark:border-blue-700/50 shadow-lg overflow-hidden'>
                  <div className='absolute inset-0 bg-gradient-to-br from-blue-100/20 to-purple-100/20 dark:from-blue-800/10 dark:to-purple-800/10'></div>
                  <div className='relative flex flex-col items-center gap-2'>
                    <div className='relative'>
                      <div className='w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center shadow-lg'>
                        <svg className='w-7 h-7 text-white' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                          <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2.5' d='M5 13l4 4L19 7'></path>
                        </svg>
                      </div>
                      <div className='absolute inset-0 rounded-full bg-blue-400/30 animate-ping'></div>
                    </div>
                    <div className='text-center'>
                      <p className='text-base font-semibold text-gray-800 dark:text-gray-200 mb-1'>搜索完成</p>
                      <p className='text-xs text-gray-600 dark:text-gray-400'>共找到 {totalItemCount} 个结果</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : null,
        }}
        itemContent={(index, item) => {
          const isPriority = index < INITIAL_PRIORITY_COUNT;

          if (viewMode === 'agg') {
            const [mapKey, group] = item as [string, SearchResult[]];
            const title = group[0]?.title || '';
            const poster = group[0]?.poster || '';
            const year = group[0]?.year || 'unknown';
            const { episodes, source_names, douban_id } = computeGroupStats(group);
            const type = episodes === 1 ? 'movie' : 'tv';

            if (!groupStatsRef.current.has(mapKey)) {
              groupStatsRef.current.set(mapKey, { episodes, source_names, douban_id });
            }

            return (
              <VideoCard
                ref={getGroupRef(mapKey)}
                from='search'
                isAggregate={true}
                title={title}
                poster={poster}
                year={year}
                episodes={episodes}
                source_names={source_names}
                douban_id={douban_id}
                query={searchQuery.trim() !== title ? searchQuery.trim() : ''}
                type={type}
                remarks={group[0]?.remarks}
                priority={isPriority}
              />
            );
          } else {
            const searchItem = item as SearchResult;
            return (
              <VideoCard
                id={searchItem.id}
                title={searchItem.title}
                poster={searchItem.poster}
                episodes={searchItem.episodes.length}
                source={searchItem.source}
                source_name={searchItem.source_name}
                douban_id={searchItem.douban_id}
                query={searchQuery.trim() !== searchItem.title ? searchQuery.trim() : ''}
                year={searchItem.year}
                from='search'
                type={searchItem.episodes.length > 1 ? 'tv' : 'movie'}
                remarks={searchItem.remarks}
                priority={isPriority}
              />
            );
          }
        }}
      />
    );
  },
);

VirtualSearchGrid.displayName = 'VirtualSearchGrid';

export default VirtualSearchGrid;
