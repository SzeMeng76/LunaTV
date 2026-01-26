/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

const Grid = dynamic(
  () => import('react-window').then(mod => ({ default: mod.Grid })),
  {
    ssr: false,
    loading: () => <div className="animate-pulse h-96 bg-gray-200 dark:bg-gray-800 rounded-lg" />
  }
);

// @ts-ignore - useInfiniteLoader exists at runtime but type definitions are incomplete
import { useInfiniteLoader } from 'react-window-infinite-loader';

import { DoubanItem } from '@/lib/types';
import { useResponsiveGrid } from '@/hooks/useResponsiveGrid';
import { useImagePreload } from '@/hooks/useImagePreload';
import VideoCard from '@/components/VideoCard';
import DoubanCardSkeleton from '@/components/DoubanCardSkeleton';

// 导出的 ref 接口，供父组件调用
export interface VirtualDoubanGridRef {
  scrollToTop: () => void;
}

interface VirtualDoubanGridProps {
  // 豆瓣数据
  doubanData: DoubanItem[];

  // 分页相关
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;

  // 类型和状态
  type: string;
  loading: boolean;
  primarySelection?: string;

  // 是否来自番组计划
  isBangumi?: boolean;

  // AI功能状态（从父组件传递）
  aiEnabled?: boolean;
  aiCheckComplete?: boolean;
}

// 首屏优先加载配置 - 用于图片预加载优化
const INITIAL_PRIORITY_COUNT = 30; // 首屏优先加载的卡片数量
const LOAD_MORE_THRESHOLD = 2; // 距离底部多少行时触发加载更多

