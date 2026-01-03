'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { startTransition, type MouseEvent, type ReactNode } from 'react';

interface FastLinkProps {
  href: string;
  children: ReactNode;
  className?: string;
  /**
   * Force a full page refresh instead of SPA navigation.
   * Useful for pages that need to bypass React's rendering pipeline.
   */
  forceRefresh?: boolean;
  /**
   * Use React 18's startTransition to mark navigation as non-blocking.
   * Keeps the UI responsive during navigation.
   */
  useTransitionNav?: boolean;
  /**
   * Additional onClick handler
   */
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
  /**
   * Accessibility label
   */
  'aria-label'?: string;
  /**
   * Target attribute for opening in new tab
   */
  target?: string;
  /**
   * Rel attribute for security when using target="_blank"
   */
  rel?: string;
}

/**
 * FastLink - High-performance navigation component
 *
 * Supports three navigation modes:
 * 1. Default: SPA navigation with prefetch disabled
 * 2. forceRefresh: Hard browser navigation bypassing React
 * 3. useTransitionNav: Non-blocking navigation using React 18's startTransition
 */
export function FastLink({
  href,
  children,
  className,
  forceRefresh = false,
  useTransitionNav = false,
  onClick,
  'aria-label': ariaLabel,
  target,
  rel,
}: FastLinkProps) {
  const router = useRouter();

  // Handle click events
  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    // Call custom onClick handler if provided
    onClick?.(e);

    // Respect modifier keys for opening in new tabs
    const isModifiedClick =
      e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || target === '_blank';

    if (isModifiedClick) {
      // Let the browser handle modified clicks naturally
      return;
    }

    // External links - let browser handle naturally
    if (href.startsWith('http://') || href.startsWith('https://')) {
      return;
    }

    // Prevent default navigation
    e.preventDefault();

    // Mode 1: Force refresh - bypass React entirely
    if (forceRefresh) {
      window.location.assign(href);
      return;
    }

    // Mode 2: Transition navigation - non-blocking
    if (useTransitionNav) {
      startTransition(() => {
        router.push(href);
      });
      return;
    }

    // Mode 3: Default - standard Next.js navigation
    router.push(href);
  };

  return (
    <Link
      href={href}
      onClick={handleClick}
      className={className}
      prefetch={false}
      aria-label={ariaLabel}
      target={target}
      rel={target === '_blank' ? rel || 'noopener noreferrer' : rel}
    >
      {children}
    </Link>
  );
}
