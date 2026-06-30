'use client';

import { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // DOM removeChild errors come from browser translation/extension plugins
  // mutating React-managed nodes. Auto-reset silently instead of crashing.
  const isDOMError =
    error.name === 'NotFoundError' ||
    error.message?.includes('removeChild') ||
    error.message?.includes('The object can not be found here') ||
    error.message?.includes('Node was not found') ||
    error.message?.includes("Failed to execute 'removeChild'");

  useEffect(() => {
    if (isDOMError) {
      console.warn('[error.tsx] Suppressed DOM removeChild error (translation/extension):', error.message);
      reset();
      return;
    }

    // ChunkLoadError：新版本部署后旧 chunk 失效，自动硬刷新一次
    // 用 10s TTL 防止无限循环；超过 10s 才允许下一次自动刷新
    const isChunkError =
      error.name === 'ChunkLoadError' ||
      error.message?.includes('Failed to load chunk') ||
      error.message?.includes('Loading chunk') ||
      error.message?.includes('Loading CSS chunk');
    if (isChunkError) {
      const reloadKey = `chunk_reload_${window.location.pathname}`;
      const prev = sessionStorage.getItem(reloadKey);
      const now = Date.now();
      if (!prev || now - parseInt(prev, 10) > 10_000) {
        sessionStorage.setItem(reloadKey, String(now));
        window.location.reload();
        return;
      }
      // 10s 内已经刷新过仍然失败，落到错误 UI，不上报噪声
      console.warn('[ChunkLoadError] 自动刷新后仍失败，展示错误页', error.message);
      return;
    }

    // 记录崩溃详情到 localStorage
    const crashLog = {
      timestamp: new Date().toISOString(),
      message: error.message,
      stack: error.stack,
      digest: error.digest,
      url: window.location.href,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A',
      memory: (performance as any).memory ? {
        used: `${((performance as any).memory.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`,
        total: `${((performance as any).memory.totalJSHeapSize / 1024 / 1024).toFixed(2)} MB`,
        limit: `${((performance as any).memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2)} MB`,
      } : 'N/A',
      localStorage: (() => {
        let total = 0;
        for (let key in localStorage) {
          if (localStorage.hasOwnProperty(key)) {
            total += (localStorage[key].length + key.length) * 2;
          }
        }
        return `${(total / 1024).toFixed(2)} KB`;
      })(),
      type: 'PAGE_ERROR',
    };

    // 保存到 localStorage
    try {
      const existingLogs = localStorage.getItem('crash-logs');
      const logs = existingLogs ? JSON.parse(existingLogs) : [];
      logs.push(crashLog);

      // 只保留最近 10 条
      if (logs.length > 10) {
        logs.shift();
      }

      localStorage.setItem('crash-logs', JSON.stringify(logs));
    } catch (e) {
      console.error('无法保存崩溃日志:', e);
    }

    // 发送到服务器
    fetch('/api/crash-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(crashLog),
    }).catch((err) => {
      console.error('无法上报崩溃到服务器:', err);
    });

    // 打印到控制台
    console.error('🔥 页面崩溃:', crashLog);
  }, [error]);

  // Don't flash error UI while reset() is in flight for DOM errors
  if (isDOMError) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900 px-4 py-8">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 sm:p-8">
        <div className="text-center">
          <div className="text-5xl sm:text-6xl mb-3 sm:mb-4">💥</div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-2">
            页面出错了
          </h2>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mb-4 sm:mb-6">
            抱歉，页面遇到了一些问题
          </p>

          {process.env.NODE_ENV === 'development' && (
            <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-red-50 dark:bg-red-900/20 rounded-lg text-left">
              <p className="text-xs sm:text-sm font-mono text-red-600 dark:text-red-400 break-all">
                {error.message}
              </p>
            </div>
          )}

          <div className="space-y-2 sm:space-y-3">
            <button
              onClick={reset}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 sm:py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg transition-colors text-sm sm:text-base"
            >
              <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5" />
              重新加载
            </button>

            <button
              onClick={() => {
                window.location.href = '/crash-logs';
              }}
              className="w-full px-4 py-2.5 sm:py-3 bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-white rounded-lg transition-colors text-sm sm:text-base"
            >
              查看崩溃日志
            </button>

            <button
              onClick={() => {
                // 清理可能损坏的缓存
                const keysToKeep = ['auth-token', 'user-preferences'];
                for (let key in localStorage) {
                  if (!keysToKeep.includes(key) && key.startsWith('moontv_')) {
                    localStorage.removeItem(key);
                  }
                }
                window.location.href = '/';
              }}
              className="w-full px-4 py-2.5 sm:py-3 bg-gray-200 hover:bg-gray-300 active:bg-gray-400 dark:bg-gray-700 dark:hover:bg-gray-600 dark:active:bg-gray-500 text-gray-900 dark:text-white rounded-lg transition-colors text-sm sm:text-base"
            >
              清理缓存并返回首页
            </button>

            <button
              onClick={() => {
                const logs = localStorage.getItem('crash-logs');
                if (logs) {
                  const blob = new Blob([logs], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `crash-logs-${Date.now()}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }
              }}
              className="w-full px-4 py-2.5 sm:py-3 text-xs sm:text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              下载崩溃日志
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
