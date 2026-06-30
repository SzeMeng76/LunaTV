'use client';

import { useEffect } from 'react';

/**
 * Global error handler to catch DOM manipulation errors that escape React's
 * error boundaries. These typically come from browser translation extensions
 * that modify the DOM structure.
 */
export function GlobalDOMErrorHandler() {
  useEffect(() => {
    const sendCrashReport = (data: any) => {
      const payload = JSON.stringify({
        ...data,
        // 添加更多诊断信息
        browserInfo: {
          language: navigator.language,
          languages: navigator.languages,
          platform: navigator.platform,
          vendor: navigator.vendor,
          cookieEnabled: navigator.cookieEnabled,
        },
        documentInfo: {
          readyState: document.readyState,
          visibilityState: document.visibilityState,
          title: document.title,
        },
        windowInfo: {
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio,
        },
        // 检测可能的翻译插件特征
        translationDetection: {
          hasGoogleTranslate: !!document.querySelector('iframe[src*="translate.google"]'),
          hasTranslateTag: !!document.querySelector('html[translate]'),
          hasFontTags: document.getElementsByTagName('font').length > 0,
          hasTranslateClass: !!document.querySelector('[class*="translated"]'),
        },
      });
      // 使用 sendBeacon 优先（更可靠），降级到 fetch
      const sent = navigator.sendBeacon?.('/api/crash-report', new Blob([payload], { type: 'application/json' }));

      if (!sent) {
        // sendBeacon 失败或不支持，降级到 fetch
        fetch('/api/crash-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true,
        }).catch((err) => {
          console.error('[GlobalDOMErrorHandler] Failed to send crash report:', err);
        });
      }
    };

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

        // 使用 queueMicrotask 异步发送，避免阻塞错误处理
        queueMicrotask(() => {
          sendCrashReport({
            type: 'DOM_ERROR',
            message: error?.message || 'Unknown DOM error',
            stack: error?.stack || '',
            url: window.location.href,
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString(),
            errorName: error?.name || 'Unknown',
            errorSource: 'GlobalDOMErrorHandler',
            additionalInfo: {
              filename: event.filename,
              lineno: event.lineno,
              colno: event.colno,
              translationDetected: true,
            },
          });
        });

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

        // 使用 queueMicrotask 异步发送
        queueMicrotask(() => {
          sendCrashReport({
            type: 'DOM_ERROR_REJECTION',
            message: error?.message || 'Unknown DOM error (Promise rejection)',
            stack: error?.stack || '',
            url: window.location.href,
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString(),
            errorName: error?.name || 'Unknown',
            errorSource: 'GlobalDOMErrorHandler (Promise)',
            additionalInfo: {
              translationDetected: true,
              promiseRejection: true,
            },
          });
        });

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
