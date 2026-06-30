'use client';

import React, { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  componentName?: string; // 用于标识是哪个组件
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary to catch DOM manipulation errors caused by browser translation
 * extensions (Safari built-in, Google Translate, Immersive Translate, etc.).
 *
 * These extensions wrap text nodes in <font> tags and relocate them, causing
 * React to throw NotFoundError ("The object can not be found here") during
 * removeChild operations when unmounting components.
 */
export class DOMErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    // Check if this is a DOM-related error from translation plugins
    const isDOMError =
      error.name === 'NotFoundError' ||
      error.message.includes('removeChild') ||
      error.message.includes('The object can not be found here') ||
      error.message.includes('Node was not found');

    if (isDOMError) {
      console.warn('[DOMErrorBoundary] Caught DOM manipulation error (likely from translation plugin):', error);
      // Don't show error UI for translation-related errors, just recover silently
      return { hasError: false, error: null };
    }

    // For other errors, show the error UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const isDOMError =
      error.name === 'NotFoundError' ||
      error.message.includes('removeChild') ||
      error.message.includes('The object can not be found here');

    if (isDOMError) {
      // Log for debugging but don't crash the app
      console.warn('[DOMErrorBoundary] Translation plugin caused DOM error, recovering...', {
        error: error.message,
        componentStack: errorInfo.componentStack,
        componentName: this.props.componentName,
      });

      // 使用 queueMicrotask 异步发送，避免阻塞错误恢复
      queueMicrotask(() => {
        this.sendCrashReport({
          type: 'DOM_ERROR_BOUNDARY',
          message: error.message,
          stack: error.stack || '',
          errorName: error.name,
          errorSource: 'DOMErrorBoundary',
          componentName: this.props.componentName || 'Unknown',
          additionalInfo: {
            componentStack: errorInfo.componentStack,
            translationDetected: true,
          },
        });
      });
    } else {
      // Log other errors normally
      console.error('[DOMErrorBoundary] Caught error:', error, errorInfo);

      // 使用 queueMicrotask 异步发送
      queueMicrotask(() => {
        this.sendCrashReport({
          type: 'ERROR_BOUNDARY',
          message: error.message,
          stack: error.stack || '',
          errorName: error.name,
          errorSource: 'DOMErrorBoundary',
          componentName: this.props.componentName || 'Unknown',
          additionalInfo: {
            componentStack: errorInfo.componentStack,
          },
        });
      });
    }
  }

  private sendCrashReport(data: {
    type: string;
    message: string;
    stack: string;
    errorName: string;
    errorSource: string;
    componentName: string;
    additionalInfo: any;
  }) {
    // 只在浏览器环境发送
    if (typeof window === 'undefined') return;

    const crashReport = {
      ...data,
      url: window.location.href,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
    };

    // 使用 sendBeacon 优先（更可靠），降级到 fetch
    const payload = JSON.stringify(crashReport);
    const sent = navigator.sendBeacon?.('/api/crash-report', new Blob([payload], { type: 'application/json' }));

    if (!sent) {
      // sendBeacon 失败或不支持，降级到 fetch
      fetch('/api/crash-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        // 使用 keepalive 确保即使页面关闭也能发送
        keepalive: true,
      }).catch((err) => {
        console.error('[DOMErrorBoundary] Failed to send crash report:', err);
      });
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="flex items-center justify-center min-h-[200px] p-4">
          <div className="text-center">
            <p className="text-red-500 mb-2">出现错误</p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              重试
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
