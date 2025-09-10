/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import { AlertCircle, CheckCircle, Shield, Copy, ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';

import { AdminConfig } from '@/lib/admin.types';

interface TVBoxSecurityConfigProps {
  config: AdminConfig | null;
  refreshConfig: () => Promise<void>;
}

const TVBoxSecurityConfig = ({ config, refreshConfig }: TVBoxSecurityConfigProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  const [securitySettings, setSecuritySettings] = useState({
    enableAuth: false,
    token: '',
    enableIpWhitelist: false,
    allowedIPs: [] as string[],
    enableRateLimit: false,
    rateLimit: 60
  });

  const [newIP, setNewIP] = useState('');
  const [showToken, setShowToken] = useState(false);

  // 从config加载设置
  useEffect(() => {
    if (config?.TVBoxSecurityConfig) {
      setSecuritySettings({
        enableAuth: config.TVBoxSecurityConfig.enableAuth ?? false,
        token: config.TVBoxSecurityConfig.token || generateToken(),
        enableIpWhitelist: config.TVBoxSecurityConfig.enableIpWhitelist ?? false,
        allowedIPs: config.TVBoxSecurityConfig.allowedIPs || [],
        enableRateLimit: config.TVBoxSecurityConfig.enableRateLimit ?? false,
        rateLimit: config.TVBoxSecurityConfig.rateLimit ?? 60
      });
    } else {
      // 默认配置
      setSecuritySettings(prev => ({
        ...prev,
        token: prev.token || generateToken()
      }));
    }
  }, [config]);

  // 生成随机Token
  function generateToken() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 32; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  // 显示消息
  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  // 保存配置
  const handleSave = async () => {
    setIsLoading(true);
    
    try {
      // 验证IP地址格式
      for (const ip of securitySettings.allowedIPs) {
        if (ip && !isValidIPOrCIDR(ip)) {
          showMessage('error', `无效的IP地址或CIDR格式: ${ip}`);
          return;
        }
      }

      if (securitySettings.rateLimit < 1 || securitySettings.rateLimit > 1000) {
        showMessage('error', '频率限制应在1-1000之间');
        return;
      }

      const response = await fetch('/api/admin/tvbox-security', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(securitySettings),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '保存失败');
      }

      showMessage('success', 'TVBox安全配置保存成功！');
      await refreshConfig();
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : '保存失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 验证IP地址或CIDR格式
  function isValidIPOrCIDR(ip: string): boolean {
    // 简单的IP地址验证
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
    const parts = ip.split('/')[0].split('.');
    
    if (!ipRegex.test(ip)) return false;
    
    return parts.every(part => {
      const num = parseInt(part, 10);
      return num >= 0 && num <= 255;
    });
  }

  // 添加IP地址
  const addIP = () => {
    if (!newIP.trim()) return;
    
    if (!isValidIPOrCIDR(newIP.trim())) {
      showMessage('error', '请输入有效的IP地址或CIDR格式 (例如: 192.168.1.100 或 192.168.1.0/24)');
      return;
    }
    
    if (securitySettings.allowedIPs.includes(newIP.trim())) {
      showMessage('error', 'IP地址已存在');
      return;
    }

    setSecuritySettings(prev => ({
      ...prev,
      allowedIPs: [...prev.allowedIPs, newIP.trim()]
    }));
    setNewIP('');
  };

  // 删除IP地址
  const removeIP = (index: number) => {
    setSecuritySettings(prev => ({
      ...prev,
      allowedIPs: prev.allowedIPs.filter((_, i) => i !== index)
    }));
  };

  // 复制Token
  const copyToken = () => {
    navigator.clipboard.writeText(securitySettings.token);
    showMessage('success', 'Token已复制到剪贴板');
  };

  // 生成URL示例
  const generateExampleURL = () => {
    const baseUrl = window.location.origin;
    let url = `${baseUrl}/api/tvbox`;
    
    if (securitySettings.enableAuth) {
      url += `?token=${securitySettings.token}`;
    }
    
    return url;
  };

  return (
    <div className='bg-white dark:bg-gray-800 rounded-lg shadow-md p-6'>
      <div className='flex items-center gap-3 mb-6'>
        <Shield className='h-6 w-6 text-blue-600' />
        <h2 className='text-xl font-bold text-gray-900 dark:text-gray-100'>
          TVBox 安全配置
        </h2>
      </div>

      {message && (
        <div className={`mb-4 p-4 rounded-lg flex items-center gap-2 ${
          message.type === 'success' 
            ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
            : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle className='h-5 w-5' />
          ) : (
            <AlertCircle className='h-5 w-5' />
          )}
          {message.text}
        </div>
      )}

      <div className='space-y-6'>
        {/* Token验证 */}
        <div className='border border-gray-200 dark:border-gray-700 rounded-lg p-4'>
          <div className='flex items-center justify-between mb-4'>
            <div>
              <h3 className='text-lg font-semibold text-gray-900 dark:text-gray-100'>
                Token 验证
              </h3>
              <p className='text-sm text-gray-600 dark:text-gray-400'>
                要求TVBox在URL中携带token参数才能访问
              </p>
            </div>
            <label className='relative inline-flex items-center cursor-pointer'>
              <input
                type='checkbox'
                checked={securitySettings.enableAuth}
                onChange={(e) => setSecuritySettings(prev => ({ ...prev, enableAuth: e.target.checked }))}
                className='sr-only peer'
              />
              <div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {securitySettings.enableAuth && (
            <div className='space-y-3'>
              <div>
                <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
                  访问Token
                </label>
                <div className='space-y-2'>
                  {/* Token 输入框 */}
                  <div className='flex gap-2'>
                    <input
                      type={showToken ? 'text' : 'password'}
                      value={securitySettings.token}
                      onChange={(e) => setSecuritySettings(prev => ({ ...prev, token: e.target.value }))}
                      className='flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm break-all'
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken(!showToken)}
                      className='px-3 py-2 text-sm bg-gray-100 dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500 rounded-lg whitespace-nowrap'
                    >
                      {showToken ? '隐藏' : '显示'}
                    </button>
                  </div>
                  
                  {/* 操作按钮 - 响应式布局 */}
                  <div className='flex flex-col sm:flex-row gap-2'>
                    <button
                      type="button"
                      onClick={copyToken}
                      className='flex-1 sm:flex-none px-4 py-2 text-sm bg-blue-100 dark:bg-blue-900 hover:bg-blue-200 dark:hover:bg-blue-800 text-blue-700 dark:text-blue-300 rounded-lg flex items-center justify-center gap-2 transition-colors'
                    >
                      <Copy className='h-4 w-4' />
                      复制Token
                    </button>
                    <button
                      type="button"
                      onClick={() => setSecuritySettings(prev => ({ ...prev, token: generateToken() }))}
                      className='flex-1 sm:flex-none px-4 py-2 text-sm bg-green-100 dark:bg-green-900 hover:bg-green-200 dark:hover:bg-green-800 text-green-700 dark:text-green-300 rounded-lg flex items-center justify-center gap-2 transition-colors'
                    >
                      <svg className='h-4 w-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                        <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15' />
                      </svg>
                      重新生成
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* IP白名单 */}
        <div className='border border-gray-200 dark:border-gray-700 rounded-lg p-4'>
          <div className='flex items-center justify-between mb-4'>
            <div>
              <h3 className='text-lg font-semibold text-gray-900 dark:text-gray-100'>
                IP 白名单
              </h3>
              <p className='text-sm text-gray-600 dark:text-gray-400'>
                只允许指定IP地址访问TVBox接口
              </p>
            </div>
            <label className='relative inline-flex items-center cursor-pointer'>
              <input
                type='checkbox'
                checked={securitySettings.enableIpWhitelist}
                onChange={(e) => setSecuritySettings(prev => ({ ...prev, enableIpWhitelist: e.target.checked }))}
                className='sr-only peer'
              />
              <div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {securitySettings.enableIpWhitelist && (
            <div className='space-y-3'>
              <div className='flex gap-2'>
                <input
                  type='text'
                  value={newIP}
                  onChange={(e) => setNewIP(e.target.value)}
                  placeholder='192.168.1.100 或 192.168.1.0/24'
                  className='flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                  onKeyDown={(e) => e.key === 'Enter' && addIP()}
                />
                <button
                  type="button"
                  onClick={addIP}
                  className='px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg'
                >
                  添加
                </button>
              </div>
              
              {securitySettings.allowedIPs.length > 0 && (
                <div className='space-y-2'>
                  {securitySettings.allowedIPs.map((ip, index) => (
                    <div key={index} className='flex items-center justify-between bg-gray-50 dark:bg-gray-700 px-3 py-2 rounded'>
                      <span className='text-gray-900 dark:text-gray-100'>{ip}</span>
                      <button
                        onClick={() => removeIP(index)}
                        className='text-red-600 hover:text-red-800 text-sm'
                      >
                        删除
                      </button>
                    </div>
                  ))}
                </div>
              )}
              
              <p className='text-xs text-gray-500 dark:text-gray-400'>
                支持单个IP (192.168.1.100) 和CIDR格式 (192.168.1.0/24)
              </p>
            </div>
          )}
        </div>

        {/* 频率限制 */}
        <div className='border border-gray-200 dark:border-gray-700 rounded-lg p-4'>
          <div className='flex items-center justify-between mb-4'>
            <div>
              <h3 className='text-lg font-semibold text-gray-900 dark:text-gray-100'>
                访问频率限制
              </h3>
              <p className='text-sm text-gray-600 dark:text-gray-400'>
                限制每个IP每分钟的访问次数，防止滥用
              </p>
            </div>
            <label className='relative inline-flex items-center cursor-pointer'>
              <input
                type='checkbox'
                checked={securitySettings.enableRateLimit}
                onChange={(e) => setSecuritySettings(prev => ({ ...prev, enableRateLimit: e.target.checked }))}
                className='sr-only peer'
              />
              <div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {securitySettings.enableRateLimit && (
            <div>
              <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
                每分钟请求次数限制
              </label>
              <input
                type='number'
                min='1'
                max='1000'
                value={securitySettings.rateLimit}
                onChange={(e) => setSecuritySettings(prev => ({ ...prev, rateLimit: parseInt(e.target.value) || 60 }))}
                className='w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'
              />
              <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                建议设置30-60次，过低可能影响正常使用
              </p>
            </div>
          )}
        </div>

        {/* URL示例 */}
        <div className='bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4'>
          <h3 className='text-sm font-semibold text-blue-900 dark:text-blue-300 mb-2'>
            TVBox配置URL
          </h3>
          <div className='space-y-2'>
            {/* URL显示区域 */}
            <div className='bg-white dark:bg-gray-800 px-3 py-2 rounded border'>
              <code className='block text-sm text-gray-900 dark:text-gray-100 break-all leading-relaxed'>
                {generateExampleURL()}
              </code>
            </div>
            
            {/* 操作按钮 */}
            <div className='flex flex-col sm:flex-row gap-2'>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(generateExampleURL());
                  showMessage('success', 'URL已复制到剪贴板');
                }}
                className='flex-1 sm:flex-none px-4 py-2 text-sm bg-blue-100 dark:bg-blue-800 hover:bg-blue-200 dark:hover:bg-blue-700 text-blue-700 dark:text-blue-300 rounded-lg flex items-center justify-center gap-2 transition-colors'
              >
                <Copy className='h-4 w-4' />
                复制URL
              </button>
              <a
                href={generateExampleURL()}
                target='_blank'
                rel='noopener noreferrer'
                className='flex-1 sm:flex-none px-4 py-2 text-sm bg-green-100 dark:bg-green-800 hover:bg-green-200 dark:hover:bg-green-700 text-green-700 dark:text-green-300 rounded-lg flex items-center justify-center gap-2 transition-colors'
              >
                <ExternalLink className='h-4 w-4' />
                测试访问
              </a>
            </div>
          </div>
          
          <p className='text-xs text-blue-700 dark:text-blue-400 mt-3'>
            💡 在TVBox中导入此URL即可使用。Base64格式请在URL后添加 &format=base64
          </p>
        </div>
      </div>

      {/* 保存按钮 */}
      <div className='flex justify-end pt-6'>
        <button
          onClick={handleSave}
          disabled={isLoading}
          className='px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors'
        >
          {isLoading ? '保存中...' : '保存配置'}
        </button>
      </div>
    </div>
  );
};

export default TVBoxSecurityConfig;