'use client';

import { useVirtualizer, type VirtualItem } from '@tanstack/react-virtual';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

interface VirtualGridProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  estimateRowHeight?: number;
  rowGapClass?: string;
  overscan?: number;
  className?: string;
  endReached?: () => void;
  endReachedThreshold?: number;
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
const MAX_AGE_MS = 30 * 60 * 1000;
const MIN_ITEM_COUNT_RATIO = 0.5;

function loadSnapshot(
  key: string,
  currentItemCount: number,
): StoredSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const snap: StoredSnapshot = JSON.parse(raw);
    if (snap.v !== 1) return null;
    if (Date.now() - snap.savedAt > MAX_AGE_MS) {
      sessionStorage.removeItem(STORAGE_PREFIX + key);
      return null;
    }
    if (snap.itemCount < currentItemCount * MIN_ITEM_COUNT_RATIO) return null;
    if (snap.itemCount > currentItemCount * 2) return null;
    return snap;
  } catch {
    return null;
  }
}

function saveSnapshot(key: string, snap: StoredSnapshot) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(snap));
  } catch {
    // quota exceeded – silently ignore
  }
}

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

  const initialSnapshot = useMemo(() => {
    if (!restoreKey) return null;
    return loadSnapshot(restoreKey, items.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restoreKey]);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => document.body,
    estimateSize: () => estimateRowHeight,
    overscan,
    ...(initialSnapshot
      ? {
          initialOffset: initialSnapshot.scrollOffset,
        }
      : {}),
  });

  // Restore measurement cache from snapshot
  useEffect(() => {
    if (!initialSnapshot || !restoreKey) return;
    const vc = virtualizer as any;
    if (vc.measurementsCache && initialSnapshot.measurements) {
      vc.measurementsCache = initialSnapshot.measurements;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save snapshot on unmount / before navigation
  useEffect(() => {
    if (!restoreKey) return;
    return () => {
      try {
        const vc = virtualizer as any;
        const measurements =
          typeof vc.takeSnapshot === 'function'
            ? vc.takeSnapshot().measurements
            : vc.measurementsCache || [];
        saveSnapshot(restoreKey, {
          v: 1,
          itemCount: items.length,
          scrollOffset: vc.scrollOffset ?? 0,
          measurements,
          savedAt: Date.now(),
        });
      } catch {
        // silently ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restoreKey, items.length]);

  const virtualRows = virtualizer.getVirtualItems();

  const lastVirtualRowRef = useRef<number>(-1);
  useEffect(() => {
    if (!endReached || virtualRows.length === 0) return;

    const lastVirtualRow = virtualRows[virtualRows.length - 1];
    const lastRowIndex = lastVirtualRow.index;

    const viewportHeight =
      typeof window !== 'undefined' ? window.innerHeight : 800;
    const visibleRows = Math.ceil(viewportHeight / estimateRowHeight);
    const dynamicThreshold = Math.max(
      visibleRows + endReachedThreshold,
      endReachedThreshold,
    );

    if (
      lastRowIndex >= rowCount - dynamicThreshold &&
      lastRowIndex !== lastVirtualRowRef.current
    ) {
      lastVirtualRowRef.current = lastRowIndex;
      endReached();
    }
  }, [
    virtualRows,
    rowCount,
    endReached,
    endReachedThreshold,
    estimateRowHeight,
  ]);

  return (
    <>
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
