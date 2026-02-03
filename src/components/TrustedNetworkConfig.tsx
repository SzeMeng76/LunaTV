'use client';

import { AlertCircle, CheckCircle, Shield } from 'lucide-react';
import { useEffect, useState } from 'react';

import { AdminConfig } from '@/lib/admin.types';

interface TrustedNetworkConfigProps {
  config: AdminConfig | null;
  refreshConfig: () => Promise<void>;
}

const TrustedNetworkConfig = ({ config, refreshConfig }: TrustedNetworkConfigProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [settings, setSettings] = useState({
    enabled: false,
    trustedIPs: [] as string[],
  });

  const [envConfig, setEnvConfig] = useState<{
    hasEnvConfig: boolean;
    trustedIPs: string[];
  } | null>(null);

  const [newIP, setNewIP] = useState('');

  // 从 config 加载设置
  useEffect(() => {
    if (config?.TrustedNetworkConfig) {
      setSettings({
        enabled: config.TrustedNetworkConfig.enabled ?? false,
        trustedIPs: config.TrustedNetworkConfig.trustedIPs || [],
      });
    }
  }, [config]);

  // 获取环境变量配置状态
  useEffect(() => {
    const fetchEnvConfig = async () => {
      try {
        const response = await fetch('/api/admin/trusted-network');
        if (response.ok) {
          const result = await response.json();
          setEnvConfig(result.data?.envConfig || null);
        }
      } catch {
        // 忽略错误
      }
    };
    fetchEnvConfig();
  }, []);

  // 显示消息
  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  // 验证 IP 地址或 CIDR 格式（支持 IPv4 和 IPv6）
  function isValidIPOrCIDR(ip: string): boolean {
    const trimmed = ip.trim();

    if (trimmed === '*') return true;

    const [ipPart, maskPart] = trimmed.split('/');

    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$|^::([0-9a-fA-F]{1,4}:){0,5}[0-9a-fA-F]{0,4}$|^([0-9a-fA-F]{1,4}:){1,6}:$|^::$/;

    const isIPv4 = ipv4Regex.test(ipPart);
    const isIPv6 = ipv6Regex.test(ipPart);

    if (!isIPv4 && !isIPv6) return false;

    if (isIPv4) {
      const parts = ipPart.split('.');
      for (const part of parts) {
        const num = parseInt(part, 10);
        if (isNaN(num) || num < 0 || num > 255) return false;
      }
    }

    if (maskPart) {
      const mask = parseInt(maskPart, 10);
      if (isNaN(mask) || mask < 0) return false;
      if (isIPv4 && mask > 32) return false;
      if (isIPv6 && mask > 128) return false;
    }

    return true;
  }

  // 添加 IP
  const addIP = () => {
    if (!newIP.trim()) return;

    if (!isValidIPOrCIDR(newIP.trim())) {
      showMessage('error', '请输入有效的IP地址或CIDR格式 (例如: 192.168.0.0/16, 10.0.0.0/8, 2001:db8::/32)');
      return;
    }

    if (settings.trustedIPs.includes(newIP.trim())) {
      showMessage('error', 'IP地址已存在');
      return;
    }

    setSettings((prev) => ({
      ...prev,
      trustedIPs: [...prev.trustedIPs, newIP.trim()],
    }));
    setNewIP('');
  };

  // 删除 IP
  const removeIP = (index: number) => {
    setSettings((prev) => ({
      ...prev,
      trustedIPs: prev.trustedIPs.filter((_, i) => i !== index),
    }));
  };

  // 快捷添加常见内网段
  const addCommonPrivateRange = (cidr: string) => {
    if (settings.trustedIPs.includes(cidr)) {
      showMessage('error', '该网段已存在');
      return;
    }
    setSettings((prev) => ({
      ...prev,
      trustedIPs: [...prev.trustedIPs, cidr],
    }));
  };

  // 保存配置
  const handleSave = async () => {
    setIsLoading(true);

    try {
      for (const ip of settings.trustedIPs) {
        if (ip && !isValidIPOrCIDR(ip)) {
          showMessage('error', `无效的IP地址或CIDR格式: ${ip}`);
          return;
        }
      }

      const response = await fetch('/api/admin/trusted-network', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '保存失败');
      }

      showMessage('success', '信任网络配置保存成功！立即生效');
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
        <Shield className='h-5 w-5 sm:h-6 sm:w-6 text-green-600' />
        <h2 className='text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100'>
          信任网络配置
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
        {/* 环境变量配置提示 */}
        {envConfig?.hasEnvConfig && (
          <div className='bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4'>
            <h4 className='text-sm font-semibold text-blue-900 dark:text-blue-300 mb-2'>
              环境变量配置已检测
            </h4>
            <p className='text-xs text-blue-800 dark:text-blue-300 mb-2'>
              当前通过环境变量 <code>TRUSTED_NETWORK_IPS</code> 配置了信任网络，优先级高于数据库配置。
            </p>
            <div className='space-y-1'>
              {envConfig.trustedIPs.map((ip, index) => (
                <div
                  key={index}
                  className='text-xs text-blue-700 dark:text-blue-400 font-mono'
                >
                  {ip}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 启用开关 */}
        <div className='border border-gray-200 dark:border-gray-700 rounded-lg p-4'>
          <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4'>
            <div className='flex-1 min-w-0'>
              <h3 className='text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100'>
                启用信任网络模式
              </h3>
              <p className='text-xs sm:text-sm text-gray-600 dark:text-gray-400'>
                来自信任IP段的访问将自动跳过登录认证，适用于内网部署场景
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
              <div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 dark:peer-focus:ring-green-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-green-600"></div>
            </label>
          </div>

          {settings.enabled && (
            <div className='space-y-4'>
              {/* 安全警告 */}
              <div className='bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3'>
                <p className='text-xs text-yellow-800 dark:text-yellow-300'>
                  <strong>注意：</strong>
                  启用此功能后，来自信任IP段的请求将自动获得站长(owner)权限，无需登录。
                  请确保只添加受信任的内网IP段，切勿将公网IP加入信任列表。
                </p>
              </div>

              {/* 快捷添加常见内网段 */}
              <div>
                <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
                  快捷添加常见内网段
                </label>
                <div className='grid grid-cols-2 sm:flex sm:flex-wrap gap-2'>
                  {[
                    { label: '10.0.0.0/8', desc: 'A类私网' },
                    { label: '172.16.0.0/12', desc: 'B类私网' },
                    { label: '192.168.0.0/16', desc: 'C类私网' },
                    { label: '127.0.0.1', desc: '本机' },
                  ].map(({ label, desc }) => (
                    <button
                      key={label}
                      type='button'
                      onClick={() => addCommonPrivateRange(label)}
                      disabled={settings.trustedIPs.includes(label)}
                      className='px-2 sm:px-3 py-1.5 sm:py-1 text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 dark:text-gray-300 rounded-lg transition-colors text-center'
                    >
                      <span className='block sm:inline'>{label}</span>
                      <span className='block sm:inline sm:ml-1 text-gray-500 dark:text-gray-400'>
                        ({desc})
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* IP 输入 */}
              <div>
                <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
                  信任的IP/CIDR列表
                </label>
                <div className='flex flex-col sm:flex-row gap-2'>
                  <input
                    type='text'
                    value={newIP}
                    onChange={(e) => setNewIP(e.target.value)}
                    placeholder='192.168.0.0/16 或 2001:db8::/32'
                    className='flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm'
                    onKeyDown={(e) => e.key === 'Enter' && addIP()}
                  />
                  <button
                    type='button'
                    onClick={addIP}
                    className='px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg whitespace-nowrap'
                  >
                    添加
                  </button>
                </div>
              </div>

              {/* IP 列表 */}
              {settings.trustedIPs.length > 0 && (
                <div className='space-y-2'>
                  {settings.trustedIPs.map((ip, index) => (
                    <div
                      key={index}
                      className='flex items-center justify-between bg-gray-50 dark:bg-gray-700 px-3 py-2 rounded gap-2'
                    >
                      <span className='text-gray-900 dark:text-gray-100 font-mono text-xs sm:text-sm break-all'>
                        {ip}
                      </span>
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
                支持 IPv4 (192.168.1.100)、IPv6 (2001:db8::1) 和 CIDR 格式 (192.168.0.0/16, 10.0.0.0/8)
              </p>

              {/* 使用说明 */}
              <div className='bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-3'>
                <h4 className='text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2'>
                  使用说明
                </h4>
                <ul className='text-xs text-gray-600 dark:text-gray-400 space-y-1'>
                  <li>
                    &bull; <strong>数据库配置：</strong>在上方添加信任IP段后保存，立即生效
                  </li>
                  <li>
                    &bull; <strong>环境变量配置：</strong>设置{' '}
                    <code className='bg-gray-200 dark:bg-gray-700 px-1 rounded text-[10px] sm:text-xs break-all'>
                      TRUSTED_NETWORK_IPS=192.168.0.0/16
                    </code>{' '}
                    （优先级更高）
                  </li>
                  <li>
                    &bull; 信任IP段内的设备访问时将自动获得站长权限
                  </li>
                  <li>
                    &bull; 非信任IP段的设备仍需正常登录
                  </li>
                </ul>
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
          className='w-full sm:w-auto px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors'
        >
          {isLoading ? '保存中...' : '保存配置'}
        </button>
      </div>
    </div>
  );
};

export default TrustedNetworkConfig;
