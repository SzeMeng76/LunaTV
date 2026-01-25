'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useCallback } from 'react';

/**
 * useTransitionNav - Hook for non-blocking navigation
 *
 * Uses React 18's startTransition to mark navigation as low-priority,
 * keeping the UI responsive during route changes.
 *
 * @example
 * ```tsx
 * const navigateWithTransition = useTransitionNav();
 *
 * <button onClick={() => navigateWithTransition('/page')}>
 *   Navigate
 * </button>
 * ```
 */
export function useTransitionNav() {
  const router = useRouter();

  const navigate = useCallback(
    (href: string) => {
      startTransition(() => {
        router.push(href);
      });
    },
    [router]
  );

  return navigate;
}
