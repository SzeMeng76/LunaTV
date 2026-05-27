/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { LogIn, Trash2, RefreshCw, Monitor, Globe, User, Clock, MapPin, AlertTriangle } from 'lucide-react';

interface LoginLog {
  id: string;
  username: string;
  loginTime: number;
  ip: string;
  location: string;
  userAgent?: string;
  loginMethod?: string;
}

export default function LoginLogsPanel() {
  const [logs, setLogs] = useState<LoginLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/login-logs?limit=200');
      if (!res.ok) throw new Error('获取登录日志失败');
      const data = await res.json();
      setLogs(data.logs || []);
    } catch (err: any) {
      setError(err.message || '获取登录日志失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleClear = async () => {
    try {
      const res = await fetch('/api/admin/login-logs', { method: 'DELETE' });
      if (!res.ok) throw new Error('清除登录日志失败');
      setLogs([]);
      setShowClearConfirm(false);
    } catch (err: any) {
      setError(err.message || '清除登录日志失败');
    }
  };

  const formatTime = (timestamp: number) => {
    const d = new Date(timestamp);
    return d.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getMethodLabel = (method?: string) => {
    if (!method) return '密码';
    if (method === 'password') return '密码';
    if (method.startsWith('oidc-')) {
      const provider = method.replace('oidc-', '');
      const labels: Record<string, string> = {
        google: 'Google',
        github: 'GitHub',
        microsoft: 'Microsoft',
        apple: 'Apple',
        facebook: 'Facebook',
        wechat: '微信',
      };
      return labels[provider] || `OIDC(${provider})`;
    }
    if (method === 'telegram') return 'Telegram';
    return method;
  };

  const getMethodBadgeColor = (method?: string) => {
    if (!method || method === 'password') return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    if (method === 'telegram') return 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400';
    if (method.startsWith('oidc-')) return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
    return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
  };

  const parseUserAgent = (ua?: string) => {
    if (!ua) return { browser: '未知', os: '未知' };
    let browser = '未知';
    let os = '未知';

    if (ua.includes('Edg/')) browser = 'Edge';
    else if (ua.includes('Chrome/') && !ua.includes('Edg/')) browser = 'Chrome';
    else if (ua.includes('Firefox/')) browser = 'Firefox';
    else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Safari';
    else if (ua.includes('MicroMessenger/')) browser = '微信';

    if (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('Mac OS X')) os = 'macOS';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
    else if (ua.includes('Linux')) os = 'Linux';

    return { browser, os };
  };

  if (loading) {
    return (
      <div className='flex items-center justify-center py-20'>
        <RefreshCw size={24} className='animate-spin text-emerald-500' />
        <span className='ml-3 text-gray-500 dark:text-gray-400'>加载登录日志...</span>
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-2'>
          <LogIn size={20} className='text-emerald-600 dark:text-emerald-400' />
          <h3 className='text-lg font-semibold text-gray-900 dark:text-gray-100'>登录日志</h3>
          <span className='text-sm text-gray-500 dark:text-gray-400'>({logs.length} 条记录)</span>
        </div>
        <div className='flex items-center gap-2'>
          <button
            onClick={fetchLogs}
            className='flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors'
          >
            <RefreshCw size={14} />
            刷新
          </button>
          {logs.length > 0 && (
            <button
              onClick={() => setShowClearConfirm(true)}
              className='flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors'
            >
              <Trash2 size={14} />
              清空
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className='flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm'>
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {showClearConfirm && (
        <div className='flex items-center gap-3 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'>
          <AlertTriangle size={20} className='text-red-500 flex-shrink-0' />
          <span className='text-sm text-red-700 dark:text-red-300'>确定要清空所有登录日志吗？此操作不可恢复。</span>
          <button
            onClick={handleClear}
            className='px-3 py-1 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors'
          >
            确定清空
          </button>
          <button
            onClick={() => setShowClearConfirm(false)}
            className='px-3 py-1 rounded-lg text-sm font-medium bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors'
          >
            取消
          </button>
        </div>
      )}

      {logs.length === 0 ? (
        <div className='text-center py-16 text-gray-400 dark:text-gray-500'>
          <LogIn size={48} className='mx-auto mb-4 opacity-30' />
          <p>暂无登录日志</p>
          <p className='text-sm mt-1'>用户登录后将自动记录</p>
        </div>
      ) : (
        <div className='overflow-x-auto'>
          <table className='w-full text-sm'>
            <thead>
              <tr className='border-b border-gray-200 dark:border-gray-700'>
                <th className='text-left py-3 px-3 font-medium text-gray-500 dark:text-gray-400'>
                  <div className='flex items-center gap-1'><User size={14} />用户名</div>
                </th>
                <th className='text-left py-3 px-3 font-medium text-gray-500 dark:text-gray-400'>
                  <div className='flex items-center gap-1'><Clock size={14} />登录时间</div>
                </th>
                <th className='text-left py-3 px-3 font-medium text-gray-500 dark:text-gray-400'>
                  <div className='flex items-center gap-1'><Globe size={14} />IP地址</div>
                </th>
                <th className='text-left py-3 px-3 font-medium text-gray-500 dark:text-gray-400'>
                  <div className='flex items-center gap-1'><MapPin size={14} />归属地</div>
                </th>
                <th className='text-left py-3 px-3 font-medium text-gray-500 dark:text-gray-400'>
                  <div className='flex items-center gap-1'><LogIn size={14} />方式</div>
                </th>
                <th className='text-left py-3 px-3 font-medium text-gray-500 dark:text-gray-400'>
                  <div className='flex items-center gap-1'><Monitor size={14} />设备</div>
                </th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const { browser, os } = parseUserAgent(log.userAgent);
                return (
                  <tr key={log.id} className='border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors'>
                    <td className='py-3 px-3'>
                      <span className='font-medium text-gray-900 dark:text-gray-100'>{log.username || '(未命名)'}</span>
                    </td>
                    <td className='py-3 px-3 text-gray-600 dark:text-gray-400 whitespace-nowrap'>
                      {formatTime(log.loginTime)}
                    </td>
                    <td className='py-3 px-3'>
                      <code className='text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'>
                        {log.ip}
                      </code>
                    </td>
                    <td className='py-3 px-3 text-gray-600 dark:text-gray-400'>
                      {log.location || '未知'}
                    </td>
                    <td className='py-3 px-3'>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${getMethodBadgeColor(log.loginMethod)}`}>
                        {getMethodLabel(log.loginMethod)}
                      </span>
                    </td>
                    <td className='py-3 px-3 text-gray-600 dark:text-gray-400 whitespace-nowrap'>
                      {browser} / {os}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
