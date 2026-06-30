'use client';

import { useVirtualizer, type VirtualItem } from '@tanstack/react-virtual';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { DOMErrorBoundary } from './DOMErrorBoundary';

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
  /**
   * If provided, persists scroll position and measurement cache in sessionStorage
   * under this key. Restores on next mount with the same key. Useful for
   * route navigation round-trips (list -> detail -> back).
   *
   * Pick a key that uniquely identifies the *content* of this list — e.g.
   * `douban:movie:hot`, `search:${query}`, `emby:${sourceKey}`. Different
   * filter states must produce different keys.
   */
  restoreKey?: string;
}

interface StoredSnapshot {
  v: 1;
  itemCount: number;
  scrollOffset: number;
  measurements: VirtualItem[];
  savedAt: number;
}

const STORAGE_PREFIX = 'lt:vgrid:';
const MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes
const MIN_ITEM_COUNT_RATIO = 0.5; // discard if itemCount differs by >50%

function loadSnapshot(key: string, currentItemCount: number): StoredSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSnapshot;
    if (parsed.v !== 1) return null;
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) return null;
    // Guard against item set changing drastically (different filter, fresh fetch, etc.)
    if (currentItemCount === 0) return null;
    const ratio = parsed.itemCount / currentItemCount;
    if (ratio < MIN_ITEM_COUNT_RATIO || ratio > 1 / MIN_ITEM_COUNT_RATIO) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveSnapshot(key: string, snapshot: StoredSnapshot): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(snapshot));
  } catch {
    // QuotaExceeded or storage disabled — silently skip
  }
}

/**
 * A virtualised grid that piggy-backs on CSS grid for column layout
 * and virtualises *rows* via @tanstack/react-virtual.
 *
 * Uses document.body as scroll element for window-level scrolling.
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
  restoreKey,
}: VirtualGridProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(3);
  const [scrollMargin, setScrollMargin] = useState(0);

  // Track parentRef's offsetTop so virtualizer knows where the container starts
  // relative to the body scroll origin. Must update after every layout change
  // (filters expanding/collapsing, responsive breakpoints, etc.).
  useLayoutEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const update = () => setScrollMargin(el.offsetTop);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(document.body);
    return () => ro.disconnect();
  }, []);

  // Detect column count from a hidden probe row that shares the same grid CSS
  const probeRef = useRef<HTMLDivElement>(null);

  const detectColumns = useCallback(() => {
    if (!probeRef.current) return;
    const style = window.getComputedStyle(probeRef.current);
    const cols = style.gridTemplateColumns.split(' ').length;
    if (cols > 0) setColumns(prev => (cols !== prev ? cols : prev));
  }, []);

  useEffect(() => {
    detectColumns();
    const ro = new ResizeObserver(detectColumns);
    if (probeRef.current) ro.observe(probeRef.current);
    return () => ro.disconnect();
  }, [detectColumns]);

  const rowCount = Math.ceil(items.length / columns);

  // Load a snapshot ONCE per mount, before the virtualizer is created.
  // useMemo with empty deps so a later restoreKey change does not reapply.
  const initialSnapshot = useMemo(
    () => (restoreKey ? loadSnapshot(restoreKey, rowCount) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => document.body,
    estimateSize: () => estimateRowHeight,
    overscan,
    scrollMargin,
    initialMeasurementsCache: initialSnapshot?.measurements,
    initialOffset: initialSnapshot?.scrollOffset,
    useScrollendEvent: true,
  });

  const virtualRows = virtualizer.getVirtualItems();

  // Persist on unmount and on pagehide.
  // Use a ref so the latest virtualizer / rowCount is captured at save time.
  const virtualizerRef = useRef(virtualizer);
  virtualizerRef.current = virtualizer;
  const rowCountRef = useRef(rowCount);
  rowCountRef.current = rowCount;

  useEffect(() => {
    if (!restoreKey) return;

    const persist = () => {
      const v = virtualizerRef.current;
      const measurements = v.takeSnapshot();
      if (!measurements || measurements.length === 0) return;

      saveSnapshot(restoreKey, {
        v: 1,
        itemCount: rowCountRef.current,
        scrollOffset: v.scrollOffset ?? 0,
        measurements,
        savedAt: Date.now(),
      });
    };

    window.addEventListener('pagehide', persist);
    return () => {
      window.removeEventListener('pagehide', persist);
      persist();
    };
  }, [restoreKey]);

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
    <DOMErrorBoundary componentName="VirtualGrid">
      {/* Hidden probe element to measure column count from computed CSS grid */}
      <div
        ref={probeRef}
        aria-hidden
        translate='no'
        className={`grid invisible h-0 overflow-hidden ${className}`}
      >
        <div />
      </div>

      <div
        ref={parentRef}
        translate='no'
        style={{
          height: virtualizer.getTotalSize(),
          width: '100%',
          position: 'relative',
        }}
      >
        {/* Container with unified offset - official pattern */}
        <div
          translate='no'
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            transform: `translateY(${(virtualRows[0]?.start ?? 0) - scrollMargin}px)`,
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
                translate='no'
                className={rowGapClass}
              >
                <div className={`grid ${className}`} translate='no'>
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
    </DOMErrorBoundary>
  );
}
