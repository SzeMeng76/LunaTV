'use client';

import { AlertCircle, CheckCircle, MessageSquare, ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';

import { AdminConfig } from '@/lib/admin.types';

// 默认弹幕API配置
const DEFAULT_DANMU_API_URL = 'https://smonedanmu.vercel.app';
const DEFAULT_DANMU_API_TOKEN = 'smonetv';

interface DanmuApiConfigProps {
  config: AdminConfig | null;
  refreshConfig: () => Promise<void>;
}

const DanmuApiConfig = ({ config, refreshConfig }: DanmuApiConfigProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; count?: number } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const [settings, setSettings] = useState({
    enabled: true,
    useCustomApi: false,
    customApiUrl: '',
    customToken: '',
    timeout: 30,
  });

  // 从 config 加载设置
  useEffect(() => {
    if (config?.DanmuApiConfig) {
      setSettings({
        enabled: config.DanmuApiConfig.enabled ?? true,
        useCustomApi: config.DanmuApiConfig.useCustomApi ?? false,
        customApiUrl: config.DanmuApiConfig.customApiUrl || '',
        customToken: config.DanmuApiConfig.customToken || '',
        timeout: config.DanmuApiConfig.timeout || 30,
      });
    }
  }, [config]);

  // 显示消息
  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  // 获取当前使用的 API 地址和 Token
  const getCurrentApiConfig = () => {
    if (settings.useCustomApi && settings.customApiUrl) {
      return {
        url: settings.customApiUrl.replace(/\/$/, ''),
        token: settings.customToken,
      };
    }
    return {
      url: DEFAULT_DANMU_API_URL,
      token: DEFAULT_DANMU_API_TOKEN,
    };
  };

  // 测试 API 连接
  const testConnection = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      const { url, token } = getCurrentApiConfig();
      const testUrl = `${url}/${token}/api/v2/search/anime?keyword=流浪地球`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), settings.timeout * 1000);

      const response = await fetch(testUrl, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.success && data.animes && data.animes.length > 0) {
        setTestResult({
          success: true,
          message: `连接成功！找到 ${data.animes.length} 个匹配结果`,
          count: data.animes.length,
        });
      } else if (data.errorCode === 0) {
        setTestResult({
          success: true,
          message: '连接成功！API 正常工作',
        });
      } else {
        throw new Error(data.errorMessage || '未知错误');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setTestResult({
          success: false,
          message: `连接超时 (${settings.timeout}秒)`,
        });
      } else {
        setTestResult({
          success: false,
          message: `连接失败: ${error instanceof Error ? error.message : '未知错误'}`,
        });
      }
    } finally {
      setIsTesting(false);
    }
  };

  // 保存配置
  const handleSave = async () => {
    setIsLoading(true);

    try {
      // 验证自定义 URL 格式
      if (settings.useCustomApi && settings.customApiUrl) {
        try {
          new URL(settings.customApiUrl);
        } catch {
          showMessage('error', '请输入有效的 API 地址');
          return;
        }
      }

      const response = await fetch('/api/admin/danmu-api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '保存失败');
      }

      showMessage('success', '弹幕API配置保存成功！');
      await refreshConfig();
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : '保存失败');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className='bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 sm:p-6'>
      <div className='flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6'>
        <MessageSquare className='h-5 w-5 sm:h-6 sm:w-6 text-purple-600' />
        <h2 className='text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100'>
          弹幕API配置
        </h2>
      </div>

      {message && (
        <div
          className={`mb-4 p-4 rounded-lg flex items-center gap-2 ${
            message.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
              : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle className='h-5 w-5' />
          ) : (
            <AlertCircle className='h-5 w-5' />
          )}
          {message.text}
        </div>
      )}

      <div className='space-y-6'>
        {/* 功能说明 */}
        <div className='bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4'>
          <h4 className='text-sm font-semibold text-purple-900 dark:text-purple-300 mb-2'>
            功能说明
          </h4>
          <p className='text-xs text-purple-800 dark:text-purple-300 mb-2'>
            弹幕API用于从B站、腾讯、爱奇艺、优酷等平台获取弹幕数据。默认使用官方提供的弹幕服务，
            你也可以自行部署弹幕API服务获得更好的稳定性。
          </p>
          <a
            href='https://github.com/huangxd-/danmu_api'
            target='_blank'
            rel='noopener noreferrer'
            className='inline-flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400 hover:underline'
          >
            <ExternalLink className='h-3 w-3' />
            弹幕API开源项目 (支持Vercel一键部署)
          </a>
        </div>

        {/* 启用开关 */}
        <div className='border border-gray-200 dark:border-gray-700 rounded-lg p-4'>
          <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4'>
            <div className='flex-1 min-w-0'>
              <h3 className='text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100'>
                启用弹幕功能
              </h3>
              <p className='text-xs sm:text-sm text-gray-600 dark:text-gray-400'>
                启用后播放器可以加载外部弹幕数据
              </p>
            </div>
            <label className='relative inline-flex items-center cursor-pointer flex-shrink-0'>
              <input
                type='checkbox'
                checked={settings.enabled}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    enabled: e.target.checked,
                  }))
                }
                className='sr-only peer'
              />
              <div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 dark:peer-focus:ring-purple-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-purple-600"></div>
            </label>
          </div>

          {settings.enabled && (
            <div className='space-y-4'>
              {/* 当前使用的 API */}
              <div className='bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3'>
                <div className='text-xs text-gray-500 dark:text-gray-400 mb-1'>当前使用的API</div>
                <div className='font-mono text-sm text-gray-900 dark:text-gray-100 break-all'>
                  {getCurrentApiConfig().url}
                </div>
              </div>

              {/* 使用自定义 API 开关 */}
              <div className='flex items-center justify-between'>
                <div>
                  <h4 className='text-sm font-medium text-gray-900 dark:text-gray-100'>
                    使用自定义API
                  </h4>
                  <p className='text-xs text-gray-500 dark:text-gray-400'>
                    关闭则使用默认弹幕服务
                  </p>
                </div>
                <label className='relative inline-flex items-center cursor-pointer'>
                  <input
                    type='checkbox'
                    checked={settings.useCustomApi}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        useCustomApi: e.target.checked,
                      }))
                    }
                    className='sr-only peer'
                  />
                  <div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 dark:peer-focus:ring-purple-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-purple-600"></div>
                </label>
              </div>

              {/* 自定义 API 配置 */}
              {settings.useCustomApi && (
                <div className='space-y-4 border-t border-gray-200 dark:border-gray-700 pt-4'>
                  <div>
                    <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
                      API 地址
                    </label>
                    <input
                      type='url'
                      value={settings.customApiUrl}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          customApiUrl: e.target.value,
                        }))
                      }
                      placeholder='https://your-danmu-api.vercel.app'
                      className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm'
                    />
                  </div>

                  <div>
                    <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
                      API Token
                    </label>
                    <input
                      type='text'
                      value={settings.customToken}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          customToken: e.target.value,
                        }))
                      }
                      placeholder='your-token'
                      className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm'
                    />
                    <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                      部署弹幕API时设置的 TOKEN 值
                    </p>
                  </div>
                </div>
              )}

              {/* 超时设置 */}
              <div>
                <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
                  请求超时时间 (秒)
                </label>
                <input
                  type='number'
                  min={5}
                  max={60}
                  value={settings.timeout}
                  onChange={(e) => {
                    const val = e.target.value;
                    // 允许空值输入，方便用户清空后重新输入
                    if (val === '') {
                      setSettings((prev) => ({ ...prev, timeout: '' as unknown as number }));
                      return;
                    }
                    const num = parseInt(val);
                    if (!isNaN(num)) {
                      setSettings((prev) => ({ ...prev, timeout: num }));
                    }
                  }}
                  onBlur={() => {
                    // 失去焦点时验证范围
                    const current = settings.timeout;
                    const num = typeof current === 'number' && !isNaN(current) ? current : 30;
                    setSettings((prev) => ({
                      ...prev,
                      timeout: Math.max(5, Math.min(60, num)),
                    }));
                  }}
                  className='w-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm'
                />
                <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                  范围 5-60 秒，建议 30 秒
                </p>
              </div>

              {/* 测试连接 */}
              <div className='border-t border-gray-200 dark:border-gray-700 pt-4'>
                <button
                  type='button'
                  onClick={testConnection}
                  disabled={isTesting}
                  className='px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 text-gray-700 dark:text-gray-300 rounded-lg text-sm transition-colors'
                >
                  {isTesting ? '测试中...' : '测试连接'}
                </button>

                {testResult && (
                  <div
                    className={`mt-3 p-3 rounded-lg flex items-center gap-2 ${
                      testResult.success
                        ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                        : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                    }`}
                  >
                    {testResult.success ? (
                      <CheckCircle className='h-4 w-4 flex-shrink-0' />
                    ) : (
                      <AlertCircle className='h-4 w-4 flex-shrink-0' />
                    )}
                    <span className='text-sm'>{testResult.message}</span>
                  </div>
                )}
              </div>

              {/* 默认 API 信息 */}
              <div className='bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 overflow-hidden'>
                <h4 className='text-sm font-semibold text-blue-900 dark:text-blue-300 mb-2'>
                  默认弹幕服务
                </h4>
                <div className='text-xs text-blue-800 dark:text-blue-300 space-y-1'>
                  <div className='flex flex-col sm:flex-row sm:items-center gap-1'>
                    <span className='font-medium shrink-0'>API地址：</span>
                    <code className='bg-blue-100 dark:bg-blue-800/50 px-1 rounded break-all'>
                      {DEFAULT_DANMU_API_URL}
                    </code>
                  </div>
                  <div className='flex flex-col sm:flex-row sm:items-center gap-1'>
                    <span className='font-medium shrink-0'>Token：</span>
                    <code className='bg-blue-100 dark:bg-blue-800/50 px-1 rounded break-all'>
                      {DEFAULT_DANMU_API_TOKEN}
                    </code>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 保存按钮 */}
      <div className='flex justify-end pt-4 sm:pt-6'>
        <button
          onClick={handleSave}
          disabled={isLoading}
          className='w-full sm:w-auto px-6 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors'
        >
          {isLoading ? '保存中...' : '保存配置'}
        </button>
      </div>
    </div>
  );
};

export default DanmuApiConfig;
