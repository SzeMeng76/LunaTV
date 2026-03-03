'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import React, { useCallback, useEffect, useRef, useState } from 'react';

interface VirtualGridProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  /** Estimated row height in px (including gap). Will be refined by measurement. */
  estimateRowHeight?: number;
  /** CSS class for row gap, applied as padding-bottom on each row so measureElement captures it */
  rowGapClass?: string;
  /** Overscan rows */
  overscan?: number;
  className?: string;
  /** Callback when user scrolls near the end - triggers before reaching last item */
  endReached?: () => void;
  /** How many rows before the end to trigger endReached (default: 2) */
  endReachedThreshold?: number;
}

/**
 * A virtualised grid that piggy-backs on CSS grid for column layout
 * and virtualises *rows* via @tanstack/react-virtual.
 *
 * Uses document.body as scroll element for window-level scrolling.
 * Based on official @tanstack/react-virtual implementation pattern.
 */
export default function VirtualGrid<T>({
  items,
  renderItem,
  estimateRowHeight = 320,
  rowGapClass = 'pb-14 sm:pb-20',
  overscan = 3,
  className = '',
  endReached,
  endReachedThreshold = 2,
}: VirtualGridProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(3);

  // Detect column count from a hidden probe row that shares the same grid CSS
  const probeRef = useRef<HTMLDivElement>(null);

  const detectColumns = useCallback(() => {
    if (!probeRef.current) return;
    const style = window.getComputedStyle(probeRef.current);
    const cols = style.gridTemplateColumns.split(' ').length;
    if (cols > 0 && cols !== columns) setColumns(cols);
  }, [columns]);

  useEffect(() => {
    detectColumns();
    const ro = new ResizeObserver(detectColumns);
    if (probeRef.current) ro.observe(probeRef.current);
    return () => ro.disconnect();
  }, [detectColumns]);

  const rowCount = Math.ceil(items.length / columns);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => document.body,
    estimateSize: () => estimateRowHeight,
    overscan,
  });

  const virtualRows = virtualizer.getVirtualItems();

  // Detect when user scrolls near the end and trigger endReached callback
  const lastVirtualRowRef = useRef<number>(-1);
  useEffect(() => {
    if (!endReached || virtualRows.length === 0) return;

    const lastVirtualRow = virtualRows[virtualRows.length - 1];
    const lastRowIndex = lastVirtualRow.index;

    // Calculate dynamic threshold based on viewport height and row height
    // Mobile devices need earlier triggering due to smaller screens
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
    const visibleRows = Math.ceil(viewportHeight / estimateRowHeight);
    // Trigger when remaining rows <= visible rows + threshold
    // This ensures data loads before user sees the end
    const dynamicThreshold = Math.max(visibleRows + endReachedThreshold, endReachedThreshold);

    // Trigger endReached when we're within dynamic threshold rows of the end
    // and we haven't triggered for this position yet
    if (
      lastRowIndex >= rowCount - dynamicThreshold &&
      lastRowIndex !== lastVirtualRowRef.current
    ) {
      lastVirtualRowRef.current = lastRowIndex;
      endReached();
    }
  }, [virtualRows, rowCount, endReached, endReachedThreshold, estimateRowHeight]);

  return (
    <>
      {/* Hidden probe element to measure column count from computed CSS grid */}
      <div
        ref={probeRef}
        aria-hidden
        className={`grid invisible h-0 overflow-hidden ${className}`}
      >
        <div />
      </div>

      <div
        ref={parentRef}
        style={{
          height: virtualizer.getTotalSize(),
          width: '100%',
          position: 'relative',
        }}
      >
        {/* Container with unified offset - official pattern */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            transform: `translateY(${virtualRows[0]?.start ?? 0}px)`,
          }}
        >
          {virtualRows.map((virtualRow) => {
            const startIdx = virtualRow.index * columns;
            const rowItems = items.slice(startIdx, startIdx + columns);

            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                className={rowGapClass}
              >
                <div className={`grid ${className}`}>
                  {rowItems.map((item, i) => (
                    <React.Fragment key={startIdx + i}>
                      {renderItem(item, startIdx + i)}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
