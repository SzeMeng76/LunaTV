/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import { AlertCircle, CheckCircle, User, Lock, Sparkles, UserPlus, Send } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { CURRENT_VERSION } from '@/lib/version';
import { checkForUpdates, UpdateStatus } from '@/lib/version_check';

import { useSite } from '@/components/SiteProvider';
import { ThemeToggle } from '@/components/ThemeToggle';

// 版本显示组件
function VersionDisplay() {
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkUpdate = async () => {
      try {
        const status = await checkForUpdates();
        setUpdateStatus(status);
      } catch (_) {
        // do nothing
      } finally {
        setIsChecking(false);
      }
    };

    checkUpdate();
  }, []);

  return (
    <div
      className='absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400'
    >
      <span className='font-mono'>v{CURRENT_VERSION}</span>
      {!isChecking && updateStatus !== UpdateStatus.FETCH_FAILED && (
        <div
          className={`flex items-center gap-1.5 ${updateStatus === UpdateStatus.HAS_UPDATE
            ? 'text-yellow-600 dark:text-yellow-400'
            : updateStatus === UpdateStatus.NO_UPDATE
              ? 'text-green-600 dark:text-green-400'
              : ''
            }`}
        >
          {updateStatus === UpdateStatus.HAS_UPDATE && (
            <>
              <AlertCircle className='w-3.5 h-3.5' />
              <span className='font-semibold text-xs'>有新版本</span>
            </>
          )}
          {updateStatus === UpdateStatus.NO_UPDATE && (
            <>
              <CheckCircle className='w-3.5 h-3.5' />
              <span className='font-semibold text-xs'>已是最新</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function LoginPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shouldAskUsername, setShouldAskUsername] = useState(false);
  const [bingWallpaper, setBingWallpaper] = useState<string>('');

  // Telegram Magic Link 状态
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [telegramDeepLink, setTelegramDeepLink] = useState('');
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [telegramUsername, setTelegramUsername] = useState('');

  const { siteName } = useSite();

  // 获取 Bing 每日壁纸（通过代理 API）
  useEffect(() => {
    const fetchBingWallpaper = async () => {
      try {
        const response = await fetch('/api/bing-wallpaper');
        const data = await response.json();
        if (data.url) {
          setBingWallpaper(data.url);
        }
      } catch (error) {
        console.log('Failed to fetch Bing wallpaper:', error);
      }
    };

    fetchBingWallpaper();
  }, []);

  // 在客户端挂载后设置配置
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storageType = (window as any).RUNTIME_CONFIG?.STORAGE_TYPE;
      setShouldAskUsername(storageType && storageType !== 'localstorage');
    }
  }, []);

  // 获取 Telegram Magic Link 配置
  useEffect(() => {
    const fetchTelegramConfig = async () => {
      try {
        console.log('[Login] Fetching server config...');
        const response = await fetch('/api/server-config');
        const data = await response.json();
        console.log('[Login] Server config received:', data);
        console.log('[Login] TelegramAuthConfig:', data.TelegramAuthConfig);
        if (data.TelegramAuthConfig?.enabled) {
          console.log('[Login] Telegram is enabled!');
          setTelegramEnabled(true);
        } else {
          console.log('[Login] Telegram is NOT enabled');
        }
      } catch (error) {
        console.log('Failed to fetch Telegram config:', error);
      }
    };

    fetchTelegramConfig();
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!password || (shouldAskUsername && !username)) return;

    try {
      setLoading(true);
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          ...(shouldAskUsername ? { username } : {}),
        }),
      });

      if (res.ok) {
        // 记录登入时间
        const loginTime = Date.now();
        try {
          await fetch('/api/user/my-stats', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ loginTime })
          });
          // 更新 localStorage 记录
          localStorage.setItem('lastRecordedLogin', loginTime.toString());
        } catch (error) {
          console.log('记录登入时间失败:', error);
          // 登入时间记录失败不影响正常登录流程
        }

        const redirect = searchParams.get('redirect') || '/';
        router.replace(redirect);
      } else if (res.status === 401) {
        setError('密码错误');
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? '服务器错误');
      }
    } catch (error) {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  // 生成 Telegram 登录链接
  const handleTelegramLogin = async () => {
    console.log('[Frontend] Telegram login clicked');
    setError(null);

    // 验证 Telegram 用户名
    if (!telegramUsername || telegramUsername.trim() === '') {
      setError('请输入您的 Telegram 用户名');
      return;
    }

    setTelegramLoading(true);

    try {
      console.log('[Frontend] Generating deep link for user:', telegramUsername);
      const res = await fetch('/api/telegram/send-magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramUsername: telegramUsername.trim() }),
      });

      const data = await res.json();
      console.log('[Frontend] API response:', { ok: res.ok, status: res.status, data });

      if (res.ok && data.deepLink) {
        setTelegramDeepLink(data.deepLink);
        // 自动打开 Telegram
        window.open(data.deepLink, '_blank');
      } else {
        setError(data.error || '生成链接失败，请重试');
      }
    } catch (error) {
      console.error('[Frontend] Error:', error);
      setError('网络错误，请稍后重试');
    } finally {
      setTelegramLoading(false);
    }
  };



  return (
    <div className='relative min-h-screen flex items-center justify-center px-4 overflow-hidden'>
      {/* Bing 每日壁纸背景 */}
      {bingWallpaper && (
        <div
          className='absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-1000 animate-ken-burns'
          style={{ backgroundImage: `url(${bingWallpaper})` }}
        />
      )}

      {/* 渐变叠加层 */}
      <div className='absolute inset-0 bg-gradient-to-br from-purple-600/40 via-blue-600/30 to-pink-500/40 dark:from-purple-900/50 dark:via-blue-900/40 dark:to-pink-900/50' />
      <div className='absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/30' />

      <div className='absolute top-4 right-4 z-20'>
        <ThemeToggle />
      </div>
      <div className='relative z-10 w-full max-w-md rounded-3xl bg-gradient-to-br from-white/95 via-white/85 to-white/75 dark:from-zinc-900/95 dark:via-zinc-900/85 dark:to-zinc-900/75 backdrop-blur-2xl shadow-[0_20px_80px_rgba(0,0,0,0.3)] dark:shadow-[0_20px_80px_rgba(0,0,0,0.6)] p-10 border border-white/50 dark:border-zinc-700/50 animate-fade-in hover:shadow-[0_25px_100px_rgba(0,0,0,0.4)] transition-shadow duration-500'>
        {/* 装饰性光效 */}
        <div className='absolute -top-20 -left-20 w-40 h-40 bg-gradient-to-br from-purple-400/30 to-pink-400/30 rounded-full blur-3xl animate-pulse' />
        <div className='absolute -bottom-20 -right-20 w-40 h-40 bg-gradient-to-br from-blue-400/30 to-cyan-400/30 rounded-full blur-3xl animate-pulse' style={{ animationDelay: '1s' }} />

        {/* 标题区域 */}
        <div className='text-center mb-8'>
          <div className='inline-flex items-center justify-center w-16 h-16 mb-4 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 shadow-lg shadow-green-500/50 dark:shadow-green-500/30'>
            <Sparkles className='w-8 h-8 text-white' />
          </div>
          <h1 className='text-transparent bg-clip-text bg-gradient-to-r from-green-600 via-emerald-600 to-teal-600 dark:from-green-400 dark:via-emerald-400 dark:to-teal-400 tracking-tight text-4xl font-extrabold mb-2 drop-shadow-sm'>
            {siteName}
          </h1>
          <p className='text-gray-600 dark:text-gray-400 text-sm font-medium'>欢迎回来，请登录您的账户</p>
        </div>

        <form onSubmit={handleSubmit} className='space-y-6'>
          {shouldAskUsername && (
            <div className='group'>
              <label htmlFor='username' className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
                用户名
              </label>
              <div className='relative'>
                <div className='absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none'>
                  <User className='h-5 w-5 text-gray-400 dark:text-gray-500 group-focus-within:text-green-500 transition-colors' />
                </div>
                <input
                  id='username'
                  type='text'
                  autoComplete='username'
                  className='block w-full pl-12 pr-4 py-3.5 rounded-xl border-0 text-gray-900 dark:text-gray-100 shadow-sm ring-2 ring-white/60 dark:ring-white/10 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:ring-2 focus:ring-green-500 dark:focus:ring-green-400 focus:outline-none sm:text-base bg-white/80 dark:bg-zinc-800/80 backdrop-blur transition-all duration-300 hover:shadow-md'
                  placeholder='请输入用户名'
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className='group'>
            <label htmlFor='password' className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
              密码
            </label>
            <div className='relative'>
              <div className='absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none'>
                <Lock className='h-5 w-5 text-gray-400 dark:text-gray-500 group-focus-within:text-green-500 transition-colors' />
              </div>
              <input
                id='password'
                type='password'
                autoComplete='current-password'
                className='block w-full pl-12 pr-4 py-3.5 rounded-xl border-0 text-gray-900 dark:text-gray-100 shadow-sm ring-2 ring-white/60 dark:ring-white/10 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:ring-2 focus:ring-green-500 dark:focus:ring-green-400 focus:outline-none sm:text-base bg-white/80 dark:bg-zinc-800/80 backdrop-blur transition-all duration-300 hover:shadow-md'
                placeholder='请输入访问密码'
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <div className='flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 animate-slide-down'>
              <AlertCircle className='h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0' />
              <p className='text-sm text-red-600 dark:text-red-400'>{error}</p>
            </div>
          )}

          {/* 登录按钮 */}
          <button
            type='submit'
            disabled={
              !password || loading || (shouldAskUsername && !username)
            }
            className='group relative inline-flex w-full justify-center items-center gap-2 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 py-3.5 text-base font-semibold text-white shadow-lg shadow-green-500/30 transition-all duration-300 hover:shadow-xl hover:shadow-green-500/40 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-lg overflow-hidden'
          >
            <span className='absolute inset-0 w-full h-full bg-gradient-to-r from-white/0 via-white/20 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000' />
            <Lock className='h-5 w-5' />
            {loading ? '登录中...' : '立即登录'}
          </button>

          {/* 注册链接 - 仅在非 localStorage 模式下显示 */}
          {shouldAskUsername && (
            <div className='mt-6 pt-6 border-t border-gray-200 dark:border-gray-700'>
              <p className='text-center text-gray-600 dark:text-gray-400 text-sm mb-3'>
                还没有账户？
              </p>
              <a
                href='/register'
                className='group flex items-center justify-center gap-2 w-full px-6 py-2.5 rounded-lg bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800/50 text-green-700 dark:text-green-400 text-sm font-semibold hover:from-green-100 hover:to-emerald-100 dark:hover:from-green-900/30 dark:hover:to-emerald-900/30 hover:border-green-300 dark:hover:border-green-700 transition-all duration-300 hover:shadow-md hover:scale-[1.02] active:scale-100'
              >
                <UserPlus className='w-4 h-4' />
                <span>立即注册</span>
                <span className='inline-block transition-transform group-hover:translate-x-1'>→</span>
              </a>
            </div>
          )}
        </form>

        {/* Telegram Magic Link 登录 */}
        {telegramEnabled && (
          <div className='mt-6 pt-6 border-t border-gray-200 dark:border-gray-700'>
            <p className='text-center text-gray-600 dark:text-gray-400 text-sm mb-4'>
              或使用 Telegram 登录
            </p>

            {/* Telegram 用户名输入 */}
            <div className='mb-4'>
              <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
                Telegram 用户名
              </label>
              <div className='relative'>
                <div className='absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none'>
                  <Send className='h-5 w-5 text-gray-400' />
                </div>
                <input
                  type='text'
                  value={telegramUsername}
                  onChange={(e) => setTelegramUsername(e.target.value)}
                  placeholder='输入您的 Telegram 用户名'
                  className='block w-full pl-10 pr-3 py-3 border border-gray-300 dark:border-gray-600 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white transition-all'
                  disabled={telegramLoading}
                />
              </div>
              <p className='mt-2 text-xs text-gray-500 dark:text-gray-400'>
                💡 输入您的 Telegram 用户名（不含 @）
              </p>
            </div>

            <button
              onClick={handleTelegramLogin}
              disabled={telegramLoading || !telegramUsername.trim()}
              className='group relative inline-flex w-full justify-center items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 py-3.5 text-base font-semibold text-white shadow-lg shadow-blue-500/30 transition-all duration-300 hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-lg overflow-hidden'
            >
              <span className='absolute inset-0 w-full h-full bg-gradient-to-r from-white/0 via-white/20 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000' />
              <Send className='h-5 w-5' />
              {telegramLoading ? '正在打开 Telegram...' : '通过 Telegram 登录'}
            </button>

            {telegramDeepLink && (
              <div className='mt-4 p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50'>
                <p className='text-sm text-blue-800 dark:text-blue-200 mb-2'>
                  📱 已在新标签页打开 Telegram
                </p>
                <p className='text-xs text-blue-600 dark:text-blue-300'>
                  如果没有自动打开，请点击{' '}
                  <a
                    href={telegramDeepLink}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='underline font-semibold'
                  >
                    这里
                  </a>
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 版本信息显示 */}
      <VersionDisplay />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LoginPageClient />
    </Suspense>
  );
}
