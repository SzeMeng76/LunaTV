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
}

// 渐进式加载配置
const INITIAL_BATCH_SIZE = 25;
const LOAD_MORE_BATCH_SIZE = 25;
const LOAD_MORE_THRESHOLD = 3; // 恢复原来的阈值，避免过度触发

export const VirtualDoubanGrid = React.forwardRef<VirtualDoubanGridRef, VirtualDoubanGridProps>(({
  doubanData,
  hasMore,
  isLoadingMore,
  onLoadMore,
  type,
  loading,
  primarySelection,
  isBangumi = false,
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<any>(null); // Grid ref for imperative scroll
  const { columnCount, itemWidth, itemHeight, containerWidth } = useResponsiveGrid(containerRef);

  // 渐进式加载状态
  const [visibleItemCount, setVisibleItemCount] = useState(INITIAL_BATCH_SIZE);
  const [isVirtualLoadingMore, setIsVirtualLoadingMore] = useState(false);

  // 总数据数量
  const totalItemCount = doubanData.length;

  // 实际显示的项目数量（考虑渐进式加载）
  const displayItemCount = Math.min(visibleItemCount, totalItemCount);
  const displayData = doubanData.slice(0, displayItemCount);

  // 预加载图片 - 收集即将显示的图片 URLs
  const imagesToPreload = useMemo(() => {
    const urls: string[] = [];
    const itemsToPreload = doubanData.slice(displayItemCount, Math.min(displayItemCount + 20, totalItemCount));

    itemsToPreload.forEach(item => {
      if (item.poster) urls.push(item.poster);
    });

    return urls;
  }, [doubanData, displayItemCount, totalItemCount]);

  useImagePreload(imagesToPreload, totalItemCount > 0);

  // 重置可见项目数量（当数据变化时）
  useEffect(() => {
    setVisibleItemCount(INITIAL_BATCH_SIZE);
    setIsVirtualLoadingMore(false);
  }, [doubanData, type, primarySelection]);

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

  // 检查是否还有更多项目可以加载（虚拟层面）
  const hasNextVirtualPage = displayItemCount < totalItemCount;
  
  // 检查是否需要从服务器加载更多数据
  const needsServerData = displayItemCount >= totalItemCount * 0.8 && hasMore && !isLoadingMore;

  // 防止重复调用onLoadMore的ref
  const lastLoadMoreCallRef = useRef<number>(0);

  // 加载更多项目（虚拟层面）
  const loadMoreVirtualItems = useCallback(() => {
    if (isVirtualLoadingMore) return;

    setIsVirtualLoadingMore(true);

    // 模拟异步加载
    setTimeout(() => {
      setVisibleItemCount(prev => {
        const newCount = Math.min(prev + LOAD_MORE_BATCH_SIZE, totalItemCount);

        // 如果虚拟数据即将用完，触发服务器数据加载
        if (newCount >= totalItemCount * 0.8 && hasMore && !isLoadingMore) {
          onLoadMore();
        }

        return newCount;
      });
      setIsVirtualLoadingMore(false);
    }, 100);
  }, [isVirtualLoadingMore, totalItemCount, hasMore, isLoadingMore, onLoadMore]);

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

  // 网格行数计算
  const rowCount = Math.ceil(displayItemCount / columnCount);

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
    displayItemCount: cellDisplayItemCount,
  }: any) => {
    const index = rowIndex * cellColumnCount + columnIndex;
    
    // 如果超出显示范围，返回隐藏的占位符
    if (index >= cellDisplayItemCount) {
      return <div style={{ ...style, visibility: 'hidden' }} />;
    }

    const item = cellDisplayData[index];

    if (!item) {
      return <div style={{ ...style, visibility: 'hidden' }} />;
    }

    // 🎯 图片加载优化：首屏25张卡片使用 priority 预加载
    const isPriorityImage = index < INITIAL_BATCH_SIZE;

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
          <div className='relative px-12 py-10 rounded-3xl bg-gradient-to-br from-gray-50 via-slate-50 to-gray-100 dark:from-gray-800/40 dark:via-slate-800/40 dark:to-gray-800/50 border border-gray-200/50 dark:border-gray-700/50 shadow-xl backdrop-blur-sm overflow-hidden max-w-md'>
            {/* 装饰性元素 */}
            <div className='absolute top-0 left-0 w-32 h-32 bg-gradient-to-br from-blue-200/20 to-purple-200/20 rounded-full blur-3xl'></div>
            <div className='absolute bottom-0 right-0 w-32 h-32 bg-gradient-to-br from-pink-200/20 to-orange-200/20 rounded-full blur-3xl'></div>

            {/* 内容 */}
            <div className='relative flex flex-col items-center gap-4'>
              {/* 插图图标 */}
              <div className='relative'>
                <div className='w-24 h-24 rounded-full bg-gradient-to-br from-gray-100 to-slate-200 dark:from-gray-700 dark:to-slate-700 flex items-center justify-center shadow-lg'>
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
              <div className='w-16 h-1 bg-gradient-to-r from-transparent via-gray-300 to-transparent dark:via-gray-600 rounded-full'></div>
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
            displayData,
            type,
            primarySelection,
            isBangumi,
            columnCount,
            displayItemCount,
          }}
          columnCount={columnCount}
          columnWidth={itemWidth + 16}
          rowCount={rowCount}
          rowHeight={itemHeight + 16}
          overscanCount={5}
          // 添加ARIA支持提升无障碍体验
          role="grid"
          aria-label={`豆瓣${type}列表，共${displayItemCount}个结果`}
          aria-rowcount={rowCount}
          aria-colcount={columnCount}
          style={{
            // 确保不创建新的stacking context，让菜单能正确显示在最顶层
            isolation: 'auto',
            // 平滑滚动优化
            scrollBehavior: 'smooth',
            // 单行网格优化：防止高度异常
            ...(isSingleRow && {
              minHeight: itemHeight + 16,
              maxHeight: itemHeight + 32,
            }),
          }}
          onCellsRendered={(visibleCells, allCells) => {
            // 使用react-window v2.1.2的API：
            // 1. visibleCells: 真实可见的单元格范围
            // 2. allCells: 包含overscan的所有渲染单元格范围
            const { rowStopIndex: visibleRowStopIndex } = visibleCells;

            // 简化逻辑：基于可见行检测
            if (visibleRowStopIndex >= rowCount - LOAD_MORE_THRESHOLD) {
              if (hasNextVirtualPage && !isVirtualLoadingMore) {
                loadMoreVirtualItems();
              } else if (needsServerData) {
                // 防止重复调用onLoadMore
                const now = Date.now();
                if (now - lastLoadMoreCallRef.current > 1000) {
                  lastLoadMoreCallRef.current = now;
                  onLoadMore();
                }
              }
            }
          }}
        />
      )}
      
      {/* 加载更多指示器 */}
      {containerWidth > 100 && (isVirtualLoadingMore || isLoadingMore) && (
        <div className='flex justify-center mt-8 py-8'>
          <div className='relative px-8 py-4 rounded-2xl bg-gradient-to-r from-green-50 via-emerald-50 to-teal-50 dark:from-green-900/20 dark:via-emerald-900/20 dark:to-teal-900/20 border border-green-200/50 dark:border-green-700/50 shadow-lg backdrop-blur-sm overflow-hidden'>
            {/* 动画背景 */}
            <div className='absolute inset-0 bg-gradient-to-r from-green-400/10 via-emerald-400/10 to-teal-400/10 animate-pulse'></div>

            {/* 内容 */}
            <div className='relative flex items-center gap-3'>
              {/* 旋转圈 */}
              <div className='relative'>
                <div className='animate-spin rounded-full h-8 w-8 border-[3px] border-green-200 dark:border-green-800'></div>
                <div className='absolute inset-0 animate-spin rounded-full h-8 w-8 border-[3px] border-transparent border-t-green-500 dark:border-t-green-400'></div>
              </div>

              {/* 文字和点动画 */}
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
      {containerWidth > 100 && !hasMore && !hasNextVirtualPage && displayItemCount > 0 && (
        <div className='flex justify-center mt-8 py-8'>
          <div className='relative px-8 py-5 rounded-2xl bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 dark:from-blue-900/20 dark:via-indigo-900/20 dark:to-purple-900/20 border border-blue-200/50 dark:border-blue-700/50 shadow-lg backdrop-blur-sm overflow-hidden'>
            {/* 装饰性背景 */}
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
                {/* 光圈效果 */}
                <div className='absolute inset-0 rounded-full bg-blue-400/30 animate-ping'></div>
              </div>

              {/* 文字 */}
              <div className='text-center'>
                <p className='text-base font-semibold text-gray-800 dark:text-gray-200 mb-1'>
                  {isBangumi ? '本日番剧已全部显示' : '已加载全部内容'}
                </p>
                <p className='text-xs text-gray-600 dark:text-gray-400'>
                  {isBangumi ? `今日共 ${displayItemCount} 部` : `共 ${displayItemCount} 项`}
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