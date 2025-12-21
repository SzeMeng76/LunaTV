/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, useTransition } from 'react';
import dynamic from 'next/dynamic';

const Grid = dynamic(
  () => import('react-window').then(mod => ({ default: mod.Grid })),
  { 
    ssr: false,
    loading: () => <div className="animate-pulse h-96 bg-gray-200 dark:bg-gray-800 rounded-lg" />
  }
);

import { SearchResult } from '@/lib/types';
import { useResponsiveGrid } from '@/hooks/useResponsiveGrid';
import { useImagePreload } from '@/hooks/useImagePreload';

import VideoCard from '@/components/VideoCard';

// 导出的 ref 接口，供父组件调用
export interface VirtualSearchGridRef {
  scrollToTop: () => void;
}

interface VirtualSearchGridProps {
  // 搜索结果数据
  allResults: SearchResult[];
  filteredResults: SearchResult[];
  aggregatedResults: [string, SearchResult[]][];
  filteredAggResults: [string, SearchResult[]][];

  // 视图模式
  viewMode: 'agg' | 'all';

  // 搜索相关
  searchQuery: string;
  isLoading: boolean;

  // VideoCard相关props
  groupRefs: React.MutableRefObject<Map<string, React.RefObject<any>>>;
  groupStatsRef: React.MutableRefObject<Map<string, any>>;
  getGroupRef: (key: string) => React.RefObject<any>;
  computeGroupStats: (group: SearchResult[]) => any;
}

// 渐进式加载配置
const INITIAL_BATCH_SIZE = 12;
const LOAD_MORE_BATCH_SIZE = 8;
const LOAD_MORE_THRESHOLD = 5; // 恢复原来的阈值，避免过度触发

