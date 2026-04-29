'use client';

import { useState, useEffect } from 'react';
import { AdminConfig } from '@/lib/admin.types';

interface BilibiliConfigProps {
  config: AdminConfig;
  refreshConfig: () => void;
}

const BilibiliConfig = ({ config, refreshConfig }: BilibiliConfigProps) => {
  const [enabled, setEnabled] = useState(config.BilibiliConfig?.enabled || false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 登录相关状态
  const [showQRCode, setShowQRCode] = useState(false);
  const [qrcodeUrl, setQrcodeUrl] = useState('');
  const [qrcodeKey, setQrcodeKey] = useState('');
  const [pollStatus, setPollStatus] = useState<'waiting' | 'scanned' | 'success' | 'expired' | 'error'>('waiting');
  const [pollMessage, setPollMessage] = useState('');
  const [isPolling, setIsPolling] = useState(false);

  const [polling, setPolling] = useState(false);

  const isLoggedIn = config.BilibiliConfig?.loginStatus === 'logged_in';
  const userInfo = config.BilibiliConfig?.userInfo;
  const expireTime = config.BilibiliConfig?.expireTime;
  const loginTime = config.BilibiliConfig?.loginTime;

  // 检查登录状态
  const handleCheckStatus = async () => {
    try {
      const response = await fetch('/api/admin/bilibili/check', {
        method: 'POST',
      });

      const data = await response.json();

      if (data.success) {
        if (data.valid) {
          setMessage({ type: 'success', text: 'Cookie 有效' });
          refreshConfig();
        } else {
          setMessage({ type: 'error', text: 'Cookie 已过期，请重新登录' });
          refreshConfig();
        }
      } else {
        setMessage({ type: 'error', text: '检查失败' });
      }
    } catch (error) {
      console.error('检查登录状态失败:', error);
      setMessage({ type: 'error', text: '检查失败' });
    }
  };

  // 格式化时间
  const formatTime = (timestamp?: number) => {
    if (!timestamp) return '未知';
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 计算剩余天数
  const getRemainingDays = (expireTimestamp?: number) => {
    if (!expireTimestamp) return null;
    const now = Date.now();
    const remaining = expireTimestamp - now;
    if (remaining <= 0) return 0;
    return Math.ceil(remaining / (1000 * 60 * 60 * 24));
  };

  const remainingDays = getRemainingDays(expireTime);

  // 获取二维码
  const handleGetQRCode = async () => {
    try {
      const response = await fetch('/api/admin/bilibili/qrcode');
      const data = await response.json();

      if (data.success) {
        setQrcodeUrl(data.qrcodeUrl);
        setQrcodeKey(data.qrcodeKey);
        setShowQRCode(true);
        setPollStatus('waiting');
        setPollMessage('请使用 B站 APP 扫码登录');
        // 开始轮询
        startPolling(data.qrcodeKey);
      } else {
        setMessage({ type: 'error', text: '获取二维码失败' });
      }
    } catch (error) {
      console.error('获取二维码失败:', error);
      setMessage({ type: 'error', text: '获取二维码失败' });
    }
  };

  // 轮询登录状态
  const startPolling = (key: string) => {
    setIsPolling(true);
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch('/api/admin/bilibili/poll', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ qrcodeKey: key }),
        });

        const data = await response.json();

        if (data.success) {
          setPollStatus(data.status);
          setPollMessage(data.message);

          if (data.status === 'success') {
            clearInterval(pollInterval);
            setIsPolling(false);
            setShowQRCode(false);
            setMessage({ type: 'success', text: '登录成功' });
            refreshConfig();
          } else if (data.status === 'expired' || data.status === 'error') {
            clearInterval(pollInterval);
            setIsPolling(false);
          }
        }
      } catch (error) {
        console.error('轮询登录状态失败:', error);
        clearInterval(pollInterval);
        setIsPolling(false);
      }
    }, 2000); // 每2秒轮询一次

    // 3分钟后停止轮询
    setTimeout(() => {
      clearInterval(pollInterval);
      setIsPolling(false);
      if (pollStatus !== 'success') {
        setPollStatus('expired');
        setPollMessage('二维码已过期');
      }
    }, 180000);
  };

  // 退出登录
  const handleLogout = async () => {
    try {
      const response = await fetch('/api/admin/bilibili/logout', {
        method: 'POST',
      });

      if (response.ok) {
        setMessage({ type: 'success', text: '已退出登录' });
        refreshConfig();
      } else {
        setMessage({ type: 'error', text: '退出登录失败' });
      }
    } catch (error) {
      console.error('退出登录失败:', error);
      setMessage({ type: 'error', text: '退出登录失败' });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch('/api/admin/bilibili', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          enabled,
        }),
      });

      if (!response.ok) {
        throw new Error('保存失败');
      }

      setMessage({ type: 'success', text: 'B站配置已保存' });
      refreshConfig();
    } catch (error) {
      console.error('保存B站配置失败:', error);
      setMessage({ type: 'error', text: '保存失败，请重试' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 登录状态 */}
      {isLoggedIn && userInfo && (
        <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-green-900 dark:text-green-100 mb-3">
            ✅ 已登录
          </h3>
          <div className="flex items-center space-x-4 mb-4">
            {userInfo.face && (
              <img
                src={`/api/image-proxy?url=${encodeURIComponent(userInfo.face)}`}
                alt={userInfo.username}
                className="w-16 h-16 rounded-full"
              />
            )}
            <div>
              <p className="text-sm font-medium text-green-800 dark:text-green-200">
                {userInfo.username}
              </p>
              <p className="text-xs text-green-600 dark:text-green-300">
                UID: {userInfo.mid}
              </p>
              {userInfo.isVip && (
                <span className="inline-block mt-1 px-2 py-0.5 text-xs bg-pink-500 text-white rounded">
                  大会员
                </span>
              )}
            </div>
          </div>

          {/* Cookie 信息 */}
          <div className="space-y-2 text-sm text-green-800 dark:text-green-200 mb-4">
            {loginTime && (
              <p>
                <span className="font-medium">登录时间：</span>
                {formatTime(loginTime)}
              </p>
            )}
            {expireTime && (
              <p>
                <span className="font-medium">过期时间：</span>
                {formatTime(expireTime)}
                {remainingDays !== null && (
                  <span className={`ml-2 ${remainingDays < 7 ? 'text-red-600 dark:text-red-400 font-semibold' : ''}`}>
                    （剩余 {remainingDays} 天）
                  </span>
                )}
              </p>
            )}
          </div>

          <div className="flex space-x-2">
            <button
              onClick={handleCheckStatus}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors text-sm"
            >
              刷新状态
            </button>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors text-sm"
            >
              退出登录
            </button>
          </div>
        </div>
      )}

      {/* 未登录 - 显示登录按钮 */}
      {!isLoggedIn && !showQRCode && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
            🔐 账号登录（可选）
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            登录后搜索时会使用你的账号凭证，可能获得更好的搜索结果
          </p>
          <button
            onClick={handleGetQRCode}
            className="px-6 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-lg transition-colors font-medium"
          >
            扫码登录
          </button>
        </div>
      )}

      {/* 二维码登录界面 */}
      {showQRCode && (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            扫码登录 B站
          </h3>
          <div className="flex flex-col items-center space-y-4">
            {qrcodeUrl && (
              <div className="bg-white p-4 rounded-lg">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrcodeUrl)}`}
                  alt="登录二维码"
                  className="w-48 h-48"
                />
              </div>
            )}
            <div className="text-center">
              <p className={`text-sm font-medium ${
                pollStatus === 'waiting' ? 'text-gray-600 dark:text-gray-400' :
                pollStatus === 'scanned' ? 'text-blue-600 dark:text-blue-400' :
                pollStatus === 'success' ? 'text-green-600 dark:text-green-400' :
                pollStatus === 'expired' ? 'text-red-600 dark:text-red-400' :
                'text-gray-600 dark:text-gray-400'
              }`}>
                {pollMessage}
              </p>
              {isPolling && (
                <div className="mt-2 flex items-center justify-center space-x-2">
                  <div className="w-2 h-2 bg-pink-500 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-pink-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-pink-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
              )}
            </div>
            {(pollStatus === 'expired' || pollStatus === 'error') && (
              <button
                onClick={handleGetQRCode}
                className="px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-lg transition-colors text-sm"
              >
                重新获取二维码
              </button>
            )}
            <button
              onClick={() => {
                setShowQRCode(false);
                setIsPolling(false);
              }}
              className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors text-sm"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 基础设置 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          ⚙️ 基础设置
        </h3>

        <div className="space-y-4">
          {/* 启用开关 */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                启用 B站搜索功能
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                开启后用户可以搜索 B站视频和番剧
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-pink-300 dark:peer-focus:ring-pink-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-pink-600"></div>
            </label>
          </div>
        </div>
      </div>

      {/* 功能说明 */}
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-3">
          💡 功能说明
        </h3>
        <ul className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
          <li className="flex items-start">
            <span className="mr-2">•</span>
            <span>支持搜索 B站视频和番剧内容</span>
          </li>
          <li className="flex items-start">
            <span className="mr-2">•</span>
            <span>使用 iframe embed 播放器，无需解析视频地址</span>
          </li>
          <li className="flex items-start">
            <span className="mr-2">•</span>
            <span>自动处理 Wbi 签名，绕过反爬虫验证</span>
          </li>
          <li className="flex items-start">
            <span className="mr-2">•</span>
            <span>会员内容需要用户自己登录 B站账号</span>
          </li>
        </ul>
      </div>

      {/* 注意事项 */}
      <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-yellow-900 dark:text-yellow-100 mb-3">
          ⚠️ 注意事项
        </h3>
        <ul className="space-y-2 text-sm text-yellow-800 dark:text-yellow-200">
          <li className="flex items-start">
            <span className="mr-2">•</span>
            <span>搜索功能无需代理，海外服务器也可使用</span>
          </li>
          <li className="flex items-start">
            <span className="mr-2">•</span>
            <span className="font-semibold">
              {isLoggedIn
                ? '✅ 已登录：搜索时会使用管理员凭证，可能看到更多结果'
                : '❌ 未登录：搜索结果可能受限'}
            </span>
          </li>
          <li className="flex items-start">
            <span className="mr-2">•</span>
            <span className="font-semibold text-red-600 dark:text-red-400">
              ⚠️ 播放限制：iframe 播放器是用户浏览器直接访问 B站，无法使用服务器端登录凭证
            </span>
          </li>
          <li className="flex items-start">
            <span className="mr-2">•</span>
            <span>
              要观看会员内容，用户需要在自己的浏览器登录 B站账号（打开 bilibili.com 登录）
            </span>
          </li>
          <li className="flex items-start">
            <span className="mr-2">•</span>
            <span>番剧/影视内容有地区限制，用户需要自己配置 VPN</span>
          </li>
        </ul>
      </div>

      {/* 保存按钮 */}
      <div className="flex items-center justify-between">
        <div>
          {message && (
            <div
              className={`text-sm ${
                message.type === 'success'
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {message.text}
            </div>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 bg-pink-600 hover:bg-pink-700 disabled:bg-gray-400 text-white rounded-lg transition-colors font-medium"
        >
          {saving ? '保存中...' : '保存设置'}
        </button>
      </div>
    </div>
  );
};

export default BilibiliConfig;
