/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import { AlertCircle, CheckCircle, ExternalLink, Info, Users } from 'lucide-react';
import { useEffect, useState } from 'react';

import { AdminConfig } from '@/lib/admin.types';

interface WatchRoomConfigProps {
  config: AdminConfig | null;
  refreshConfig: () => Promise<void>;
}

const WatchRoomConfig = ({ config, refreshConfig }: WatchRoomConfigProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [settings, setSettings] = useState({
    enabled: false,
    serverUrl: '',
    authKey: '',
  });

  // 从config加载设置
  useEffect(() => {
    if (config?.WatchRoomConfig) {
      setSettings({
        enabled: config.WatchRoomConfig.enabled || false,
        serverUrl: config.WatchRoomConfig.serverUrl || '',
        authKey: config.WatchRoomConfig.authKey || '',
      });
    }
  }, [config]);

  // 显示消息
  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  // 测试连接
  const handleTestConnection = async () => {
    if (!settings.serverUrl) {
      showMessage('error', '请先填写服务器地址');
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      // 测试健康检查端点
      const healthUrl = `${settings.serverUrl}/health`;
      const response = await fetch(healthUrl);

      if (!response.ok) {
        throw new Error(`服务器返回错误: ${response.status}`);
      }

      const data = await response.json();

      if (data.status === 'ok') {
        setTestResult({
          success: true,
          message: `连接成功！服务器运行时间: ${Math.floor(data.uptime / 60)} 分钟`,
        });
      } else {
        throw new Error('服务器状态异常');
      }
    } catch (error: any) {
      setTestResult({
        success: false,
        message: `连接失败: ${error.message}`,
      });
    } finally {
      setIsTesting(false);
    }
  };

  // 保存配置
  const handleSave = async () => {
    // 验证必填字段
    if (settings.enabled) {
      if (!settings.serverUrl) {
        showMessage('error', '请填写服务器地址');
        return;
      }
      if (!settings.authKey) {
        showMessage('error', '请填写认证密钥');
        return;
      }
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          WatchRoomConfig: {
            enabled: settings.enabled,
            serverUrl: settings.serverUrl.trim(),
            authKey: settings.authKey.trim(),
          }
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '保存失败');
      }

      showMessage('success', '观影室配置已保存');
      await refreshConfig();
    } catch (error: any) {
      showMessage('error', error.message || '保存失败');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className='space-y-6'>
      {/* 标题和说明 */}
      <div className='flex items-start gap-3'>
        <Users className='w-6 h-6 text-indigo-500 flex-shrink-0 mt-1' />
        <div className='flex-1'>
          <h3 className='text-lg font-semibold text-gray-900 dark:text-gray-100'>
            观影室配置
          </h3>
          <p className='text-sm text-gray-600 dark:text-gray-400 mt-1'>
            配置外部观影室服务器，实现多人同步观影功能
          </p>
        </div>
      </div>

      {/* 信息提示 */}
      <div className='bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4'>
        <div className='flex items-start gap-3'>
          <Info className='w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5' />
          <div className='text-sm text-blue-800 dark:text-blue-200'>
            <p className='font-medium mb-2'>关于观影室服务器：</p>
            <ul className='space-y-1 list-disc list-inside'>
              <li>观影室需要独立的 WebSocket 服务器支持，必须单独部署</li>
              <li>推荐部署平台：Fly.io（免费）或 Railway（简单）</li>
              <li>服务器地址格式：<code className='px-1 py-0.5 bg-blue-100 dark:bg-blue-800 rounded'>https://your-server.com</code></li>
              <li><strong>认证密钥</strong>：部署服务器时会要求设置 AUTH_KEY（强制），这里填写相同的密钥即可连接</li>
              <li>建议使用随机生成的强密码作为 AUTH_KEY</li>
            </ul>
            <a
              href='https://github.com/tgs9915/watch-room-server'
              target='_blank'
              rel='noopener noreferrer'
              className='inline-flex items-center gap-1 mt-2 text-blue-600 dark:text-blue-400 hover:underline'
            >
              查看部署教程 <ExternalLink className='w-4 h-4' />
            </a>
          </div>
        </div>
      </div>

      {/* 启用开关 */}
      <div className='flex items-center gap-3'>
        <label className='relative inline-flex items-center cursor-pointer'>
          <input
            type='checkbox'
            checked={settings.enabled}
            onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
            className='sr-only peer'
          />
          <div className="w-11 h-6 bg-gray-300 dark:bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
        </label>
        <span className='text-sm font-medium text-gray-700 dark:text-gray-300'>
          启用观影室功能
        </span>
      </div>

      {/* 服务器地址 */}
      <div>
        <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
          服务器地址 <span className='text-red-500'>*</span>
        </label>
        <input
          type='url'
          value={settings.serverUrl}
          onChange={(e) => setSettings({ ...settings, serverUrl: e.target.value })}
          className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent'
          placeholder='https://your-watch-room-server.fly.dev'
          disabled={!settings.enabled}
        />
        <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
          观影室服务器的完整地址（包含 https://）
        </p>
      </div>

      {/* 认证密钥 */}
      <div>
        <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
          认证密钥 <span className='text-red-500'>*</span>
        </label>
        <input
          type='password'
          value={settings.authKey}
          onChange={(e) => setSettings({ ...settings, authKey: e.target.value })}
          className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent'
          placeholder='your-secret-auth-key'
          disabled={!settings.enabled}
        />
        <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
          与服务器 AUTH_KEY 环境变量一致
        </p>
      </div>

      {/* 测试连接按钮 */}
      {settings.enabled && settings.serverUrl && (
        <div>
          <button
            onClick={handleTestConnection}
            disabled={isTesting}
            className='px-4 py-2 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors'
          >
            {isTesting ? '测试中...' : '测试连接'}
          </button>
          {testResult && (
            <div className={`mt-3 p-3 rounded-lg flex items-start gap-2 ${
              testResult.success
                ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-800'
                : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800'
            }`}>
              {testResult.success ? (
                <CheckCircle className='w-5 h-5 flex-shrink-0' />
              ) : (
                <AlertCircle className='w-5 h-5 flex-shrink-0' />
              )}
              <span className='text-sm'>{testResult.message}</span>
            </div>
          )}
        </div>
      )}

      {/* 消息提示 */}
      {message && (
        <div className={`flex items-center gap-2 p-4 rounded-lg ${
          message.type === 'success'
            ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-800'
            : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle className='w-5 h-5 flex-shrink-0' />
          ) : (
            <AlertCircle className='w-5 h-5 flex-shrink-0' />
          )}
          <span className='text-sm'>{message.text}</span>
        </div>
      )}

      {/* 操作按钮 */}
      <div className='flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700'>
        <button
          onClick={handleSave}
          disabled={isLoading}
          className='px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-lg font-medium transition-colors'
        >
          {isLoading ? '保存中...' : '保存配置'}
        </button>
      </div>
    </div>
  );
};

export default WatchRoomConfig;
