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

  const [proxySettings, setProxySettings] = useState({
    enabled: false,
    proxyUrl: 'https://corsapi.smone.workers.dev'
  });

  const [newIP, setNewIP] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [diagnoseResult, setDiagnoseResult] = useState<any>(null);

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

    // 加载代理配置
    if (config?.TVBoxProxyConfig) {
      setProxySettings({
        enabled: config.TVBoxProxyConfig.enabled ?? false,
        proxyUrl: config.TVBoxProxyConfig.proxyUrl || 'https://corsapi.smone.workers.dev'
      });
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

      // 验证代理URL
      if (proxySettings.enabled && proxySettings.proxyUrl) {
        try {
          new URL(proxySettings.proxyUrl);
        } catch {
          showMessage('error', '代理URL格式不正确');
          return;
        }
      }

      // 保存安全配置
      const securityResponse = await fetch('/api/admin/tvbox-security', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(securitySettings),
      });

      if (!securityResponse.ok) {
        const errorData = await securityResponse.json();
        throw new Error(errorData.error || '保存安全配置失败');
      }

      // 保存代理配置
      const proxyResponse = await fetch('/api/admin/tvbox-proxy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(proxySettings),
      });

      if (!proxyResponse.ok) {
        const errorData = await proxyResponse.json();
        throw new Error(errorData.error || '保存代理配置失败');
      }

      showMessage('success', 'TVBox配置保存成功！');
      await refreshConfig();
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : '保存失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 验证IP地址或CIDR格式（支持 IPv4 和 IPv6）
  function isValidIPOrCIDR(ip: string): boolean {
    const trimmed = ip.trim();

    // 允许通配符
    if (trimmed === '*') return true;

    // 分离 IP 和 CIDR 掩码
    const [ipPart, maskPart] = trimmed.split('/');

    // IPv4 正则
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    // IPv6 正则（简化版，支持常见格式）
    const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$|^::([0-9a-fA-F]{1,4}:){0,5}[0-9a-fA-F]{0,4}$|^([0-9a-fA-F]{1,4}:){1,6}:$|^::$/;

    const isIPv4 = ipv4Regex.test(ipPart);
    const isIPv6 = ipv6Regex.test(ipPart);

    if (!isIPv4 && !isIPv6) return false;

    // 验证 IPv4 地址的每个部分是否在 0-255 范围内
    if (isIPv4) {
      const parts = ipPart.split('.');
      for (const part of parts) {
        const num = parseInt(part, 10);
        if (isNaN(num) || num < 0 || num > 255) {
          return false;
        }
      }
    }

    // 验证子网掩码位数
    if (maskPart) {
      const mask = parseInt(maskPart, 10);
      if (isNaN(mask) || mask < 0) return false;
      // IPv4 掩码 0-32，IPv6 掩码 0-128
      if (isIPv4 && mask > 32) return false;
      if (isIPv6 && mask > 128) return false;
    }

    return true;
  }

  // 添加IP地址
  const addIP = () => {
    if (!newIP.trim()) return;
    
    if (!isValidIPOrCIDR(newIP.trim())) {
      showMessage('error', '请输入有效的IP地址或CIDR格式 (例如: 192.168.1.100, 192.168.1.0/24, 2001:db8::1, 2001:db8::/32)');
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

  // 诊断配置
  const handleDiagnose = async () => {
    setIsDiagnosing(true);
    setDiagnoseResult(null);

    try {
      // 如果有 token，就传递（无论是否启用验证）
      let diagnoseUrl = '/api/tvbox/diagnose';
      if (securitySettings.token) {
        diagnoseUrl += `?token=${encodeURIComponent(securitySettings.token)}`;
      }

      console.log('[Diagnose] Frontend - Token:', securitySettings.token);
      console.log('[Diagnose] Frontend - Calling URL:', diagnoseUrl);

      const response = await fetch(diagnoseUrl);
      const result = await response.json();

      setDiagnoseResult(result);

      if (result.pass) {
        showMessage('success', '配置诊断通过！所有检查项正常');
      } else {
        showMessage('error', `发现 ${result.issues?.length || 0} 个问题`);
      }
    } catch (error) {
      showMessage('error', '诊断失败：' + (error instanceof Error ? error.message : '未知错误'));
    } finally {
      setIsDiagnosing(false);
    }
  };

  return (
    <div className='bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 sm:p-6 overflow-hidden'>
      <div className='flex items-center gap-3 mb-6'>
        <Shield className='h-5 w-5 sm:h-6 sm:w-6 text-blue-600 flex-shrink-0' />
        <h2 className='text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100'>
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
          <div className='flex items-start sm:items-center justify-between gap-3 mb-4'>
            <div className='min-w-0 flex-1'>
              <h3 className='text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100'>
                Token 验证
              </h3>
              <p className='text-xs sm:text-sm text-gray-600 dark:text-gray-400'>
                要求TVBox在URL中携带token参数才能访问
              </p>
            </div>
            <label className='relative inline-flex items-center cursor-pointer flex-shrink-0'>
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
                  {/* Token 输入框 - 移动端堆叠 */}
                  <div className='flex flex-col sm:flex-row gap-2'>
                    <input
                      type={showToken ? 'text' : 'password'}
                      value={securitySettings.token}
                      onChange={(e) => setSecuritySettings(prev => ({ ...prev, token: e.target.value }))}
                      className='w-full sm:flex-1 min-w-0 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm'
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken(!showToken)}
                      className='w-full sm:w-auto px-3 py-2 text-sm bg-gray-100 dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500 rounded-lg whitespace-nowrap flex-shrink-0'
                    >
                      {showToken ? '隐藏' : '显示'}
                    </button>
                  </div>

                  {/* 操作按钮 - 响应式布局 */}
                  <div className='grid grid-cols-2 sm:flex sm:flex-row gap-2'>
                    <button
                      type="button"
                      onClick={copyToken}
                      className='px-3 sm:px-4 py-2 text-sm bg-blue-100 dark:bg-blue-900 hover:bg-blue-200 dark:hover:bg-blue-800 text-blue-700 dark:text-blue-300 rounded-lg flex items-center justify-center gap-1.5 sm:gap-2 transition-colors'
                    >
                      <Copy className='h-4 w-4 flex-shrink-0' />
                      <span className='truncate'>复制</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSecuritySettings(prev => ({ ...prev, token: generateToken() }))}
                      className='px-3 sm:px-4 py-2 text-sm bg-green-100 dark:bg-green-900 hover:bg-green-200 dark:hover:bg-green-800 text-green-700 dark:text-green-300 rounded-lg flex items-center justify-center gap-1.5 sm:gap-2 transition-colors'
                    >
                      <svg className='h-4 w-4 flex-shrink-0' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                        <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15' />
                      </svg>
                      <span className='truncate'>重新生成</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* IP白名单 */}
        <div className='border border-gray-200 dark:border-gray-700 rounded-lg p-4'>
          <div className='flex items-start sm:items-center justify-between gap-3 mb-4'>
            <div className='min-w-0 flex-1'>
              <h3 className='text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100'>
                IP 白名单
              </h3>
              <p className='text-xs sm:text-sm text-gray-600 dark:text-gray-400'>
                只允许指定IP地址访问TVBox接口
              </p>
            </div>
            <label className='relative inline-flex items-center cursor-pointer flex-shrink-0'>
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
              <div className='flex flex-col sm:flex-row gap-2'>
                <input
                  type='text'
                  value={newIP}
                  onChange={(e) => setNewIP(e.target.value)}
                  placeholder='192.168.1.100 或 2001:db8::1'
                  className='flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                  onKeyDown={(e) => e.key === 'Enter' && addIP()}
                />
                <button
                  type="button"
                  onClick={addIP}
                  className='w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg whitespace-nowrap'
                >
                  添加
                </button>
              </div>

              {securitySettings.allowedIPs.length > 0 && (
                <div className='space-y-2'>
                  {securitySettings.allowedIPs.map((ip, index) => (
                    <div key={index} className='flex items-center justify-between gap-2 bg-gray-50 dark:bg-gray-700 px-3 py-2 rounded'>
                      <span className='text-gray-900 dark:text-gray-100 break-all min-w-0 flex-1 text-sm'>{ip}</span>
                      <button
                        onClick={() => removeIP(index)}
                        className='text-red-600 hover:text-red-800 text-sm flex-shrink-0'
                      >
                        删除
                      </button>
                    </div>
                  ))}
                </div>
              )}
              
              <p className='text-xs text-gray-500 dark:text-gray-400'>
                支持 IPv4 (192.168.1.100)、IPv6 (2001:db8::1) 和 CIDR 格式 (192.168.1.0/24, 2001:db8::/32)
              </p>
            </div>
          )}
        </div>

        {/* 频率限制 */}
        <div className='border border-gray-200 dark:border-gray-700 rounded-lg p-4'>
          <div className='flex items-start sm:items-center justify-between gap-3 mb-4'>
            <div className='min-w-0 flex-1'>
              <h3 className='text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100'>
                访问频率限制
              </h3>
              <p className='text-xs sm:text-sm text-gray-600 dark:text-gray-400'>
                限制每个IP每分钟的访问次数，防止滥用
              </p>
            </div>
            <label className='relative inline-flex items-center cursor-pointer flex-shrink-0'>
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

        {/* CDN代理配置 */}
        <div className='border border-gray-200 dark:border-gray-700 rounded-lg p-4'>
          <div className='flex items-start sm:items-center justify-between gap-3 mb-4'>
            <div className='min-w-0 flex-1'>
              <h3 className='text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100'>
                Cloudflare Worker 代理
              </h3>
              <p className='text-xs sm:text-sm text-gray-600 dark:text-gray-400'>
                为TVBox配置启用Cloudflare全球CDN加速
              </p>
            </div>
            <label className='relative inline-flex items-center cursor-pointer flex-shrink-0'>
              <input
                type='checkbox'
                checked={proxySettings.enabled}
                onChange={(e) => setProxySettings(prev => ({ ...prev, enabled: e.target.checked }))}
                className='sr-only peer'
              />
              <div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {proxySettings.enabled && (
            <div className='space-y-3'>
              <div>
                <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
                  Cloudflare Worker 地址
                </label>
                <input
                  type='text'
                  value={proxySettings.proxyUrl}
                  onChange={(e) => setProxySettings(prev => ({ ...prev, proxyUrl: e.target.value }))}
                  placeholder='https://your-worker.workers.dev'
                  className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                />
                <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                  默认地址：https://corsapi.smone.workers.dev（支持自定义部署）
                </p>
              </div>

              <div className='bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3'>
                <h4 className='text-sm font-semibold text-blue-900 dark:text-blue-300 mb-2'>
                  💡 功能说明
                </h4>
                <ul className='text-xs text-blue-800 dark:text-blue-300 space-y-1'>
                  <li>• 通过Cloudflare全球CDN加速视频源API访问</li>
                  <li>• 自动转发TVBox的所有API参数（ac=list, ac=detail等）</li>
                  <li>• 为每个源生成唯一路径，提升兼容性</li>
                  <li>• 支持自定义Worker地址，可部署自己的代理服务</li>
                </ul>
              </div>

              <div className='bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3'>
                <h4 className='text-sm font-semibold text-yellow-900 dark:text-yellow-300 mb-2'>
                  ⚠️ 部署说明
                </h4>
                <p className='text-xs text-yellow-800 dark:text-yellow-300'>
                  如需自定义部署，请参考：<a href='https://github.com/SzeMeng76/CORSAPI' target='_blank' rel='noopener noreferrer' className='underline hover:text-yellow-600'>CORSAPI项目</a>
                </p>
              </div>
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
            <div className='bg-white dark:bg-gray-800 px-3 py-2 rounded border overflow-x-auto'>
              <code className='block text-sm text-gray-900 dark:text-gray-100 break-all leading-relaxed'>
                {generateExampleURL()}
              </code>
            </div>

            {/* 操作按钮 - 移动端使用grid布局 */}
            <div className='grid grid-cols-3 sm:flex sm:flex-row gap-2'>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(generateExampleURL());
                  showMessage('success', 'URL已复制到剪贴板');
                }}
                className='px-2 sm:px-4 py-2 text-xs sm:text-sm bg-blue-100 dark:bg-blue-800 hover:bg-blue-200 dark:hover:bg-blue-700 text-blue-700 dark:text-blue-300 rounded-lg flex items-center justify-center gap-1 sm:gap-2 transition-colors'
              >
                <Copy className='h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0' />
                <span className='truncate'>复制</span>
              </button>
              <a
                href={generateExampleURL()}
                target='_blank'
                rel='noopener noreferrer'
                className='px-2 sm:px-4 py-2 text-xs sm:text-sm bg-green-100 dark:bg-green-800 hover:bg-green-200 dark:hover:bg-green-700 text-green-700 dark:text-green-300 rounded-lg flex items-center justify-center gap-1 sm:gap-2 transition-colors'
              >
                <ExternalLink className='h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0' />
                <span className='truncate'>测试</span>
              </a>
              <button
                onClick={handleDiagnose}
                disabled={isDiagnosing}
                className='px-2 sm:px-4 py-2 text-xs sm:text-sm bg-purple-100 dark:bg-purple-800 hover:bg-purple-200 dark:hover:bg-purple-700 disabled:opacity-50 text-purple-700 dark:text-purple-300 rounded-lg flex items-center justify-center gap-1 sm:gap-2 transition-colors'
              >
                <svg className='h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                  <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' />
                </svg>
                <span className='truncate'>{isDiagnosing ? '诊断中' : '诊断'}</span>
              </button>
            </div>
          </div>
          
          <p className='text-xs text-blue-700 dark:text-blue-400 mt-3'>
            💡 在TVBox中导入此URL即可使用。Base64格式请在URL后添加 &format=base64
          </p>
        </div>

        {/* 诊断结果 */}
        {diagnoseResult && (
          <div className={`border rounded-lg p-4 ${
            diagnoseResult.pass
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
              : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
          }`}>
            <div className='flex items-center gap-2 mb-3'>
              {diagnoseResult.pass ? (
                <CheckCircle className='h-5 w-5 text-green-600 dark:text-green-400' />
              ) : (
                <AlertCircle className='h-5 w-5 text-yellow-600 dark:text-yellow-400' />
              )}
              <h3 className={`text-sm font-semibold ${
                diagnoseResult.pass
                  ? 'text-green-900 dark:text-green-300'
                  : 'text-yellow-900 dark:text-yellow-300'
              }`}>
                诊断结果 {diagnoseResult.pass ? '✓ 通过' : '⚠ 发现问题'}
              </h3>
            </div>

            <div className='space-y-2 text-sm'>
              {/* 基本信息 */}
              <div className='grid grid-cols-1 sm:grid-cols-2 gap-x-2 gap-y-1'>
                <div className='text-gray-600 dark:text-gray-400'>状态码:</div>
                <div className='text-gray-900 dark:text-gray-100 mb-1 sm:mb-0'>{diagnoseResult.status}</div>

                <div className='text-gray-600 dark:text-gray-400'>Content-Type:</div>
                <div className='text-gray-900 dark:text-gray-100 text-xs break-all mb-1 sm:mb-0'>{diagnoseResult.contentType || 'N/A'}</div>

                <div className='text-gray-600 dark:text-gray-400'>JSON解析:</div>
                <div className='text-gray-900 dark:text-gray-100 mb-1 sm:mb-0'>
                  {diagnoseResult.hasJson ? (
                    <span className='text-green-600 dark:text-green-400'>✓ 成功</span>
                  ) : (
                    <span className='text-red-600 dark:text-red-400'>✗ 失败</span>
                  )}
                </div>

                <div className='text-gray-600 dark:text-gray-400'>接收到的Token:</div>
                <div className='text-gray-900 dark:text-gray-100 break-all mb-1 sm:mb-0'>{diagnoseResult.receivedToken || 'none'}</div>

                <div className='text-gray-600 dark:text-gray-400'>配置大小:</div>
                <div className='text-gray-900 dark:text-gray-100 mb-1 sm:mb-0'>{diagnoseResult.size} 字节</div>

                <div className='text-gray-600 dark:text-gray-400'>影视源数量:</div>
                <div className='text-gray-900 dark:text-gray-100 mb-1 sm:mb-0'>{diagnoseResult.sitesCount}</div>

                <div className='text-gray-600 dark:text-gray-400'>直播源数量:</div>
                <div className='text-gray-900 dark:text-gray-100 mb-1 sm:mb-0'>{diagnoseResult.livesCount}</div>

                <div className='text-gray-600 dark:text-gray-400'>解析源数量:</div>
                <div className='text-gray-900 dark:text-gray-100 mb-1 sm:mb-0'>{diagnoseResult.parsesCount}</div>

                {diagnoseResult.privateApis !== undefined && (
                  <>
                    <div className='text-gray-600 dark:text-gray-400'>私网API数量:</div>
                    <div className='text-gray-900 dark:text-gray-100 mb-1 sm:mb-0'>
                      {diagnoseResult.privateApis > 0 ? (
                        <span className='text-yellow-600 dark:text-yellow-400'>{diagnoseResult.privateApis}</span>
                      ) : (
                        <span className='text-green-600 dark:text-green-400'>0</span>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* 配置URL */}
              {diagnoseResult.configUrl && (
                <div className='mt-3 pt-3 border-t border-gray-200 dark:border-gray-700'>
                  <div className='text-gray-600 dark:text-gray-400 mb-1'>配置URL:</div>
                  <div className='text-xs text-gray-900 dark:text-gray-100 break-all bg-white dark:bg-gray-800 p-2 rounded font-mono'>
                    {diagnoseResult.configUrl}
                  </div>
                </div>
              )}

              {/* Spider 信息 */}
              {diagnoseResult.spider && (
                <div className='mt-3 pt-3 border-t border-gray-200 dark:border-gray-700'>
                  <div className='text-gray-600 dark:text-gray-400 mb-1'>Spider JAR:</div>
                  <div className='text-xs text-gray-900 dark:text-gray-100 break-all bg-white dark:bg-gray-800 p-2 rounded'>
                    {diagnoseResult.spider}
                  </div>
                  <div className='mt-2 space-y-1'>
                    {diagnoseResult.spiderPrivate !== undefined && (
                      <div className='text-xs'>
                        {diagnoseResult.spiderPrivate ? (
                          <span className='text-yellow-600 dark:text-yellow-400'>⚠ Spider 是私网地址</span>
                        ) : (
                          <span className='text-green-600 dark:text-green-400'>✓ Spider 是公网地址</span>
                        )}
                      </div>
                    )}
                    {diagnoseResult.spiderReachable !== undefined && (
                      <div className='text-xs'>
                        {diagnoseResult.spiderReachable ? (
                          <span className='text-green-600 dark:text-green-400'>
                            ✓ Spider 可访问
                            {diagnoseResult.spiderStatus && ` (状态码: ${diagnoseResult.spiderStatus})`}
                          </span>
                        ) : (
                          <span className='text-red-600 dark:text-red-400'>
                            ✗ Spider 不可访问
                            {diagnoseResult.spiderStatus && ` (状态码: ${diagnoseResult.spiderStatus})`}
                          </span>
                        )}
                      </div>
                    )}
                    {diagnoseResult.spiderSizeKB !== undefined && (
                      <div className='text-xs'>
                        <span className={diagnoseResult.spiderSizeKB < 50 ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'}>
                          {diagnoseResult.spiderSizeKB < 50 ? '⚠' : '✓'} 文件大小: {diagnoseResult.spiderSizeKB}KB
                        </span>
                      </div>
                    )}
                    {diagnoseResult.spiderLastModified && (
                      <div className='text-xs text-gray-600 dark:text-gray-400'>
                        最后修改: {new Date(diagnoseResult.spiderLastModified).toLocaleString('zh-CN')}
                      </div>
                    )}
                  </div>

                  {/* Spider Jar 状态（新增）*/}
                  {((diagnoseResult as any).spider_url || (diagnoseResult as any).spider_md5) && (
                    <div className='mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-xs'>
                      <div className='font-medium text-blue-800 dark:text-blue-200 mb-1'>Spider Jar 状态:</div>
                      <div className='space-y-0.5 text-blue-700 dark:text-blue-300'>
                        {(diagnoseResult as any).spider_url && (
                          <div className='break-all'>• 来源: {(diagnoseResult as any).spider_url}</div>
                        )}
                        {(diagnoseResult as any).spider_md5 && (
                          <div className='break-all'>• MD5: {(diagnoseResult as any).spider_md5}</div>
                        )}
                        {(diagnoseResult as any).spider_cached !== undefined && (
                          <div>• 缓存: {(diagnoseResult as any).spider_cached ? '✓ 是' : '✗ 否（实时下载）'}</div>
                        )}
                        {(diagnoseResult as any).spider_real_size !== undefined && (
                          <div>• 真实大小: {Math.round((diagnoseResult as any).spider_real_size / 1024)}KB</div>
                        )}
                        {(diagnoseResult as any).spider_tried !== undefined && (
                          <div>• 尝试次数: {(diagnoseResult as any).spider_tried}</div>
                        )}
                        {(diagnoseResult as any).spider_success !== undefined && (
                          <div>• 状态: {(diagnoseResult as any).spider_success ? '✓ 成功' : '✗ 降级（使用fallback jar）'}</div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 备用代理地址（新增）*/}
                  {(diagnoseResult as any).spider_backup && (
                    <div className='mt-2 p-2 bg-gray-50 dark:bg-gray-800 rounded text-xs'>
                      <div className='text-gray-600 dark:text-gray-400 mb-1'>备用代理地址:</div>
                      <div className='text-gray-900 dark:text-gray-100 break-all font-mono'>
                        {(diagnoseResult as any).spider_backup}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 问题列表 */}
              {diagnoseResult.issues && diagnoseResult.issues.length > 0 && (
                <div className='mt-3 pt-3 border-t border-yellow-200 dark:border-yellow-800'>
                  <div className='text-yellow-900 dark:text-yellow-300 font-medium mb-2'>发现以下问题:</div>
                  <ul className='list-disc list-inside space-y-1 text-yellow-800 dark:text-yellow-400'>
                    {diagnoseResult.issues.map((issue: string, idx: number) => (
                      <li key={idx}>{issue}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
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