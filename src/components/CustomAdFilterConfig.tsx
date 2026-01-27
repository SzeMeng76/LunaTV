/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import { AlertCircle, CheckCircle, Code, Info } from 'lucide-react';
import { useEffect, useState } from 'react';

import { AdminConfig } from '@/lib/admin.types';

interface CustomAdFilterConfigProps {
  config: AdminConfig | null;
  refreshConfig: () => Promise<void>;
}

const CustomAdFilterConfig = ({ config, refreshConfig }: CustomAdFilterConfigProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [filterSettings, setFilterSettings] = useState({
    customAdFilterCode: '',
    customAdFilterVersion: 1,
  });

  // 从config加载设置
  useEffect(() => {
    if (config?.SiteConfig) {
      setFilterSettings({
        customAdFilterCode: config.SiteConfig.CustomAdFilterCode || '',
        customAdFilterVersion: config.SiteConfig.CustomAdFilterVersion || 1,
      });
    }
  }, [config]);

  // 显示消息
  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  // 保存配置
  const handleSave = async () => {
    setIsLoading(true);
    try {
      if (!config) {
        throw new Error('配置未加载');
      }

      // 合并完整的 AdminConfig（参考 MoonTVPlus）
      const updatedConfig = {
        ...config,
        SiteConfig: {
          ...config.SiteConfig,
          CustomAdFilterCode: filterSettings.customAdFilterCode,
          CustomAdFilterVersion: filterSettings.customAdFilterVersion,
        }
      };

      const response = await fetch('/api/admin/config', {
        method: 'POST',  // 改为 POST
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedConfig)  // 发送完整配置
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || '保存失败');
      }

      showMessage('success', '自定义去广告配置已保存');
      await refreshConfig();
    } catch (error: any) {
      showMessage('error', error.message || '保存失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 重置输入框（不保存）
  const handleReset = () => {
    setFilterSettings({
      customAdFilterCode: '',
      customAdFilterVersion: 1,
    });
  };

  // 恢复默认并保存到数据库
  const handleRestoreDefault = async () => {
    setIsLoading(true);
    try {
      if (!config) {
        throw new Error('配置未加载');
      }

      // 合并完整的 AdminConfig，重置自定义去广告配置
      const updatedConfig = {
        ...config,
        SiteConfig: {
          ...config.SiteConfig,
          CustomAdFilterCode: '',
          CustomAdFilterVersion: 1,
        }
      };

      const response = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedConfig)
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || '恢复默认失败');
      }

      setFilterSettings({
        customAdFilterCode: '',
        customAdFilterVersion: 1,
      });

      showMessage('success', '已恢复为默认配置');
      await refreshConfig();
    } catch (error: any) {
      showMessage('error', error.message || '恢复默认失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 默认示例代码
  const defaultExample = `// 自定义去广告函数
// 参数: type (播放源key), m3u8Content (m3u8文件内容)
// 返回: 过滤后的m3u8内容

function filterAdsFromM3U8(type, m3u8Content) {
  if (!m3u8Content) return '';

  // 广告关键字列表
  const adKeywords = [
    'sponsor',
    '/ad/',
    '/ads/',
    'advert',
    'advertisement',
    '/adjump',
    'redtraffic'
  ];

  // 按行分割M3U8内容
  const lines = m3u8Content.split('\\n');
  const filteredLines = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // 跳过 #EXT-X-DISCONTINUITY 标识
    if (line.includes('#EXT-X-DISCONTINUITY')) {
      i++;
      continue;
    }

    // 如果是 EXTINF 行，检查下一行 URL 是否包含广告关键字
    if (line.includes('#EXTINF:')) {
      // 检查下一行 URL 是否包含广告关键字
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        const containsAdKeyword = adKeywords.some(keyword =>
          nextLine.toLowerCase().includes(keyword.toLowerCase())
        );

        if (containsAdKeyword) {
          // 跳过 EXTINF 行和 URL 行
          i += 2;
          continue;
        }
      }
    }

    // 保留当前行
    filteredLines.push(line);
    i++;
  }

  return filteredLines.join('\\n');
}`;

  return (
    <div className='space-y-6'>
      {/* 标题和说明 */}
      <div className='flex items-start gap-3'>
        <Code className='w-6 h-6 text-purple-500 shrink-0 mt-1' />
        <div className='flex-1'>
          <h3 className='text-lg font-semibold text-gray-900 dark:text-gray-100'>
            自定义去广告代码
          </h3>
          <p className='text-sm text-gray-600 dark:text-gray-400 mt-1'>
            编写自定义 JavaScript 代码来实现更强力的去广告功能
          </p>
        </div>
      </div>

      {/* 信息提示 */}
      <div className='bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4'>
        <div className='flex items-start gap-3'>
          <Info className='w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5' />
          <div className='text-sm text-blue-800 dark:text-blue-200'>
            <p className='font-medium mb-2'>使用说明：</p>
            <ul className='space-y-1 list-disc list-inside'>
              <li>函数名必须为 <code className='px-1 py-0.5 bg-blue-100 dark:bg-blue-800 rounded'>filterAdsFromM3U8</code></li>
              <li>接收两个参数：<code className='px-1 py-0.5 bg-blue-100 dark:bg-blue-800 rounded'>type</code>（播放源key）和 <code className='px-1 py-0.5 bg-blue-100 dark:bg-blue-800 rounded'>m3u8Content</code>（m3u8内容）</li>
              <li>必须返回过滤后的 m3u8 内容字符串</li>
              <li>如果代码执行失败，将自动降级使用默认去广告规则</li>
              <li>修改代码后记得更新版本号，让浏览器刷新缓存</li>
            </ul>
          </div>
        </div>
      </div>

      {/* 版本号 */}
      <div>
        <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
          代码版本号
        </label>
        <input
          type='number'
          min='1'
          value={filterSettings.customAdFilterVersion}
          onChange={(e) => setFilterSettings({
            ...filterSettings,
            customAdFilterVersion: parseInt(e.target.value) || 1
          })}
          className='w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent'
          placeholder='1'
        />
        <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
          每次修改代码后建议递增版本号
        </p>
      </div>

      {/* 代码编辑器 */}
      <div>
        <div className='flex items-center justify-between mb-2'>
          <label className='block text-sm font-medium text-gray-700 dark:text-gray-300'>
            自定义代码
          </label>
          <button
            onClick={() => setFilterSettings({ ...filterSettings, customAdFilterCode: defaultExample })}
            className='text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300'
          >
            载入示例代码
          </button>
        </div>
        <textarea
          value={filterSettings.customAdFilterCode}
          onChange={(e) => setFilterSettings({ ...filterSettings, customAdFilterCode: e.target.value })}
          className='w-full h-96 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none'
          placeholder={defaultExample}
        />
        <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
          支持纯 JavaScript 代码，不支持 TypeScript 类型注解
        </p>
      </div>

      {/* 消息提示 */}
      {message && (
        <div className={`flex items-center gap-2 p-4 rounded-lg ${
          message.type === 'success'
            ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-800'
            : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle className='w-5 h-5 shrink-0' />
          ) : (
            <AlertCircle className='w-5 h-5 shrink-0' />
          )}
          <span className='text-sm'>{message.text}</span>
        </div>
      )}

      {/* 操作按钮 */}
      <div className='flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700'>
        <button
          onClick={handleSave}
          disabled={isLoading}
          className='px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white rounded-lg font-medium transition-colors'
        >
          {isLoading ? '保存中...' : '保存配置'}
        </button>
        <button
          onClick={handleReset}
          disabled={isLoading}
          className='px-4 py-2 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors'
        >
          重置
        </button>
        <button
          onClick={handleRestoreDefault}
          disabled={isLoading}
          className='px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 text-white rounded-lg font-medium transition-colors'
        >
          {isLoading ? '恢复中...' : '恢复默认'}
        </button>
      </div>
    </div>
  );
};

export default CustomAdFilterConfig;
