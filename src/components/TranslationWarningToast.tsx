'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

/**
 * 检测并提示用户关闭浏览器翻译功能
 * 当检测到 DOM 错误时，如果频繁发生，显示友好提示
 */
export function TranslationWarningToast() {
  const [showWarning, setShowWarning] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // 检查用户是否已经永久关闭提示
    const permanentlyDismissed = localStorage.getItem('translation-warning-dismissed');
    if (permanentlyDismissed === 'true') {
      return;
    }

    let errorCount = 0;
    const ERROR_THRESHOLD = 3; // 3次错误后显示提示
    const TIME_WINDOW = 60000; // 60秒内

    const errorTimestamps: number[] = [];

    const handleError = (event: ErrorEvent) => {
      const error = event.error;

      const isDOMError =
        error?.name === 'NotFoundError' ||
        error?.message?.includes('removeChild') ||
        error?.message?.includes('The object can not be found here') ||
        error?.message?.includes('Node was not found');

      if (isDOMError) {
        const now = Date.now();
        errorTimestamps.push(now);

        // 清理超出时间窗口的记录
        while (errorTimestamps.length > 0 && now - errorTimestamps[0] > TIME_WINDOW) {
          errorTimestamps.shift();
        }

        // 如果在时间窗口内达到阈值，显示提示
        if (errorTimestamps.length >= ERROR_THRESHOLD && !dismissed) {
          setShowWarning(true);
          console.warn('[TranslationWarning] 检测到频繁的翻译插件冲突，显示用户提示');
        }
      }
    };

    window.addEventListener('error', handleError);

    return () => {
      window.removeEventListener('error', handleError);
    };
  }, [dismissed]);

  const handleDismiss = (permanent: boolean) => {
    setShowWarning(false);
    setDismissed(true);

    if (permanent) {
      localStorage.setItem('translation-warning-dismissed', 'true');
    }
  };

  if (!showWarning) return null;

  return (
    <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-[9999] max-w-md w-full mx-4 animate-slide-down">
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/30 dark:to-orange-900/30 border-2 border-amber-400 dark:border-amber-600 rounded-lg shadow-xl p-4">
        {/* 关闭按钮 */}
        <button
          onClick={() => handleDismiss(false)}
          className="absolute top-2 right-2 text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 transition-colors"
          aria-label="关闭"
        >
          <X className="w-5 h-5" />
        </button>

        {/* 标题 */}
        <div className="flex items-start gap-3 mb-3">
          <div className="flex-shrink-0 mt-0.5">
            <svg className="w-6 h-6 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-amber-900 dark:text-amber-100 mb-1">
              检测到浏览器翻译干扰
            </h3>
            <p className="text-sm text-amber-800 dark:text-amber-200 leading-relaxed mb-3">
              您的浏览器翻译功能可能影响页面正常显示。建议关闭自动翻译以获得最佳体验。
            </p>

            {/* 操作指南 */}
            <div className="bg-white/50 dark:bg-black/20 rounded p-3 mb-3 text-xs text-amber-900 dark:text-amber-100 space-y-1">
              <p className="font-medium mb-1">如何关闭：</p>
              <p>• <strong>Chrome/Edge：</strong>右键页面 → 取消"翻译为中文"</p>
              <p>• <strong>Safari：</strong>地址栏 → 点击"翻译"图标 → 关闭</p>
              <p>• <strong>插件：</strong>暂时禁用翻译扩展</p>
            </div>

            {/* 按钮 */}
            <div className="flex gap-2">
              <button
                onClick={() => handleDismiss(false)}
                className="flex-1 px-3 py-1.5 text-sm font-medium text-amber-700 dark:text-amber-300 bg-white dark:bg-gray-800 rounded hover:bg-amber-50 dark:hover:bg-gray-700 transition-colors"
              >
                知道了
              </button>
              <button
                onClick={() => handleDismiss(true)}
                className="flex-1 px-3 py-1.5 text-sm font-medium text-white bg-amber-600 dark:bg-amber-500 rounded hover:bg-amber-700 dark:hover:bg-amber-600 transition-colors"
              >
                不再提示
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
