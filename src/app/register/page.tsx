/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import { AlertCircle, CheckCircle, User, Lock, Sparkles, UserPlus, Shield } from 'lucide-react';
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

function RegisterPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shouldShowRegister, setShouldShowRegister] = useState(false);
  const [registrationDisabled, setRegistrationDisabled] = useState(false);
  const [disabledReason, setDisabledReason] = useState('');
  const [bingWallpaper, setBingWallpaper] = useState<string>('');

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

  // 检查注册是否可用
  useEffect(() => {
    const checkRegistrationAvailable = async () => {
      try {
        // 用空数据检测，这样不会创建用户但能得到正确的错误信息
        const res = await fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: '', password: '', confirmPassword: '' }),
        });
        
        const data = await res.json();
        
        // 如果是localStorage模式，跳转登录
        if (data.error === 'localStorage 模式不支持用户注册') {
          router.replace('/login');
          return;
        }
        
        // 如果是管理员关闭了注册
        if (data.error === '管理员已关闭用户注册功能') {
          setRegistrationDisabled(true);
          setDisabledReason('管理员已关闭用户注册功能');
          setShouldShowRegister(true);
          return;
        }
        
        // 其他情况显示注册表单（包括用户名已存在等正常的验证错误）
        setShouldShowRegister(true);
      } catch (error) {
        // 网络错误也显示注册页面
        setShouldShowRegister(true);
      }
    };

    checkRegistrationAvailable();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!username || !password || !confirmPassword) {
      setError('请填写完整信息');
      return;
    }

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    try {
      setLoading(true);
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          confirmPassword,
        }),
      });

      if (res.ok) {
        await res.json(); // 读取响应但不使用
        // 显示成功消息，稍等一下再跳转
        setError(null);
        setSuccess('注册成功！正在跳转...');
        // 给用户一个成功提示，然后再跳转
        setTimeout(() => {
          const redirect = searchParams.get('redirect') || '/';
          router.replace(redirect);
        }, 1500); // 1.5秒后跳转，让用户看到成功消息
      } else {
        const data = await res.json();
        setError(data.error ?? '注册失败');
      }
    } catch (error) {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  if (!shouldShowRegister) {
    return <div>Loading...</div>;
  }

  // 如果注册被禁用，显示提示页面
  if (registrationDisabled) {
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
          <div className='absolute -top-20 -left-20 w-40 h-40 bg-gradient-to-br from-yellow-400/30 to-orange-400/30 rounded-full blur-3xl animate-pulse' />
          <div className='absolute -bottom-20 -right-20 w-40 h-40 bg-gradient-to-br from-blue-400/30 to-purple-400/30 rounded-full blur-3xl animate-pulse' style={{ animationDelay: '1s' }} />

          <div className='text-center mb-8'>
            <div className='inline-flex items-center justify-center w-16 h-16 mb-4 rounded-2xl bg-gradient-to-br from-yellow-500 to-orange-600 shadow-lg shadow-yellow-500/50 dark:shadow-yellow-500/30'>
              <AlertCircle className='w-8 h-8 text-white' />
            </div>
            <h1 className='text-transparent bg-clip-text bg-gradient-to-r from-yellow-600 via-orange-600 to-red-600 dark:from-yellow-400 dark:via-orange-400 dark:to-red-400 tracking-tight text-4xl font-extrabold mb-2 drop-shadow-sm'>
              {siteName}
            </h1>
          </div>
          <div className='text-center space-y-6'>
            <h2 className='text-xl font-semibold text-gray-800 dark:text-gray-200'>
              注册功能暂不可用
            </h2>
            <div className='p-4 rounded-xl bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800/50'>
              <p className='text-gray-700 dark:text-gray-300 text-sm leading-relaxed'>
                {disabledReason || '管理员已关闭用户注册功能'}
              </p>
            </div>
            <p className='text-gray-500 dark:text-gray-500 text-xs'>
              如需注册账户，请联系网站管理员
            </p>
            <button
              onClick={() => router.push('/login')}
              className='group relative inline-flex w-full justify-center items-center gap-2 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 py-3.5 text-base font-semibold text-white shadow-lg shadow-green-500/30 transition-all duration-300 hover:shadow-xl hover:shadow-green-500/40 hover:-translate-y-0.5 overflow-hidden'
            >
              <span className='absolute inset-0 w-full h-full bg-gradient-to-r from-white/0 via-white/20 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000' />
              返回登录 →
            </button>
          </div>
        </div>
        <VersionDisplay />
      </div>
    );
  }

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
        <div className='absolute -top-20 -left-20 w-40 h-40 bg-gradient-to-br from-blue-400/30 to-cyan-400/30 rounded-full blur-3xl animate-pulse' />
        <div className='absolute -bottom-20 -right-20 w-40 h-40 bg-gradient-to-br from-purple-400/30 to-pink-400/30 rounded-full blur-3xl animate-pulse' style={{ animationDelay: '1s' }} />

        {/* 标题区域 */}
        <div className='text-center mb-8'>
          <div className='inline-flex items-center justify-center w-16 h-16 mb-4 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/50 dark:shadow-blue-500/30'>
            <UserPlus className='w-8 h-8 text-white' />
          </div>
          <h1 className='text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 dark:from-blue-400 dark:via-indigo-400 dark:to-purple-400 tracking-tight text-4xl font-extrabold mb-2 drop-shadow-sm'>
            {siteName}
          </h1>
          <p className='text-gray-600 dark:text-gray-400 text-sm font-medium'>创建您的新账户</p>
        </div>

        <form onSubmit={handleSubmit} className='space-y-5'>
          <div className='group'>
            <label htmlFor='username' className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
              用户名
            </label>
            <div className='relative'>
              <div className='absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none'>
                <User className='h-5 w-5 text-gray-400 dark:text-gray-500 group-focus-within:text-blue-500 transition-colors' />
              </div>
              <input
                id='username'
                type='text'
                autoComplete='username'
                className='block w-full pl-12 pr-4 py-3.5 rounded-xl border-0 text-gray-900 dark:text-gray-100 shadow-sm ring-2 ring-white/60 dark:ring-white/10 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:outline-none sm:text-base bg-white/80 dark:bg-zinc-800/80 backdrop-blur transition-all duration-300 hover:shadow-md'
                placeholder='3-20位字母数字下划线'
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          </div>

          <div className='group'>
            <label htmlFor='password' className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
              密码
            </label>
            <div className='relative'>
              <div className='absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none'>
                <Lock className='h-5 w-5 text-gray-400 dark:text-gray-500 group-focus-within:text-blue-500 transition-colors' />
              </div>
              <input
                id='password'
                type='password'
                autoComplete='new-password'
                className='block w-full pl-12 pr-4 py-3.5 rounded-xl border-0 text-gray-900 dark:text-gray-100 shadow-sm ring-2 ring-white/60 dark:ring-white/10 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:outline-none sm:text-base bg-white/80 dark:bg-zinc-800/80 backdrop-blur transition-all duration-300 hover:shadow-md'
                placeholder='至少6位字符'
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div className='group'>
            <label htmlFor='confirmPassword' className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
              确认密码
            </label>
            <div className='relative'>
              <div className='absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none'>
                <Shield className='h-5 w-5 text-gray-400 dark:text-gray-500 group-focus-within:text-blue-500 transition-colors' />
              </div>
              <input
                id='confirmPassword'
                type='password'
                autoComplete='new-password'
                className='block w-full pl-12 pr-4 py-3.5 rounded-xl border-0 text-gray-900 dark:text-gray-100 shadow-sm ring-2 ring-white/60 dark:ring-white/10 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:outline-none sm:text-base bg-white/80 dark:bg-zinc-800/80 backdrop-blur transition-all duration-300 hover:shadow-md'
                placeholder='再次输入密码'
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <div className='flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 animate-slide-down'>
              <AlertCircle className='h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0' />
              <p className='text-sm text-red-600 dark:text-red-400'>{error}</p>
            </div>
          )}

          {success && (
            <div className='flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/50 animate-slide-down'>
              <CheckCircle className='h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0' />
              <p className='text-sm text-green-600 dark:text-green-400'>{success}</p>
            </div>
          )}

          <button
            type='submit'
            disabled={
              !username || !password || !confirmPassword || loading || !!success
            }
            className='group relative inline-flex w-full justify-center items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 py-3.5 text-base font-semibold text-white shadow-lg shadow-blue-500/30 transition-all duration-300 hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-lg overflow-hidden'
          >
            <span className='absolute inset-0 w-full h-full bg-gradient-to-r from-white/0 via-white/20 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000' />
            <UserPlus className='h-5 w-5' />
            {loading ? '注册中...' : success ? '注册成功，正在跳转...' : '立即注册'}
          </button>

          <div className='mt-6 pt-6 border-t border-gray-200 dark:border-gray-700'>
            <p className='text-center text-gray-600 dark:text-gray-400 text-sm mb-3'>
              已有账户？
            </p>
            <a
              href='/login'
              className='group flex items-center justify-center gap-2 w-full px-6 py-2.5 rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800/50 text-blue-700 dark:text-blue-400 text-sm font-semibold hover:from-blue-100 hover:to-indigo-100 dark:hover:from-blue-900/30 dark:hover:to-indigo-900/30 hover:border-blue-300 dark:hover:border-blue-700 transition-all duration-300 hover:shadow-md hover:scale-[1.02] active:scale-100'
            >
              <Lock className='w-4 h-4' />
              <span>立即登录</span>
              <span className='inline-block transition-transform group-hover:translate-x-1'>→</span>
            </a>
          </div>
        </form>
      </div>

      <VersionDisplay />
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <RegisterPageClient />
    </Suspense>
  );
}