export const VirtualSearchGrid = React.forwardRef<VirtualSearchGridRef, VirtualSearchGridProps>(({
  allResults,
  filteredResults,
  aggregatedResults,
  filteredAggResults,
  viewMode,
  searchQuery,
  isLoading,
  groupRefs,
  groupStatsRef,
  getGroupRef,
  computeGroupStats,
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<any>(null); // Grid ref for imperative scroll
  const { columnCount, itemWidth, itemHeight, containerWidth } = useResponsiveGrid(containerRef);

  // 🚀 React 19 useTransition - 将渐进式加载标记为非紧急更新，避免阻塞用户交互
  const [isPending, startTransition] = useTransition();

  // 渐进式加载状态
  const [visibleItemCount, setVisibleItemCount] = useState(INITIAL_BATCH_SIZE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // 选择当前显示的数据
  const currentData = viewMode === 'agg' ? filteredAggResults : filteredResults;
  const totalItemCount = currentData.length;

  // 实际显示的项目数量（考虑渐进式加载）
  const displayItemCount = Math.min(visibleItemCount, totalItemCount);
  const displayData = currentData.slice(0, displayItemCount);

  // 预加载图片 - 收集即将显示的图片 URLs
  const imagesToPreload = useMemo(() => {
    const urls: string[] = [];
    const itemsToPreload = currentData.slice(displayItemCount, Math.min(displayItemCount + 20, totalItemCount));

    itemsToPreload.forEach(item => {
      if (viewMode === 'agg') {
        const [, group] = item as [string, SearchResult[]];
        if (group[0]?.poster) urls.push(group[0].poster);
      } else {
        const searchItem = item as SearchResult;
        if (searchItem.poster) urls.push(searchItem.poster);
      }
    });

    return urls;
  }, [currentData, displayItemCount, totalItemCount, viewMode]);

  useImagePreload(imagesToPreload, totalItemCount > 0);

  // 重置可见项目数量（当搜索或过滤变化时）
  useEffect(() => {
    setVisibleItemCount(INITIAL_BATCH_SIZE);
    setIsLoadingMore(false);
  }, [currentData, viewMode]);

  // 当搜索关键词或视图模式改变时，滚动到顶部
  useEffect(() => {
    if (gridRef.current?.scrollToCell && totalItemCount > 0) {
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
  }, [searchQuery, viewMode, totalItemCount]);

  // 强制重新计算容器尺寸的useEffect
  useEffect(() => {
    const checkContainer = () => {
      const element = containerRef.current;
      const actualWidth = element?.offsetWidth || 0;
      
      console.log('VirtualSearchGrid container debug:', {
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

  // 检查是否还有更多项目可以加载
  const hasNextPage = displayItemCount < totalItemCount;

  // 🚀 使用 useTransition 优化加载更多 - React 19 新特性
  const loadMoreItems = useCallback(() => {
    if (isLoadingMore || !hasNextPage) return;

    setIsLoadingMore(true);

    // 🎯 将状态更新标记为 transition，让滚动和交互保持流畅
    startTransition(() => {
      // 立即更新可见项目数量，但不阻塞用户交互
      setVisibleItemCount(prev => Math.min(prev + LOAD_MORE_BATCH_SIZE, totalItemCount));
      setIsLoadingMore(false);
    });
  }, [isLoadingMore, hasNextPage, totalItemCount, startTransition]);

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
    viewMode: cellViewMode,
    searchQuery: cellSearchQuery,
    columnCount: cellColumnCount,
    displayItemCount: cellDisplayItemCount,
    groupStatsRef: cellGroupStatsRef,
    getGroupRef: cellGetGroupRef,
    computeGroupStats: cellComputeGroupStats,
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

    // 🎯 图片加载优化：首屏12张卡片使用 priority 预加载
    const isPriorityImage = index < INITIAL_BATCH_SIZE;

    // 根据视图模式渲染不同内容
    if (cellViewMode === 'agg') {
      const [mapKey, group] = item as [string, SearchResult[]];
      const title = group[0]?.title || '';
      const poster = group[0]?.poster || '';
      const year = group[0]?.year || 'unknown';
      const { episodes, source_names, douban_id } = cellComputeGroupStats(group);
      const type = episodes === 1 ? 'movie' : 'tv';

      // 如果该聚合第一次出现，写入初始统计
      if (!cellGroupStatsRef.current.has(mapKey)) {
        cellGroupStatsRef.current.set(mapKey, { episodes, source_names, douban_id });
      }

      return (
        <div style={{ ...style, padding: '8px' }} {...ariaAttributes}>
          <VideoCard
            ref={cellGetGroupRef(mapKey)}
            from='search'
            isAggregate={true}
            title={title}
            poster={poster}
            year={year}
            episodes={episodes}
            source_names={source_names}
            douban_id={douban_id}
            query={cellSearchQuery.trim() !== title ? cellSearchQuery.trim() : ''}
            type={type}
            remarks={group[0]?.remarks}
            priority={isPriorityImage}
          />
        </div>
      );
    } else {
      const searchItem = item as SearchResult;
      return (
        <div style={{ ...style, padding: '8px' }} {...ariaAttributes}>
          <VideoCard
            id={searchItem.id}
            title={searchItem.title}
            poster={searchItem.poster}
            episodes={searchItem.episodes.length}
            source={searchItem.source}
            source_name={searchItem.source_name}
            douban_id={searchItem.douban_id}
            query={cellSearchQuery.trim() !== searchItem.title ? cellSearchQuery.trim() : ''}
            year={searchItem.year}
            from='search'
            type={searchItem.episodes.length > 1 ? 'tv' : 'movie'}
            remarks={searchItem.remarks}
            priority={isPriorityImage}
          />
        </div>
      );
    }
  }, []);


  return (
    <div ref={containerRef} className='w-full'>
      {totalItemCount === 0 ? (
        <div className='flex justify-center items-center h-40'>
          {isLoading ? (
            <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-green-500'></div>
          ) : (
            <div className='text-center text-gray-500 py-8 dark:text-gray-400'>
              未找到相关结果
            </div>
          )}
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
            viewMode,
            searchQuery,
            columnCount,
            displayItemCount,
            groupStatsRef,
            getGroupRef,
            computeGroupStats,
          }}
          columnCount={columnCount}
          columnWidth={itemWidth + 16}
          rowCount={rowCount}
          rowHeight={itemHeight + 16}
          overscanCount={5}
          // 添加ARIA支持提升无障碍体验
          role="grid"
          aria-label={`搜索结果列表 "${searchQuery}"，共${displayItemCount}个结果，当前视图：${viewMode === 'agg' ? '聚合视图' : '全部结果'}`}
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
            if (visibleRowStopIndex >= rowCount - LOAD_MORE_THRESHOLD && hasNextPage && !isLoadingMore) {
              loadMoreItems();
            }
          }}
        />
      )}
      
      {/* 加载更多指示器 - 显示 transition 状态 */}
      {containerWidth > 100 && (isLoadingMore || isPending) && (
        <div className='flex justify-center items-center py-4'>
          <div className='animate-spin rounded-full h-6 w-6 border-b-2 border-green-500'></div>
          <span className='ml-2 text-sm text-gray-500 dark:text-gray-400'>
            加载更多...
          </span>
        </div>
      )}
      
      {/* 已加载完所有内容的提示 */}
      {containerWidth > 100 && !hasNextPage && displayItemCount > INITIAL_BATCH_SIZE && (
        <div className='text-center py-4 text-sm text-gray-500 dark:text-gray-400'>
          已显示全部 {displayItemCount} 个结果
        </div>
      )}
    </div>
  );
});

VirtualSearchGrid.displayName = 'VirtualSearchGrid';

export default VirtualSearchGrid;