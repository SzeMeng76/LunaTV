/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { Download } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { AdminConfig } from '@/lib/admin.types';

interface DownloadConfigProps {
  config: AdminConfig | null;
  refreshConfig: () => Promise<void>;
}

const DownloadConfig: React.FC<DownloadConfigProps> = ({
  config,
  refreshConfig,
}) => {
  const [enabled, setEnabled] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (config?.DownloadConfig) {
      setEnabled(config.DownloadConfig.enabled ?? true);
    }
  }, [config]);

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);

    try {
      const response = await fetch('/api/admin/download-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '保存失败');
      }

      setMessage({ type: 'success', text: '下载配置保存成功！' });
      await refreshConfig();

      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : '保存失败',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className='space-y-6'>
      {/* 消息提示 */}
      {message && (
        <div
          className={`p-4 rounded-lg ${
            message.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-800'
              : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* 功能说明 */}
      <div className='p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800'>
        <div className='flex items-start gap-3'>
          <Download className='text-blue-600 dark:text-blue-400 shrink-0 mt-1' size={20} />
          <div>
            <h3 className='text-sm font-semibold text-gray-900 dark:text-white mb-2'>
              M3U8客户端下载功能
            </h3>
            <ul className='text-sm text-gray-600 dark:text-gray-400 space-y-1'>
              <li>• 用户在浏览器中直接下载视频到本地</li>
              <li>• 支持M3U8格式视频的TS片段合并</li>
              <li>• 支持AES加密视频解密</li>
              <li>• 不占用服务器存储空间和带宽</li>
              <li>• 支持并发下载和自动重试</li>
            </ul>
          </div>
        </div>
      </div>

      {/* 功能开关 */}
      <div className='flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg'>
        <div>
          <h3 className='text-lg font-semibold text-gray-900 dark:text-white'>
            启用下载功能
          </h3>
          <p className='text-sm text-gray-600 dark:text-gray-400 mt-1'>
            开启后，播放页面将显示下载按钮
          </p>
        </div>
        <button
          onClick={() => setEnabled(!enabled)}
          className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
            enabled
              ? 'bg-green-600 dark:bg-green-600'
              : 'bg-gray-200 dark:bg-gray-700'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
              enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* 保存按钮 */}
      <div className='flex justify-end'>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className={`px-6 py-2 rounded-lg font-medium transition-colors ${
            isSaving
              ? 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed text-white'
              : 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white'
          }`}
        >
          {isSaving ? '保存中...' : '保存配置'}
        </button>
      </div>
    </div>
  );
};

export default DownloadConfig;
