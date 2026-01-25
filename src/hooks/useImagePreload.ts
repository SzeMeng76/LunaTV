import { useEffect, useRef } from 'react';

/**
 * Hook to preload images for better UX
 *
 * Features:
 * - Adds <link rel="preload"> tags for images that are about to enter the viewport
 * - Global deduplication to avoid redundant preloads
 * - Incremental addition mode (doesn't clear existing links on re-render)
 * - Prevents "preloaded but not used" browser warnings
 *
 * Inspired by DecoTV's optimization
 */

// Global set of preloaded URLs (avoid duplicate preloads across all components)
const preloadedUrls = new Set<string>();

export function useImagePreload(imageUrls: string[], enabled = true) {
  // Track preload links added by this component instance (for cleanup on unmount)
  const addedLinksRef = useRef<HTMLLinkElement[]>([]);

  // Incremental preload addition
  useEffect(() => {
    if (!enabled || !imageUrls.length) return;

    // Preload first few images
    const urlsToPreload = imageUrls.slice(0, Math.min(10, imageUrls.length));

    urlsToPreload.forEach((url) => {
      if (!url) return;

      // Clean and validate URL
      const cleanUrl = url.trim().replace(/["'>]/g, '');
      if (!cleanUrl) return;

      // Skip if already preloaded globally
      if (preloadedUrls.has(cleanUrl)) return;

      // Check if already exists in DOM using safe CSS.escape
      const existing = document.head.querySelector(
        `link[rel="preload"][href="${CSS.escape(cleanUrl)}"]`
      );
      if (existing) {
        preloadedUrls.add(cleanUrl);
        return;
      }

      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = cleanUrl;
      // Set fetch priority to low (not blocking visible content)
      (link as any).fetchPriority = 'low';

      document.head.appendChild(link);
      addedLinksRef.current.push(link);
      preloadedUrls.add(cleanUrl);
    });

    // Note: No cleanup here to avoid "preloaded but not used" warnings
  }, [imageUrls, enabled]);

  // Cleanup only on component unmount
  useEffect(() => {
    return () => {
      addedLinksRef.current.forEach((link) => {
        try {
          if (link.parentNode) {
            link.parentNode.removeChild(link);
          }
          // Remove from global set
          if (link.href) {
            preloadedUrls.delete(link.href);
          }
        } catch {
          // Ignore cleanup errors
        }
      });
      addedLinksRef.current = [];
    };
  }, []);
}
