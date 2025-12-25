import { useEffect } from 'react';

/**
 * Hook to preload images for better UX
 * Adds <link rel="preload"> tags for images that are about to enter the viewport
 */
export function useImagePreload(imageUrls: string[], enabled = true) {
  useEffect(() => {
    if (!enabled || !imageUrls.length) return;

    const preloadLinks: HTMLLinkElement[] = [];

    // Preload first few images
    const urlsToPreload = imageUrls.slice(0, Math.min(10, imageUrls.length));

    urlsToPreload.forEach((url) => {
      if (!url) return;

      // Clean and validate URL
      const cleanUrl = url.trim().replace(/["'>]/g, '');
      if (!cleanUrl) return;

      // Check if already preloaded using a safer method
      const links = Array.from(document.head.querySelectorAll('link[rel="preload"]'));
      const existing = links.find(link => (link as HTMLLinkElement).href === cleanUrl);
      if (existing) return;

      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = cleanUrl;
      // Set fetch priority to low (not blocking visible content)
      (link as any).fetchPriority = 'low';

      document.head.appendChild(link);
      preloadLinks.push(link);
    });

    // Cleanup: remove preload links when component unmounts
    return () => {
      preloadLinks.forEach((link) => {
        if (link.parentNode) {
          link.parentNode.removeChild(link);
        }
      });
    };
  }, [imageUrls, enabled]);
}
