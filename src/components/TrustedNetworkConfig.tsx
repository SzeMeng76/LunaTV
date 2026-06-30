'use client';

import { AlertCircle, CheckCircle, Shield } from 'lucide-react';
import { useState } from 'react';

import { useTrustedNetworkQuery, useSaveTrustedNetworkMutation } from '@/hooks/useTrustedNetworkQueries';

/**
 * 信任网络配置组件
 *
 * 使用 TanStack Query 优化：
 * - 自动缓存和重试
 * - 乐观更新（立即响应用户操作）
 * - 自动错误处理和回滚
 */
const TrustedNetworkConfig = () => {
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [newIP, setNewIP] = useState('');

  // 使用 TanStack Query 获取配置
  const { data, isLoading: isQueryLoading, error: queryError } = useTrustedNetworkQuery();

  // 使用 TanStack Query Mutation 保存配置
  const saveMutation = useSaveTrustedNetworkMutation();

  // 从 Query 数据中提取配置
  const settings = data?.data?.config || { enabled: false, trustedIPs: [] };
  const envConfig = data?.data?.envConfig || null;

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

    // 乐观更新：立即保存
    saveMutation.mutate({
      ...settings,
      trustedIPs: [...settings.trustedIPs, newIP.trim()],
    }, {
      onSuccess: () => {
        setNewIP('');
        showMessage('success', 'IP地址添加成功！');
      },
      onError: (error) => {
        showMessage('error', error.message);
      },
    });
  };

  // 删除 IP
  const removeIP = (index: number) => {
    saveMutation.mutate({
      ...settings,
      trustedIPs: settings.trustedIPs.filter((_, i) => i !== index),
    }, {
      onSuccess: () => {
        showMessage('success', 'IP地址删除成功！');
      },
      onError: (error) => {
        showMessage('error', error.message);
      },
    });
  };

  // 快捷添加常见内网段
  const addCommonPrivateRange = (cidr: string) => {
    if (settings.trustedIPs.includes(cidr)) {
      showMessage('error', '该网段已存在');
      return;
    }

    saveMutation.mutate({
      ...settings,
      trustedIPs: [...settings.trustedIPs, cidr],
    }, {
      onSuccess: () => {
        showMessage('success', `网段 ${cidr} 添加成功！`);
      },
      onError: (error) => {
        showMessage('error', error.message);
      },
    });
  };

  // 切换启用状态
  const toggleEnabled = (enabled: boolean) => {
    saveMutation.mutate({
      ...settings,
      enabled,
    }, {
      onSuccess: () => {
        showMessage('success', `信任网络已${enabled ? '启用' : '禁用'}！`);
      },
      onError: (error) => {
        showMessage('error', error.message);
      },
    });
  };

  // 切换"禁止访客访问后台"开关
  const toggleBlockAdmin = (blockAdminAccess: boolean) => {
    saveMutation.mutate({
      ...settings,
      blockAdminAccess,
    }, {
      onSuccess: () => {
        showMessage(
          'success',
          `信任网络访客访问后台已${blockAdminAccess ? '禁止' : '允许'}！`,
        );
      },
      onError: (error) => {
        showMessage('error', error.message);
      },
    });
  };

  // 加载状态
  if (isQueryLoading) {
    return (
      <div className='bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 sm:p-6'>
        <div className='flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6'>
          <Shield className='h-5 w-5 sm:h-6 sm:w-6 text-green-600' />
          <h2 className='text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100'>
            信任网络配置
          </h2>
        </div>
        <div className='text-center py-8 text-gray-500 dark:text-gray-400'>
          加载中...
        </div>
      </div>
    );
  }

  // 错误状态
  if (queryError) {
    return (
      <div className='bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 sm:p-6'>
        <div className='flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6'>
          <Shield className='h-5 w-5 sm:h-6 sm:w-6 text-green-600' />
          <h2 className='text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100'>
            信任网络配置
          </h2>
        </div>
        <div className='bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4'>
          <div className='flex items-center gap-2 text-red-700 dark:text-red-400'>
            <AlertCircle className='h-5 w-5' />
            <span>加载失败：{queryError.message}</span>
          </div>
        </div>
      </div>
    );
  }

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
                onChange={(e) => toggleEnabled(e.target.checked)}
                disabled={saveMutation.isPending}
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

        {/* 禁止访客访问后台开关 */}
        <div
          className={`border border-gray-200 dark:border-gray-700 rounded-lg p-4 ${
            !settings.enabled ? 'opacity-50' : ''
          }`}
        >
          <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-3'>
            <div className='flex-1 min-w-0'>
              <h3 className='text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100'>
                禁止访客访问管理后台
              </h3>
              <p className='text-xs sm:text-sm text-gray-600 dark:text-gray-400'>
                {settings.enabled
                  ? '开启后，信任网络自动登录的访客无法进入后台 /admin。真站长用密码登录后不受影响。'
                  : '请先启用信任网络模式'}
              </p>
            </div>
            <label
              className={`relative inline-flex items-center flex-shrink-0 ${
                settings.enabled ? 'cursor-pointer' : 'cursor-not-allowed'
              }`}
            >
              <input
                type='checkbox'
                checked={settings.blockAdminAccess === true}
                onChange={(e) => toggleBlockAdmin(e.target.checked)}
                disabled={!settings.enabled || saveMutation.isPending}
                className='sr-only peer'
              />
              <div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 dark:peer-focus:ring-green-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-green-600"></div>
            </label>
          </div>
        </div>
      </div>

      {/* 乐观更新提示 */}
      {saveMutation.isPending && (
        <div className='flex justify-end pt-4 sm:pt-6'>
          <div className='text-sm text-blue-600 dark:text-blue-400 flex items-center gap-2'>
            <div className='animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full'></div>
            <span>保存中...</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrustedNetworkConfig;
