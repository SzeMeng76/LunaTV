'use client';

import { useEffect, useState } from 'react';
import { Trash2, Download, AlertTriangle } from 'lucide-react';
import PageLayout from '@/components/PageLayout';

interface CrashLog {
  timestamp: string;
  message: string;
  stack?: string;
  digest?: string;
  url: string;
  userAgent: string;
  memory: any;
  localStorage: string;
  type?: string; // 新增：错误类型
  errorName?: string; // 新增：错误名称
  errorSource?: string; // 新增：错误来源
  componentName?: string; // 新增：组件名称
  additionalInfo?: any; // 新增：额外信息
}

export default function CrashLogsPage() {
  const [logs, setLogs] = useState<CrashLog[]>([]);
  const [selectedLog, setSelectedLog] = useState<CrashLog | null>(null);

  useEffect(() => {
    // 从服务器获取崩溃日志
    fetch('/api/crash-report')
      .then((res) => res.json())
      .then((data) => {
        if (data.crashLogs) {
          setLogs(data.crashLogs);
        }
      })
      .catch((err) => {
        console.error('获取崩溃日志失败:', err);
        // 降级到 localStorage
        const storedLogs = localStorage.getItem('crash-logs');
        if (storedLogs) {
          try {
            setLogs(JSON.parse(storedLogs));
          } catch (e) {
            console.error('无法解析崩溃日志:', e);
          }
        }
      });
  }, []);

  const clearLogs = () => {
    if (confirm('确定要清除所有崩溃日志吗？')) {
      // 清除服务器端日志
      fetch('/api/crash-report', { method: 'DELETE' })
        .then(() => {
          // 同时清除 localStorage
          localStorage.removeItem('crash-logs');
          setLogs([]);
          setSelectedLog(null);
        })
        .catch((err) => {
          console.error('清除崩溃日志失败:', err);
          alert('清除失败，请稍后重试');
        });
    }
  };

  const downloadLogs = () => {
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `crash-logs-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <PageLayout>
      <div className="container mx-auto px-4 py-4 sm:py-8 max-w-6xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex items-center gap-2 sm:gap-3">
            <AlertTriangle className="w-6 h-6 sm:w-8 sm:h-8 text-red-500 flex-shrink-0" />
            <h1 className="text-2xl sm:text-3xl font-bold">崩溃日志</h1>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            {logs.length > 0 && (
              <>
                <button
                  onClick={downloadLogs}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg transition-colors text-sm sm:text-base"
                >
                  <Download className="w-4 h-4" />
                  <span>下载日志</span>
                </button>
                <button
                  onClick={clearLogs}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white rounded-lg transition-colors text-sm sm:text-base"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>清除日志</span>
                </button>
              </>
            )}
          </div>
        </div>

        {logs.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">暂无崩溃日志</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            {/* 日志列表 */}
            <div className="space-y-2 sm:space-y-3">
              <h2 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4">
                崩溃记录 ({logs.length})
              </h2>
              {logs.map((log, index) => (
                <div
                  key={index}
                  onClick={() => setSelectedLog(log)}
                  className={`p-3 sm:p-4 rounded-lg cursor-pointer transition-colors ${
                    selectedLog === log
                      ? 'bg-blue-100 dark:bg-blue-900/30 border-2 border-blue-500'
                      : 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 border-2 border-transparent'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-xs sm:text-sm font-mono text-gray-600 dark:text-gray-400">
                      {new Date(log.timestamp).toLocaleString('zh-CN')}
                    </span>
                    {log.type && (
                      <span className="text-xs px-2 py-0.5 rounded bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300">
                        {log.type}
                      </span>
                    )}
                  </div>
                  <p className="text-xs sm:text-sm font-semibold text-red-600 dark:text-red-400 truncate">
                    {log.message}
                  </p>
                  {log.componentName && (
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                      组件: {log.componentName}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2 sm:gap-4 text-xs text-gray-500 dark:text-gray-500">
                    <span>内存: {typeof log.memory === 'object' ? log.memory.used : log.memory}</span>
                    <span>存储: {log.localStorage}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* 日志详情 */}
            <div className="lg:sticky lg:top-4 lg:self-start">
              {selectedLog ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 sm:p-6 space-y-3 sm:space-y-4">
                  <h2 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4">详细信息</h2>

                  {selectedLog.type && (
                    <div>
                      <h3 className="text-xs sm:text-sm font-semibold text-gray-600 dark:text-gray-400 mb-1">
                        错误类型
                      </h3>
                      <p className="text-xs sm:text-sm font-mono">
                        {selectedLog.type}
                      </p>
                    </div>
                  )}

                  {selectedLog.componentName && (
                    <div>
                      <h3 className="text-xs sm:text-sm font-semibold text-gray-600 dark:text-gray-400 mb-1">
                        组件名称
                      </h3>
                      <p className="text-xs sm:text-sm font-mono text-blue-600 dark:text-blue-400">
                        {selectedLog.componentName}
                      </p>
                    </div>
                  )}

                  {selectedLog.errorSource && (
                    <div>
                      <h3 className="text-xs sm:text-sm font-semibold text-gray-600 dark:text-gray-400 mb-1">
                        错误来源
                      </h3>
                      <p className="text-xs sm:text-sm font-mono">
                        {selectedLog.errorSource}
                      </p>
                    </div>
                  )}

                  <div>
                    <h3 className="text-xs sm:text-sm font-semibold text-gray-600 dark:text-gray-400 mb-1">
                      时间
                    </h3>
                    <p className="text-xs sm:text-sm font-mono">
                      {new Date(selectedLog.timestamp).toLocaleString('zh-CN')}
                    </p>
                  </div>

                  <div>
                    <h3 className="text-xs sm:text-sm font-semibold text-gray-600 dark:text-gray-400 mb-1">
                      错误信息
                    </h3>
                    <p className="text-xs sm:text-sm font-mono text-red-600 dark:text-red-400 break-all">
                      {selectedLog.message}
                    </p>
                  </div>

                  <div>
                    <h3 className="text-xs sm:text-sm font-semibold text-gray-600 dark:text-gray-400 mb-1">
                      页面 URL
                    </h3>
                    <p className="text-xs sm:text-sm font-mono break-all">{selectedLog.url}</p>
                  </div>

                  <div>
                    <h3 className="text-xs sm:text-sm font-semibold text-gray-600 dark:text-gray-400 mb-1">
                      内存使用
                    </h3>
                    <p className="text-xs sm:text-sm font-mono">
                      {typeof selectedLog.memory === 'object'
                        ? `${selectedLog.memory.used} / ${selectedLog.memory.limit}`
                        : selectedLog.memory}
                    </p>
                  </div>

                  <div>
                    <h3 className="text-xs sm:text-sm font-semibold text-gray-600 dark:text-gray-400 mb-1">
                      localStorage 使用
                    </h3>
                    <p className="text-xs sm:text-sm font-mono">{selectedLog.localStorage}</p>
                  </div>

                  {selectedLog.additionalInfo && (
                    <div>
                      <h3 className="text-xs sm:text-sm font-semibold text-gray-600 dark:text-gray-400 mb-1">
                        额外信息
                      </h3>
                      <pre className="text-xs font-mono bg-gray-100 dark:bg-gray-900 p-2 sm:p-3 rounded overflow-x-auto max-h-32 overflow-y-auto">
                        {JSON.stringify(selectedLog.additionalInfo, null, 2)}
                      </pre>
                    </div>
                  )}

                  {selectedLog.stack && (
                    <div>
                      <h3 className="text-xs sm:text-sm font-semibold text-gray-600 dark:text-gray-400 mb-1">
                        堆栈跟踪
                      </h3>
                      <pre className="text-xs font-mono bg-gray-100 dark:bg-gray-900 p-2 sm:p-3 rounded overflow-x-auto max-h-48 sm:max-h-64 overflow-y-auto">
                        {selectedLog.stack}
                      </pre>
                    </div>
                  )}

                  {selectedLog.digest && (
                    <div>
                      <h3 className="text-xs sm:text-sm font-semibold text-gray-600 dark:text-gray-400 mb-1">
                        Digest
                      </h3>
                      <p className="text-xs sm:text-sm font-mono">{selectedLog.digest}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6 text-center text-sm sm:text-base text-gray-600 dark:text-gray-400">
                  选择一条日志查看详情
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
