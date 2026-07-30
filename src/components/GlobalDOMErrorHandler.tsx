'use client';

import { useEffect } from 'react';

/**
 * Global error handler to catch DOM manipulation errors that escape React's
 * error boundaries. These typically come from browser translation extensions
 * that modify the DOM structure.
 */
export function GlobalDOMErrorHandler() {
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      const error = event.error;

      // Check if this is a DOM-related error from translation plugins
      const isDOMError =
        error?.name === 'NotFoundError' ||
        error?.message?.includes('removeChild') ||
        error?.message?.includes('The object can not be found here') ||
        error?.message?.includes('Node was not found') ||
        error?.message?.includes('Failed to execute \'removeChild\'');

      if (isDOMError) {
        console.warn('[GlobalDOMErrorHandler] Suppressed DOM error from translation plugin:', error);
        // Prevent the error from propagating and crashing the app
        event.preventDefault();
        return true;
      }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const error = event.reason;

      // Check if this is a DOM-related error
      const isDOMError =
        error?.name === 'NotFoundError' ||
        error?.message?.includes('removeChild') ||
        error?.message?.includes('The object can not be found here') ||
        error?.message?.includes('Node was not found');

      if (isDOMError) {
        console.warn('[GlobalDOMErrorHandler] Suppressed unhandled rejection from translation plugin:', error);
        event.preventDefault();
        return true;
      }
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  return null;
}
