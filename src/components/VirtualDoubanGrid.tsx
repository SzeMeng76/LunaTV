/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import VideoCard from '@/components/VideoCard';
import DoubanCardSkeleton from '@/components/DoubanCardSkeleton';

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

export const VirtualDoubanGrid: React.FC<VirtualDoubanGridProps> = ({
  doubanData,
  hasMore,
  isLoadingMore,
  onLoadMore,
  type,
  loading,
  primarySelection,
  isBangumi = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { columnCount, itemWidth, itemHeight, containerWidth } = useResponsiveGrid(containerRef);
  
  // 渐进式加载状态
  const [visibleItemCount, setVisibleItemCount] = useState(INITIAL_BATCH_SIZE);
  const [isVirtualLoadingMore, setIsVirtualLoadingMore] = useState(false);

  // 总数据数量
  const totalItemCount = doubanData.length;
  
  // 实际显示的项目数量（考虑渐进式加载）
  const displayItemCount = Math.min(visibleItemCount, totalItemCount);
  const displayData = doubanData.slice(0, displayItemCount);

  // 重置可见项目数量（当数据变化时）
  useEffect(() => {
    setVisibleItemCount(INITIAL_BATCH_SIZE);
    setIsVirtualLoadingMore(false);
  }, [doubanData, type, primarySelection]);

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

    return (
      <div style={{ ...style, padding: '8px' }} {...ariaAttributes}>
        <VideoCard
          from='douban'
          title={item.title}
          poster={item.poster}
          douban_id={Number(item.id)}
          rate={item.rate}
          year={item.year}
          type={cellType === 'movie' ? 'movie' : ''} // 电影类型严格控制，tv 不控
          isBangumi={cellIsBangumi}
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
        <div className='text-center text-gray-500 py-8'>暂无相关内容</div>
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
          overscanCount={3}
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
        <div className='flex justify-center items-center py-4'>
          <div className='animate-spin rounded-full h-6 w-6 border-b-2 border-green-500'></div>
          <span className='ml-2 text-sm text-gray-500 dark:text-gray-400'>
            加载更多...
          </span>
        </div>
      )}
      
      {/* 已加载完所有内容的提示 */}
      {containerWidth > 100 && !hasMore && !hasNextVirtualPage && displayItemCount > INITIAL_BATCH_SIZE && (
        <div className='text-center py-4 text-sm text-gray-500 dark:text-gray-400'>
          已显示全部 {displayItemCount} 个结果
        </div>
      )}
    </div>
  );
};

export default VirtualDoubanGrid;