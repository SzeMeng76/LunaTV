/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import { AlertCircle, CheckCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

import { AdminConfig } from '@/lib/admin.types';

interface ShortDramaConfigProps {
  config: AdminConfig | null;
  refreshConfig: () => Promise<void>;
}

const ShortDramaConfig = ({ config, refreshConfig }: ShortDramaConfigProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [shortDramaSettings, setShortDramaSettings] = useState({
    primaryApiUrl: 'https://wwzy.tv/api.php/provide/vod',
    alternativeApiUrl: '',
    enableAlternative: false,
  });

  // 从config加载设置
  useEffect(() => {
    if (config?.ShortDramaConfig) {
      setShortDramaSettings({
        primaryApiUrl: config.ShortDramaConfig.primaryApiUrl || 'https://wwzy.tv/api.php/provide/vod',
        alternativeApiUrl: config.ShortDramaConfig.alternativeApiUrl || '',
        enableAlternative: config.ShortDramaConfig.enableAlternative ?? false,
      });
    }
  }, [config]);

  // 显示消息
  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  // 保存短剧配置
  const handleSave = async () => {
    // 基本验证
    if (!shortDramaSettings.primaryApiUrl.trim()) {
      showMessage('error', '请填写主API地址');
      return;
    }

    if (shortDramaSettings.enableAlternative && !shortDramaSettings.alternativeApiUrl.trim()) {
      showMessage('error', '启用备用API时必须填写备用API地址');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/shortdrama', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(shortDramaSettings)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '保存失败');
      }

      showMessage('success', '短剧API配置保存成功');
      await refreshConfig();
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : '保存失败');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className='space-y-6'>
      {/* 消息提示 */}
      {message && (
        <div className={`flex items-center space-x-2 p-3 rounded-lg ${
          message.type === 'success'
            ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800'
            : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle className="h-5 w-5" />
          ) : (
            <AlertCircle className="h-5 w-5" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* 基础设置 */}
      <div className='bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 shadow-sm'>
        <div className='mb-6'>
          <h3 className='text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2'>短剧API配置</h3>
          <div className='flex items-center space-x-2 text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded-lg'>
            <svg className='h-4 w-4' fill='currentColor' viewBox='0 0 20 20'>
              <path fillRule='evenodd' d='M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z' clipRule='evenodd' />
            </svg>
            <span>🎬 配置短剧视频的解析API，支持主API和备用API自动切换</span>
          </div>
        </div>

        {/* 主API地址 */}
        <div className='mb-6'>
          <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
            主API地址
          </label>
          <input
            type='text'
            value={shortDramaSettings.primaryApiUrl}
            onChange={(e) => setShortDramaSettings(prev => ({ ...prev, primaryApiUrl: e.target.value }))}
            className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
            placeholder='https://wwzy.tv/api.php/provide/vod'
          />
          <p className='mt-1 text-xs text-gray-500 dark:text-gray-400'>
            主要的短剧视频解析API地址，默认优先使用此API
          </p>
        </div>

        {/* 启用备用API开关 */}
        <div className='mb-6'>
          <label className='flex items-center cursor-pointer'>
            <input
              type='checkbox'
              className='sr-only'
              checked={shortDramaSettings.enableAlternative}
              onChange={(e) => setShortDramaSettings(prev => ({ ...prev, enableAlternative: e.target.checked }))}
            />
            <div className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              shortDramaSettings.enableAlternative
                ? 'bg-green-600'
                : 'bg-gray-200 dark:bg-gray-600'
            }`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                shortDramaSettings.enableAlternative ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </div>
            <span className='ml-3 text-sm font-medium text-gray-900 dark:text-gray-100'>
              启用备用API自动切换
            </span>
          </label>
          <p className='mt-1 text-sm text-gray-500 dark:text-gray-400'>
            开启后，当主API失败时会自动尝试使用备用API解析视频
          </p>
        </div>

        {/* 备用API地址 - 仅在启用时显示 */}
        {shortDramaSettings.enableAlternative && (
          <div className='mb-6'>
            <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
              备用API地址 <span className='text-red-500'>*</span>
            </label>
            <input
              type='password'
              value={shortDramaSettings.alternativeApiUrl}
              onChange={(e) => setShortDramaSettings(prev => ({ ...prev, alternativeApiUrl: e.target.value }))}
              className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
              placeholder='https://...'
            />
            <div className='mt-2 space-y-2'>
              <p className='text-xs text-gray-500 dark:text-gray-400'>
                当主API不可用时使用的备用解析API地址
              </p>
              <div className='p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg'>
                <p className='text-yellow-700 dark:text-yellow-300 text-xs font-medium mb-1'>🔒 隐私保护</p>
                <p className='text-yellow-700 dark:text-yellow-300 text-xs'>
                  • 备用API地址<strong>仅存储在服务器</strong>，不会暴露给前端用户
                </p>
                <p className='text-yellow-700 dark:text-yellow-300 text-xs'>
                  • 该配置<strong>不会包含在</strong>配置导出或TVBox订阅中
                </p>
                <p className='text-yellow-700 dark:text-yellow-300 text-xs'>
                  • 推荐用于<strong>私有API</strong>或<strong>付费API</strong>地址
                </p>
              </div>
              <div className='p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg'>
                <p className='text-blue-700 dark:text-blue-300 text-xs font-medium mb-1'>💡 工作原理</p>
                <p className='text-blue-700 dark:text-blue-300 text-xs'>
                  1. 首先尝试使用<strong>主API</strong>解析视频
                </p>
                <p className='text-blue-700 dark:text-blue-300 text-xs'>
                  2. 如果主API失败或超时，自动切换到<strong>备用API</strong>
                </p>
                <p className='text-blue-700 dark:text-blue-300 text-xs'>
                  3. 备用API需要剧名参数，确保更精准的匹配
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 操作按钮 */}
      <div className='flex flex-wrap gap-3'>
        <button
          onClick={handleSave}
          disabled={isLoading}
          className='flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors'
        >
          <svg className='h-4 w-4 mr-2' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M5 13l4 4L19 7' />
          </svg>
          {isLoading ? '保存中...' : '保存配置'}
        </button>
      </div>
    </div>
  );
};

export default ShortDramaConfig;
