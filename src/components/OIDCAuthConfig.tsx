'use client';

import { AlertCircle, CheckCircle2, Save, KeyRound, Globe } from 'lucide-react';
import { useEffect, useState } from 'react';

interface OIDCAuthConfigProps {
  config: {
    enabled: boolean;
    enableRegistration: boolean;
    issuer: string;
    authorizationEndpoint: string;
    tokenEndpoint: string;
    userInfoEndpoint: string;
    clientId: string;
    clientSecret: string;
    buttonText: string;
    minTrustLevel: number;
  };
  onSave: (config: OIDCAuthConfigProps['config']) => Promise<void>;
}

export function OIDCAuthConfig({ config, onSave }: OIDCAuthConfigProps) {
  const [localConfig, setLocalConfig] = useState(config);
  const [saving, setSaving] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setLocalConfig(config);
  }, [config]);

  useEffect(() => {
    const changed = JSON.stringify(localConfig) !== JSON.stringify(config);
    setHasChanges(changed);
  }, [localConfig, config]);

  const handleDiscover = async () => {
    if (!localConfig.issuer) {
      setMessage({ type: 'error', text: '请先输入 Issuer URL' });
      return;
    }

    setDiscovering(true);
    setMessage(null);

    try {
      const response = await fetch('/api/admin/oidc-discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issuerUrl: localConfig.issuer }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || '自动发现失败');
      }

      const data = await response.json();
      setLocalConfig({
        ...localConfig,
        authorizationEndpoint: data.authorization_endpoint || '',
        tokenEndpoint: data.token_endpoint || '',
        userInfoEndpoint: data.userinfo_endpoint || '',
      });
      setMessage({ type: 'success', text: '自动发现成功' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({
        type: 'error',
        text: `自动发现失败: ${(error as Error).message}`,
      });
    } finally {
      setDiscovering(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await onSave(localConfig);
      setMessage({ type: 'success', text: '保存成功' });
      setHasChanges(false);
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({
        type: 'error',
        text: `保存失败: ${(error as Error).message}`,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className='space-y-6'>
      {/* 标题和说明 */}
      <div className='border-b border-gray-200 dark:border-gray-700 pb-4'>
        <h2 className='text-xl font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2'>
          <KeyRound className='w-5 h-5 text-purple-500' />
          OIDC 登录配置
        </h2>
        <p className='mt-2 text-sm text-gray-600 dark:text-gray-400'>
          配置 OpenID Connect 登录，支持 Google、Microsoft、GitHub、LinuxDo 等提供商
        </p>
      </div>

      {/* 配置提示 */}
      <div className='bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4'>
        <div className='flex gap-3'>
          <AlertCircle className='w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5' />
          <div className='text-sm text-blue-800 dark:text-blue-200 space-y-2'>
            <p className='font-semibold'>常见 OIDC 提供商：</p>
            <ul className='list-disc list-inside space-y-1 ml-2'>
              <li><strong>Google</strong>: https://accounts.google.com</li>
              <li><strong>Microsoft</strong>: https://login.microsoftonline.com/common/v2.0</li>
              <li><strong>GitHub</strong>: 需要使用 OAuth + OIDC 扩展</li>
              <li><strong>LinuxDo</strong>: https://connect.linux.do</li>
              <li><strong>自建 Keycloak</strong>: https://your-domain/realms/your-realm</li>
            </ul>
            <p className='text-xs text-blue-600 dark:text-blue-300 mt-2'>
              💡 填写 Issuer URL 后点击"自动发现"可自动获取端点配置
            </p>
          </div>
        </div>
      </div>

      {/* 启用OIDC登录 */}
      <div className='flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg'>
        <div>
          <label htmlFor='enableLogin' className='text-sm font-medium text-gray-900 dark:text-gray-100'>
            启用 OIDC 登录
          </label>
          <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
            开启后，登录页面将显示 OIDC 登录按钮
          </p>
        </div>
        <button
          type='button'
          onClick={() => setLocalConfig({ ...localConfig, enabled: !localConfig.enabled })}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${
            localConfig.enabled ? 'bg-purple-600' : 'bg-gray-200 dark:bg-gray-700'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              localConfig.enabled ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* 启用OIDC注册 */}
      <div className='flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg'>
        <div>
          <label htmlFor='enableRegistration' className='text-sm font-medium text-gray-900 dark:text-gray-100'>
            启用 OIDC 注册
          </label>
          <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
            允许通过 OIDC 登录时自动注册新用户
          </p>
        </div>
        <button
          type='button'
          onClick={() => setLocalConfig({ ...localConfig, enableRegistration: !localConfig.enableRegistration })}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${
            localConfig.enableRegistration ? 'bg-purple-600' : 'bg-gray-200 dark:bg-gray-700'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              localConfig.enableRegistration ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* OIDC Issuer */}
      <div>
        <label htmlFor='oidcIssuer' className='block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2'>
          OIDC Issuer URL（可选）
        </label>
        <div className='flex gap-2'>
          <input
            id='oidcIssuer'
            type='text'
            placeholder='https://accounts.google.com'
            value={localConfig.issuer || ''}
            onChange={(e) => setLocalConfig({ ...localConfig, issuer: e.target.value })}
            className='flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent'
          />
          <button
            type='button'
            onClick={handleDiscover}
            disabled={discovering || !localConfig.issuer}
            className='px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors flex items-center gap-2'
          >
            <Globe className='w-4 h-4' />
            {discovering ? '发现中...' : '自动发现'}
          </button>
        </div>
        <p className='mt-1 text-xs text-gray-500 dark:text-gray-400'>
          填写后可点击"自动发现"按钮自动获取端点配置
        </p>
      </div>

      {/* Authorization Endpoint */}
      <div>
        <label htmlFor='authEndpoint' className='block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2'>
          Authorization Endpoint *
        </label>
        <input
          id='authEndpoint'
          type='text'
          placeholder='https://accounts.google.com/o/oauth2/v2/auth'
          value={localConfig.authorizationEndpoint || ''}
          onChange={(e) => setLocalConfig({ ...localConfig, authorizationEndpoint: e.target.value })}
          className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent'
        />
      </div>

      {/* Token Endpoint */}
      <div>
        <label htmlFor='tokenEndpoint' className='block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2'>
          Token Endpoint *
        </label>
        <input
          id='tokenEndpoint'
          type='text'
          placeholder='https://oauth2.googleapis.com/token'
          value={localConfig.tokenEndpoint || ''}
          onChange={(e) => setLocalConfig({ ...localConfig, tokenEndpoint: e.target.value })}
          className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent'
        />
      </div>

      {/* UserInfo Endpoint */}
      <div>
        <label htmlFor='userinfoEndpoint' className='block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2'>
          UserInfo Endpoint *
        </label>
        <input
          id='userinfoEndpoint'
          type='text'
          placeholder='https://openidconnect.googleapis.com/v1/userinfo'
          value={localConfig.userInfoEndpoint || ''}
          onChange={(e) => setLocalConfig({ ...localConfig, userInfoEndpoint: e.target.value })}
          className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent'
        />
      </div>

      {/* Client ID */}
      <div>
        <label htmlFor='clientId' className='block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2'>
          Client ID *
        </label>
        <input
          id='clientId'
          type='text'
          placeholder='your-client-id.apps.googleusercontent.com'
          value={localConfig.clientId || ''}
          onChange={(e) => setLocalConfig({ ...localConfig, clientId: e.target.value })}
          className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent'
        />
      </div>

      {/* Client Secret */}
      <div>
        <label htmlFor='clientSecret' className='block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2'>
          Client Secret *
        </label>
        <input
          id='clientSecret'
          type='password'
          placeholder='••••••••••••••••'
          value={localConfig.clientSecret || ''}
          onChange={(e) => setLocalConfig({ ...localConfig, clientSecret: e.target.value })}
          className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent'
        />
      </div>

      {/* Redirect URI 显示 */}
      <div>
        <label htmlFor='redirectUri' className='block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2'>
          Redirect URI（回调地址）
        </label>
        <div className='relative'>
          <input
            id='redirectUri'
            type='text'
            readOnly
            value={typeof window !== 'undefined' ? `${window.location.origin}/api/auth/oidc/callback` : ''}
            className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300 cursor-default'
          />
          <button
            type='button'
            onClick={() => {
              if (typeof window !== 'undefined') {
                navigator.clipboard.writeText(`${window.location.origin}/api/auth/oidc/callback`);
                setMessage({ type: 'success', text: '已复制到剪贴板' });
                setTimeout(() => setMessage(null), 2000);
              }
            }}
            className='absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors'
          >
            复制
          </button>
        </div>
        <p className='mt-1 text-xs text-gray-500 dark:text-gray-400'>
          请在 OIDC 提供商的应用配置中添加此地址作为允许的重定向 URI
        </p>
      </div>

      {/* Button Text */}
      <div>
        <label htmlFor='buttonText' className='block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2'>
          登录按钮文字
        </label>
        <input
          id='buttonText'
          type='text'
          placeholder='使用 Google 登录'
          value={localConfig.buttonText || ''}
          onChange={(e) => setLocalConfig({ ...localConfig, buttonText: e.target.value })}
          className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent'
        />
        <p className='mt-1 text-xs text-gray-500 dark:text-gray-400'>
          自定义登录按钮显示的文字，留空则根据提供商自动识别
        </p>
      </div>

      {/* Min Trust Level */}
      <div>
        <label htmlFor='minTrustLevel' className='block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2'>
          最低信任等级（LinuxDo 专用）
        </label>
        <input
          id='minTrustLevel'
          type='number'
          min='0'
          placeholder='0'
          value={localConfig.minTrustLevel || 0}
          onChange={(e) => setLocalConfig({ ...localConfig, minTrustLevel: parseInt(e.target.value) || 0 })}
          className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent'
        />
        <p className='mt-1 text-xs text-gray-500 dark:text-gray-400'>
          仅对 LinuxDo 有效，0 表示不限制。其他提供商请保持为 0
        </p>
      </div>

      {/* 消息提示 */}
      {message && (
        <div
          className={`flex items-center gap-2 p-4 rounded-lg ${
            message.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
              : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className='w-5 h-5 text-green-600 dark:text-green-400' />
          ) : (
            <AlertCircle className='w-5 h-5 text-red-600 dark:text-red-400' />
          )}
          <span
            className={`text-sm ${
              message.type === 'success'
                ? 'text-green-800 dark:text-green-200'
                : 'text-red-800 dark:text-red-200'
            }`}
          >
            {message.text}
          </span>
        </div>
      )}

      {/* 保存按钮 */}
      <div className='flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700'>
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className='px-6 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors flex items-center gap-2'
        >
          <Save className='w-4 h-4' />
          {saving ? '保存中...' : '保存配置'}
        </button>
      </div>
    </div>
  );
}
