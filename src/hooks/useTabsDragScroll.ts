import { useCallback, useRef, useState } from 'react';

interface DragState {
  isActive: boolean;
  startX: number;
  startScrollLeft: number;
  preventClickUntil: number;
}

export function useTabsDragScroll() {
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef<DragState>({
    isActive: false,
    startX: 0,
    startScrollLeft: 0,
    preventClickUntil: 0,
  });

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    // Only handle left mouse button
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    // Only exclude scroll buttons, allow drag on Tab buttons
    const target = event.target as HTMLElement;
    if (target.closest('.MuiTabScrollButton-root')) {
      return;
    }

    const container = event.currentTarget;
    const scrollContainer = container.querySelector('.MuiTabs-scroller') as HTMLElement;
    if (!scrollContainer) return;

    dragStateRef.current.isActive = true;
    dragStateRef.current.startX = event.clientX;
    dragStateRef.current.startScrollLeft = scrollContainer.scrollLeft;
    dragStateRef.current.preventClickUntil = 0;
    setIsDragging(false); // Don't set dragging yet

    // Don't capture pointer - it blocks Tab clicks
    // Don't prevent default - let Tab clicks work
  }, []);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState.isActive) return;

    const target = event.currentTarget;
    const scrollContainer = target.querySelector('.MuiTabs-scroller') as HTMLElement;
    if (!scrollContainer) return;

    const deltaX = event.clientX - dragState.startX;

    // If moved more than 6px, mark as dragging and prevent clicks
    if (Math.abs(deltaX) > 6) {
      dragState.preventClickUntil = Date.now() + 160;
      setIsDragging(true);
    }

    // Update scroll position
    scrollContainer.scrollLeft = dragState.startScrollLeft - deltaX;
  }, []);

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    // No need to release pointer capture since we don't capture it
    dragStateRef.current.isActive = false;
    setIsDragging(false);
  }, []);

  const handlePointerCancel = useCallback(() => {
    dragStateRef.current.isActive = false;
    setIsDragging(false);
  }, []);

  const shouldPreventClick = useCallback(() => {
    return Date.now() < dragStateRef.current.preventClickUntil;
  }, []);

  return {
    isDragging,
    shouldPreventClick,
    dragHandlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerCancel,
      onPointerLeave: handlePointerCancel,
    },
  };
}
