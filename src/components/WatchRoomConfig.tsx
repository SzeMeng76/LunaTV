/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import { AlertCircle, CheckCircle, ExternalLink, Info, Users } from 'lucide-react';
import { useEffect, useState } from 'react';

import { AdminConfig } from '@/lib/admin.types';

interface WatchRoomConfigProps {
  config: AdminConfig | null;
  refreshConfig: () => Promise<void>;
}

interface ServerStats {
  totalRooms: number;
  totalMembers: number;
  rooms: Array<{
    id: string;
    name: string;
    memberCount: number;
    isPublic: boolean;
    hasPassword: boolean;
    createdAt: number;
  }>;
}

const WatchRoomConfig = ({ config, refreshConfig }: WatchRoomConfigProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [stats, setStats] = useState<ServerStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);

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

  // 保存的配置（用于自动刷新统计）
  const savedConfig = config?.WatchRoomConfig;

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
      // 通过后端API测试连接，避免CORS问题
      const response = await fetch('/api/watch-room/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverUrl: settings.serverUrl.trim(),
          authKey: settings.authKey.trim(),
        }),
      });

      const data = await response.json();

      if (data.success) {
        setTestResult({
          success: true,
          message: data.message || '连接成功！',
        });
      } else {
        throw new Error(data.error || '连接失败');
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

    if (!config) {
      showMessage('error', '配置未加载');
      return;
    }

    setIsLoading(true);
    try {
      // 更新完整配置
      const updatedConfig = {
        ...config,
        WatchRoomConfig: {
          enabled: settings.enabled,
          serverUrl: settings.serverUrl.trim(),
          authKey: settings.authKey.trim(),
        }
      };

      const response = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedConfig)
      });

      // 检查响应是否有内容
      const contentType = response.headers.get('content-type');
      let data;

      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        throw new Error(text || '服务器返回了非JSON响应');
      }

      if (!response.ok) {
        throw new Error(data.error || '保存失败');
      }

      showMessage('success', '观影室配置已保存');
      await refreshConfig();
    } catch (error: any) {
      console.error('保存配置失败:', error);
      showMessage('error', error.message || '保存失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 获取服务器统计信息
  // useSaved=true: 使用已保存的配置（用于自动刷新）
  // useSaved=false: 使用当前输入的配置（用于手动刷新测试）
  const fetchStats = async (useSaved = false) => {
    const configToUse = useSaved ? savedConfig : settings;

    if (!configToUse || !configToUse.enabled || !configToUse.serverUrl) {
      return;
    }

    setStatsLoading(true);
    setStatsError(null);

    try {
      const response = await fetch('/api/watch-room/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverUrl: configToUse.serverUrl.trim(),
          authKey: configToUse.authKey.trim(),
        }),
      });
      const result = await response.json();

      if (result.success && result.data) {
        setStats(result.data);
      } else {
        setStatsError(result.error || '获取统计信息失败');
      }
    } catch (error: any) {
      console.error('获取统计信息失败:', error);
      setStatsError(error.message || '获取统计信息失败');
    } finally {
      setStatsLoading(false);
    }
  };

  // 基于已保存的配置自动获取统计信息（不会因为用户输入而触发）
  useEffect(() => {
    if (savedConfig?.enabled && savedConfig.serverUrl && savedConfig.authKey) {
      fetchStats(true); // 使用已保存的配置
      // 每1小时自动刷新
      const interval = setInterval(() => fetchStats(true), 60 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [savedConfig?.enabled, savedConfig?.serverUrl, savedConfig?.authKey]);

  return (
    <div className='space-y-6'>
      {/* 标题和说明 */}
      <div className='flex items-start gap-3'>
        <Users className='w-6 h-6 text-indigo-500 shrink-0 mt-1' />
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
          <Info className='w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5' />
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
              href='https://github.com/SzeMeng76/watch-room-server'
              target='_blank'
              rel='noopener noreferrer'
              className='inline-flex items-center gap-1 mt-2 text-blue-600 dark:text-blue-400 hover:underline'
            >
              查看部署教程 <ExternalLink className='w-4 h-4' />
            </a>
          </div>
        </div>
      </div>

      {/* 多站点共享警告 */}
      <div className='bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4'>
        <div className='flex items-start gap-3'>
          <AlertCircle className='w-5 h-5 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5' />
          <div className='text-sm text-yellow-800 dark:text-yellow-200'>
            <p className='font-medium mb-2'>⚠️ 重要提示：多站点共享</p>
            <ul className='space-y-1 list-disc list-inside'>
              <li><strong>如果多个 LunaTV 站点使用同一个观影室服务器，所有站点将共享房间列表</strong></li>
              <li>站点A创建的房间，站点B的用户也能看到和加入</li>
              <li>这可能导致用户困惑，建议每个站点使用独立的观影室服务器</li>
              <li>如果需要跨站点观影，可以有意共用服务器（但需在房间名称中注明站点）</li>
            </ul>
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
                <CheckCircle className='w-5 h-5 shrink-0' />
              ) : (
                <AlertCircle className='w-5 h-5 shrink-0' />
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
          className='px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-lg font-medium transition-colors'
        >
          {isLoading ? '保存中...' : '保存配置'}
        </button>
        {settings.enabled && (
          <button
            onClick={() => fetchStats(false)}
            disabled={statsLoading}
            className='px-4 py-2 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors'
          >
            {statsLoading ? '刷新中...' : '刷新统计'}
          </button>
        )}
      </div>

      {/* 服务器统计信息 */}
      {settings.enabled && (
        <div className='pt-6 border-t border-gray-200 dark:border-gray-700'>
          <h4 className='text-md font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2'>
            <Users className='w-5 h-5 text-indigo-500' />
            服务器统计信息
            <span className='text-xs font-normal text-gray-500 dark:text-gray-400'>(每30秒自动刷新)</span>
          </h4>

          {statsLoading && !stats && (
            <div className='flex items-center justify-center py-8'>
              <div className='text-sm text-gray-500 dark:text-gray-400'>加载统计信息...</div>
            </div>
          )}

          {statsError && (
            <div className='p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg'>
              <div className='flex items-start gap-2 text-red-800 dark:text-red-200'>
                <AlertCircle className='w-5 h-5 shrink-0' />
                <div className='text-sm'>
                  <p className='font-medium'>无法获取统计信息</p>
                  <p className='mt-1'>{statsError}</p>
                </div>
              </div>
            </div>
          )}

          {stats && (
            <div className='space-y-4'>
              {/* 总览卡片 */}
              <div className='grid grid-cols-2 gap-4'>
                <div className='bg-linear-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg p-4'>
                  <div className='text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-1'>
                    活跃房间数
                  </div>
                  <div className='text-3xl font-bold text-indigo-900 dark:text-indigo-100'>
                    {stats.totalRooms}
                  </div>
                </div>
                <div className='bg-linear-to-br from-green-50 to-teal-50 dark:from-green-900/20 dark:to-teal-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4'>
                  <div className='text-sm font-medium text-green-700 dark:text-green-300 mb-1'>
                    在线用户数
                  </div>
                  <div className='text-3xl font-bold text-green-900 dark:text-green-100'>
                    {stats.totalMembers}
                  </div>
                </div>
              </div>

              {/* 房间列表 */}
              {stats.rooms && stats.rooms.length > 0 && (
                <div>
                  <div className='text-sm font-medium text-gray-700 dark:text-gray-300 mb-3'>
                    房间详情 ({stats.rooms.length})
                  </div>
                  <div className='space-y-2 max-h-96 overflow-y-auto'>
                    {stats.rooms.map((room) => {
                      const createdTime = new Date(room.createdAt);
                      const now = new Date();
                      const diffMinutes = Math.floor((now.getTime() - createdTime.getTime()) / 60000);
                      const timeText = diffMinutes < 60
                        ? `${diffMinutes}分钟前`
                        : diffMinutes < 1440
                        ? `${Math.floor(diffMinutes / 60)}小时前`
                        : `${Math.floor(diffMinutes / 1440)}天前`;

                      return (
                        <div
                          key={room.id}
                          className='bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 hover:shadow-md transition-shadow'
                        >
                          <div className='flex items-start justify-between mb-2'>
                            <div className='flex-1 min-w-0'>
                              <h5 className='font-medium text-gray-900 dark:text-gray-100 truncate'>
                                {room.name}
                              </h5>
                              <div className='flex items-center gap-2 mt-1'>
                                <span className='text-xs font-mono text-gray-500 dark:text-gray-400'>
                                  {room.id}
                                </span>
                                {!room.isPublic && (
                                  <span className='text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded'>
                                    私密
                                  </span>
                                )}
                                {room.hasPassword && (
                                  <span className='text-xs px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded'>
                                    有密码
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className='flex items-center gap-2 ml-3'>
                              <div className='text-right'>
                                <div className='text-sm font-semibold text-gray-900 dark:text-gray-100'>
                                  {room.memberCount} 人
                                </div>
                                <div className='text-xs text-gray-500 dark:text-gray-400'>
                                  {timeText}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {stats.totalRooms === 0 && (
                <div className='text-center py-8 text-gray-500 dark:text-gray-400'>
                  <Users className='w-12 h-12 mx-auto mb-3 opacity-50' />
                  <p className='text-sm'>当前没有活跃的房间</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default WatchRoomConfig;
