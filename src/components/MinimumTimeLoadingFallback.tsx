'use client';

import { useEffect, useState } from 'react';
import { CinematicLoadingFallback } from './CinematicLoadingFallback';

/**
 * Loading wrapper with minimum display time
 *
 * Prevents jarring flashes by ensuring the loading screen
 * is displayed for at least 800ms, even if content loads faster.
 *
 * This improves UX by:
 * - Preventing disorienting quick flashes
 * - Giving users time to read the loading message
 * - Creating a smoother transition
 */
export function MinimumTimeLoadingFallback() {
  const [shouldShow, setShouldShow] = useState(true);

  useEffect(() => {
    // Keep loading screen visible for at least 800ms
    const timer = setTimeout(() => {
      setShouldShow(false);
    }, 800);

    return () => clearTimeout(timer);
  }, []);

  // If content loads before 800ms, still show loading
  // If content loads after 800ms, this component will unmount naturally
  if (!shouldShow) {
    return null;
  }

  return <CinematicLoadingFallback />;
}
