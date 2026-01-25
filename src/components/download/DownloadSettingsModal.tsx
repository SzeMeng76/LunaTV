'use client';

import React from 'react';
import type { DownloadSettings } from '@/contexts/DownloadContext';
import type { StreamSaverMode, StreamModeSupport } from '@/lib/download';
import { getStreamModeName, getStreamModeDescription } from '@/lib/download';

interface DownloadSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: DownloadSettings;
  setSettings: (settings: DownloadSettings) => void;
  streamModeSupport: StreamModeSupport;
}

export function DownloadSettingsModal({
  isOpen,
  onClose,
  settings,
  setSettings,
  streamModeSupport,
}: DownloadSettingsModalProps) {
  if (!isOpen) return null;

  const handleStreamModeChange = (mode: StreamSaverMode) => {
    setSettings({ ...settings, streamMode: mode });
  };

  return (
    <div className='fixed inset-0 z-[10000] overflow-y-auto'>
      <div className='flex items-center justify-center min-h-screen p-4'>
        {/* 背景遮罩 */}
        <div
          className='fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity'
          onClick={onClose}
        />

        {/* 模态框内容 */}
        <div className='relative bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-md border border-gray-200 dark:border-gray-700 overflow-hidden'>
          {/* 标题栏 */}
          <div className='flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700'>
            <h2 className='text-lg sm:text-xl font-bold text-gray-900 dark:text-white'>下载设置</h2>
            <button
              onClick={onClose}
              className='text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors active:scale-95'
            >
              <svg className='w-5 h-5 sm:w-6 sm:h-6' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M6 18L18 6M6 6l12 12' />
              </svg>
            </button>
          </div>

          {/* 设置内容 */}
          <div className='p-4 sm:p-6 space-y-6'>
            {/* 下载线程数 */}
            <div>
              <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
                下载线程数: <span className='text-blue-600 dark:text-blue-400'>{settings.concurrency}</span>
              </label>
              <input
                type='range'
                min='1'
                max='16'
                value={settings.concurrency}
                onChange={(e) => setSettings({ ...settings, concurrency: parseInt(e.target.value, 10) })}
                className='w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600'
              />
              <div className='flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1'>
                <span>1 线程</span>
                <span>16 线程</span>
              </div>
              <p className='text-xs text-gray-500 dark:text-gray-400 mt-2'>
                {settings.concurrency <= 4 && '线程数较少，下载速度可能较慢'}
                {settings.concurrency > 4 && settings.concurrency <= 8 && '推荐设置，平衡速度与稳定性'}
                {settings.concurrency > 8 && '高并发可能导致部分服务器限制或不稳定'}
              </p>
            </div>

            {/* 失败重试次数 */}
            <div>
              <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
                失败重试次数: <span className='text-blue-600 dark:text-blue-400'>{settings.maxRetries}</span>
              </label>
              <input
                type='range'
                min='0'
                max='10'
                value={settings.maxRetries}
                onChange={(e) => setSettings({ ...settings, maxRetries: parseInt(e.target.value, 10) })}
                className='w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600'
              />
              <div className='flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1'>
                <span>不重试</span>
                <span>10 次</span>
              </div>
            </div>

            {/* 下载模式 */}
            <div>
              <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3'>
                下载模式
              </label>
              <div className='space-y-3'>
                {/* 普通模式 */}
                <label className='flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all hover:bg-gray-50 dark:hover:bg-gray-700/50 border-gray-200 dark:border-gray-600 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50 dark:has-[:checked]:bg-blue-900/20'>
                  <input
                    type='radio'
                    name='streamMode'
                    value='disabled'
                    checked={settings.streamMode === 'disabled'}
                    onChange={() => handleStreamModeChange('disabled')}
                    className='mt-1 w-4 h-4 accent-blue-600'
                  />
                  <div className='flex-1'>
                    <div className='flex items-center gap-2'>
                      <span className='text-green-500 font-bold'>✓</span>
                      <span className='font-medium text-gray-900 dark:text-white'>
                        {getStreamModeName('disabled')}
                      </span>
                    </div>
                    <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                      {getStreamModeDescription('disabled')}
                    </p>
                  </div>
                </label>

                {/* Service Worker 模式 */}
                <label className={`flex items-start gap-3 p-3 rounded-lg border-2 transition-all ${
                  !streamModeSupport.serviceWorker
                    ? 'opacity-60 cursor-not-allowed bg-gray-50 dark:bg-gray-800/50'
                    : 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50'
                } border-gray-200 dark:border-gray-600 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50 dark:has-[:checked]:bg-blue-900/20`}>
                  <input
                    type='radio'
                    name='streamMode'
                    value='service-worker'
                    checked={settings.streamMode === 'service-worker'}
                    onChange={() => handleStreamModeChange('service-worker')}
                    disabled={!streamModeSupport.serviceWorker}
                    className='mt-1 w-4 h-4 accent-blue-600 disabled:cursor-not-allowed'
                  />
                  <div className='flex-1'>
                    <div className='flex items-center gap-2'>
                      {streamModeSupport.serviceWorker ? (
                        <span className='text-green-500 font-bold'>✓</span>
                      ) : (
                        <span className='text-red-500 font-bold'>✗</span>
                      )}
                      <span className={`font-medium ${!streamModeSupport.serviceWorker ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white'}`}>
                        {getStreamModeName('service-worker')}
                      </span>
                    </div>
                    <p className={`text-xs mt-1 ${!streamModeSupport.serviceWorker ? 'text-gray-400 dark:text-gray-500' : 'text-gray-500 dark:text-gray-400'}`}>
                      {streamModeSupport.serviceWorker
                        ? getStreamModeDescription('service-worker')
                        : '不支持：需要 HTTPS 或本地环境'}
                    </p>
                  </div>
                </label>

                {/* 文件系统直写模式 */}
                <label className={`flex items-start gap-3 p-3 rounded-lg border-2 transition-all ${
                  !streamModeSupport.fileSystem
                    ? 'opacity-60 cursor-not-allowed bg-gray-50 dark:bg-gray-800/50'
                    : 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50'
                } border-gray-200 dark:border-gray-600 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50 dark:has-[:checked]:bg-blue-900/20`}>
                  <input
                    type='radio'
                    name='streamMode'
                    value='file-system'
                    checked={settings.streamMode === 'file-system'}
                    onChange={() => handleStreamModeChange('file-system')}
                    disabled={!streamModeSupport.fileSystem}
                    className='mt-1 w-4 h-4 accent-blue-600 disabled:cursor-not-allowed'
                  />
                  <div className='flex-1'>
                    <div className='flex items-center gap-2'>
                      {streamModeSupport.fileSystem ? (
                        <span className='text-green-500 font-bold'>✓</span>
                      ) : (
                        <span className='text-red-500 font-bold'>✗</span>
                      )}
                      <span className={`font-medium ${!streamModeSupport.fileSystem ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white'}`}>
                        {getStreamModeName('file-system')}
                      </span>
                      {streamModeSupport.fileSystem && (
                        <span className='text-xs px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'>
                          推荐
                        </span>
                      )}
                    </div>
                    <p className={`text-xs mt-1 ${!streamModeSupport.fileSystem ? 'text-gray-400 dark:text-gray-500' : 'text-gray-500 dark:text-gray-400'}`}>
                      {streamModeSupport.fileSystem
                        ? getStreamModeDescription('file-system')
                        : '不支持：需要 Chrome/Edge 浏览器'}
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* 默认格式 */}
            <div>
              <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3'>
                默认保存格式
              </label>
              <div className='flex gap-4'>
                <label className='flex items-center gap-2 cursor-pointer'>
                  <input
                    type='radio'
                    name='defaultType'
                    value='TS'
                    checked={settings.defaultType === 'TS'}
                    onChange={() => setSettings({ ...settings, defaultType: 'TS' })}
                    className='w-4 h-4 accent-blue-600'
                  />
                  <span className='text-sm text-gray-700 dark:text-gray-300'>TS 格式</span>
                </label>
                <label className='flex items-center gap-2 cursor-pointer'>
                  <input
                    type='radio'
                    name='defaultType'
                    value='MP4'
                    checked={settings.defaultType === 'MP4'}
                    onChange={() => setSettings({ ...settings, defaultType: 'MP4' })}
                    className='w-4 h-4 accent-blue-600'
                  />
                  <span className='text-sm text-gray-700 dark:text-gray-300'>MP4 格式</span>
                </label>
              </div>
            </div>
          </div>

          {/* 底部按钮 */}
          <div className='p-4 sm:p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30'>
            <button
              onClick={onClose}
              className='w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors'
            >
              保存设置
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