export const VirtualDoubanGrid = React.forwardRef<VirtualDoubanGridRef, VirtualDoubanGridProps>(({
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
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<any>(null); // Grid ref for imperative scroll
  const { columnCount, itemWidth, itemHeight, containerWidth } = useResponsiveGrid(containerRef);

  // 总数据数量 - 直接使用全部数据，让 react-window 处理虚拟化
  const totalItemCount = doubanData.length;

  // 预加载图片 - 收集首屏及附近的图片 URLs
  const imagesToPreload = useMemo(() => {
    const urls: string[] = [];
    // 预加载前 30 个项目的图片（约首屏+1-2屏）
    const itemsToPreload = doubanData.slice(0, Math.min(30, totalItemCount));

    itemsToPreload.forEach(item => {
      if (item.poster) urls.push(item.poster);
    });

    return urls;
  }, [doubanData, totalItemCount]);

  useImagePreload(imagesToPreload, totalItemCount > 0);

  // 当类型或筛选条件改变时，滚动到顶部
  useEffect(() => {
    if (gridRef.current?.scrollToCell && totalItemCount > 0 && !loading) {
      try {
        gridRef.current.scrollToCell({
          columnIndex: 0,
          rowIndex: 0,
          align: 'start',
          behavior: 'smooth'
        });
      } catch (error) {
        // 忽略滚动错误（可能在组件卸载时发生）
        console.debug('Grid scroll error (safe to ignore):', error);
      }
    }
  }, [type, primarySelection, totalItemCount, loading]);

  // 强制重新计算容器尺寸的useEffect
  useEffect(() => {
    const checkContainer = () => {
      const element = containerRef.current;
      const actualWidth = element?.offsetWidth || 0;
      
      console.log('VirtualDoubanGrid container debug:', {
        actualWidth,
        containerWidth,
        offsetWidth: element?.offsetWidth,
        clientWidth: element?.clientWidth,
        scrollWidth: element?.scrollWidth,
        element: !!element
      });
    };
    
    checkContainer();
  }, [containerWidth]);

  // 检查是否需要从服务器加载更多数据
  const needsServerData = totalItemCount > 0 && hasMore && !isLoadingMore;

  // InfiniteLoader 需要的函数
  // 检查某个索引的项是否已加载
  const isItemLoaded = useCallback((index: number) => {
    // 如果索引小于当前数据量，说明已加载
    return index < totalItemCount;
  }, [totalItemCount]);

  // 加载更多项的函数 - 返回 Promise
  const loadMoreItems = useCallback((startIndex: number, stopIndex: number): Promise<void> => {
    // 如果正在加载或没有更多数据，直接返回
    if (isLoadingMore || !hasMore) {
      return Promise.resolve();
    }

    // 触发加载
    onLoadMore();

    // 返回一个 Promise，等待加载完成
    return new Promise((resolve) => {
      // 使用 setTimeout 轮询检查加载状态
      const checkLoading = () => {
        // 注意：这里无法直接访问最新的 isLoadingMore 状态
        // 所以我们简单地延迟 1 秒后 resolve
        setTimeout(() => resolve(), 1000);
      };
      checkLoading();
    });
  }, [isLoadingMore, hasMore, onLoadMore]);

  // 🔥 关键修复：计算总项数
  // 如果还有更多数据，需要增加 columnCount 个占位项来触发加载
  // 这样可以确保最后一行被渲染时能触发 InfiniteLoader
  const itemCount = hasMore ? totalItemCount + columnCount : totalItemCount;

  // 使用 useInfiniteLoader hook
  const onRowsRendered = useInfiniteLoader({
    isRowLoaded: isItemLoaded,
    loadMoreRows: loadMoreItems,
    rowCount: itemCount,
    threshold: 15,
    minimumBatchSize: 10
  });

  // 暴露 scrollToTop 方法给父组件
  useImperativeHandle(ref, () => ({
    scrollToTop: () => {
      if (gridRef.current?.scrollToCell) {
        try {
          gridRef.current.scrollToCell({
            columnIndex: 0,
            rowIndex: 0,
            align: 'start',
            behavior: 'smooth'
          });
        } catch (error) {
          console.debug('Grid scroll to top error (safe to ignore):', error);
        }
      }
    }
  }), []);

  // 网格行数计算 - 基于全部数据（包括占位项）
  const rowCount = Math.ceil(itemCount / columnCount);

  // 单行网格优化：确保单行时布局正确（react-window 2.1.1修复了相关bug）
  const isSingleRow = rowCount === 1;

  // 渲染单个网格项 - 支持react-window v2.1.0的ariaAttributes
  const CellComponent = useCallback(({
    ariaAttributes,
    columnIndex,
    rowIndex,
    style,
    displayData: cellDisplayData,
    type: cellType,
    primarySelection: cellPrimarySelection,
    isBangumi: cellIsBangumi,
    columnCount: cellColumnCount,
    totalItemCount: cellTotalItemCount,
    aiEnabled: cellAiEnabled,
    aiCheckComplete: cellAiCheckComplete,
  }: any) => {
    const index = rowIndex * cellColumnCount + columnIndex;

    // 如果超出数据范围，返回隐藏的占位符
    if (index >= cellTotalItemCount) {
      return <div style={{ ...style, visibility: 'hidden' }} />;
    }

    const item = cellDisplayData[index];

    if (!item) {
      return <div style={{ ...style, visibility: 'hidden' }} />;
    }

    // 🎯 图片加载优化：首屏卡片使用 priority 预加载
    const isPriorityImage = index < INITIAL_PRIORITY_COUNT;

    return (
      <div style={{ ...style, padding: '8px' }} {...ariaAttributes}>
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
          type={cellType === 'movie' ? 'movie' : cellType === 'show' ? 'variety' : cellType === 'tv' ? 'tv' : cellType === 'anime' ? 'anime' : ''}
          isBangumi={cellIsBangumi}
          priority={isPriorityImage}
          aiEnabled={cellAiEnabled}
          aiCheckComplete={cellAiCheckComplete}
        />
      </div>
    );
  }, []);


  // 生成骨架屏数据
  const skeletonData = Array.from({ length: 25 }, (_, index) => index);

  return (
    <div ref={containerRef} className='w-full'>
      {loading ? (
        // 加载状态显示骨架屏
        <div className='justify-start grid grid-cols-3 gap-x-2 gap-y-12 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] sm:gap-x-8 sm:gap-y-20'>
          {skeletonData.map((index) => <DoubanCardSkeleton key={index} />)}
        </div>
      ) : totalItemCount === 0 ? (
        <div className='flex justify-center py-16'>
          <div className='relative px-12 py-10 rounded-3xl bg-linear-to-br from-gray-50 via-slate-50 to-gray-100 dark:from-gray-800/40 dark:via-slate-800/40 dark:to-gray-800/50 border border-gray-200/50 dark:border-gray-700/50 shadow-xl backdrop-blur-sm overflow-hidden max-w-md'>
            {/* 装饰性元素 */}
            <div className='absolute top-0 left-0 w-32 h-32 bg-linear-to-br from-blue-200/20 to-purple-200/20 rounded-full blur-3xl'></div>
            <div className='absolute bottom-0 right-0 w-32 h-32 bg-linear-to-br from-pink-200/20 to-orange-200/20 rounded-full blur-3xl'></div>

            {/* 内容 */}
            <div className='relative flex flex-col items-center gap-4'>
              {/* 插图图标 */}
              <div className='relative'>
                <div className='w-24 h-24 rounded-full bg-linear-to-br from-gray-100 to-slate-200 dark:from-gray-700 dark:to-slate-700 flex items-center justify-center shadow-lg'>
                  <svg className='w-12 h-12 text-gray-400 dark:text-gray-500' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                    <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='1.5' d='M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4'></path>
                  </svg>
                </div>
                {/* 浮动小点装饰 */}
                <div className='absolute -top-1 -right-1 w-3 h-3 bg-blue-400 rounded-full animate-ping'></div>
                <div className='absolute -bottom-1 -left-1 w-2 h-2 bg-purple-400 rounded-full animate-pulse'></div>
              </div>

              {/* 文字内容 */}
              <div className='text-center space-y-2'>
                <h3 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
                  暂无相关内容
                </h3>
                <p className='text-sm text-gray-600 dark:text-gray-400 max-w-xs'>
                  尝试调整筛选条件或切换其他分类查看更多内容
                </p>
              </div>

              {/* 装饰线 */}
              <div className='w-16 h-1 bg-linear-to-r from-transparent via-gray-300 to-transparent dark:via-gray-600 rounded-full'></div>
            </div>
          </div>
        </div>
      ) : containerWidth <= 100 ? (
        <div className='flex justify-center items-center h-40'>
          <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-green-500'></div>
          <span className='ml-2 text-sm text-gray-500'>
            初始化虚拟滑动... ({Math.round(containerWidth)}px)
          </span>
        </div>
      ) : (
        <Grid
          key={`grid-${containerWidth}-${columnCount}`}
          gridRef={gridRef}
          cellComponent={CellComponent}
          cellProps={{
            displayData: doubanData,
            type,
            primarySelection,
            isBangumi,
            columnCount,
            totalItemCount,
            aiEnabled,
            aiCheckComplete,
          }}
          columnCount={columnCount}
          columnWidth={itemWidth + 16}
          rowCount={rowCount}
          rowHeight={itemHeight + 16}
          overscanCount={5}
          role="grid"
          aria-label={`豆瓣${type}列表，共${totalItemCount}个结果`}
          aria-rowcount={rowCount}
          aria-colcount={columnCount}
          style={{
            isolation: 'auto',
            scrollBehavior: 'smooth',
            ...(isSingleRow && {
              minHeight: itemHeight + 16,
              maxHeight: itemHeight + 32,
            }),
          }}
          onCellsRendered={(visibleCells, allCells) => {
                // 🔥 关键修复：将 Grid 的二维索引转换为一维索引
                // 使用 overscan 索引（allCells）来确保提前触发加载
                const { rowStartIndex, rowStopIndex } = allCells;

                // 计算一维索引范围 - 使用整行范围
                // startIndex: 该行第一个元素的索引
                // stopIndex: 该行最后一个元素的索引（即下一行第一个元素 - 1）
                const startIndex = rowStartIndex * columnCount;
                const stopIndex = Math.min(
                  (rowStopIndex + 1) * columnCount - 1,
                  itemCount - 1
                );

                // 调用 InfiniteLoader 的 onRowsRendered
                onRowsRendered({
                  startIndex,
                  stopIndex
                });
              }}
            />
      )}

      {/* 加载更多指示器 */}
      {isLoadingMore && (
        <div className='flex justify-center mt-8 py-8'>
          <div className='relative px-8 py-4 rounded-2xl bg-gradient-to-r from-green-50 via-emerald-50 to-teal-50 dark:from-green-900/20 dark:via-emerald-900/20 dark:to-teal-900/20 border border-green-200/50 dark:border-green-700/50 shadow-lg overflow-hidden'>
            {/* 动画背景 */}
            <div className='absolute inset-0 bg-gradient-to-r from-green-400/10 via-emerald-400/10 to-teal-400/10 animate-pulse'></div>

            {/* 内容 */}
            <div className='relative flex items-center gap-3'>
              {/* 旋转圈 */}
              <div className='relative'>
                <div className='animate-spin rounded-full h-8 w-8 border-[3px] border-green-200 dark:border-green-800'></div>
                <div className='absolute inset-0 animate-spin rounded-full h-8 w-8 border-[3px] border-transparent border-t-green-500 dark:border-t-green-400'></div>
              </div>

              {/* 文字 */}
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
      )}

      {/* 已加载完所有内容的提示 */}
      {!hasMore && totalItemCount > 0 && !isLoadingMore && (
        <div className='flex justify-center mt-8 py-8'>
          <div className='relative px-8 py-5 rounded-2xl bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 dark:from-blue-900/20 dark:via-indigo-900/20 dark:to-purple-900/20 border border-blue-200/50 dark:border-blue-700/50 shadow-lg overflow-hidden'>
            {/* 装饰背景 */}
            <div className='absolute inset-0 bg-gradient-to-br from-blue-100/20 to-purple-100/20 dark:from-blue-800/10 dark:to-purple-800/10'></div>

            {/* 内容 */}
            <div className='relative flex flex-col items-center gap-2'>
              {/* 完成图标 */}
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

              {/* 文字 */}
              <div className='text-center'>
                <p className='text-base font-semibold text-gray-800 dark:text-gray-200 mb-1'>
                  {isBangumi ? '本日番剧已全部显示' : '已加载全部内容'}
                </p>
                <p className='text-xs text-gray-600 dark:text-gray-400'>
                  {isBangumi ? `今日共 ${totalItemCount} 部` : `共 ${totalItemCount} 项`}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

VirtualDoubanGrid.displayName = 'VirtualDoubanGrid';

export default VirtualDoubanGrid;