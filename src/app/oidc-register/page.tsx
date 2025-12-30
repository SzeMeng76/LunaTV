'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { CURRENT_VERSION } from '@/lib/version';

import { useSite } from '@/components/SiteProvider';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function OIDCRegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [oidcInfo, setOidcInfo] = useState<any>(null);

  const { siteName } = useSite();

  // 检查OIDC session
  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch('/api/auth/oidc/session-info');
        if (res.ok) {
          const data = await res.json();
          setOidcInfo(data);
        } else {
          // session无效,跳转到登录页
          router.replace('/login?error=' + encodeURIComponent('OIDC会话已过期'));
        }
      } catch (error) {
        console.error('检查session失败:', error);
        router.replace('/login');
      }
    };

    checkSession();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!username) {
      setError('请输入用户名');
      return;
    }

    try {
      setLoading(true);
      const res = await fetch('/api/auth/oidc/complete-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });

      if (res.ok) {
        const data = await res.json();
        // Upstash 需要额外延迟等待数据同步
        const delay = data.needDelay ? 1500 : 0;

        setTimeout(() => {
          router.replace('/');
        }, delay);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || '注册失败');
      }
    } catch (error) {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  if (!oidcInfo) {
    return (
      <div className='relative min-h-screen flex items-center justify-center px-3 sm:px-4'>
        <div className='text-sm sm:text-base text-gray-500 dark:text-gray-400'>加载中...</div>
      </div>
    );
  }

  return (
    <div className='relative min-h-screen flex items-center justify-center px-3 sm:px-4 py-8 sm:py-0 overflow-hidden'>
      <div className='absolute top-3 right-3 sm:top-4 sm:right-4 z-20'>
        <ThemeToggle />
      </div>
      <div className='relative z-10 w-full max-w-md rounded-2xl sm:rounded-3xl bg-gradient-to-b from-white/90 via-white/70 to-white/40 dark:from-zinc-900/90 dark:via-zinc-900/70 dark:to-zinc-900/40 backdrop-blur-xl shadow-2xl p-6 sm:p-10 dark:border dark:border-zinc-800'
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
        }}
      >
        {/* Fallback for browsers without backdrop-filter support */}
        <style jsx>{`
          @supports (backdrop-filter: blur(12px)) or (-webkit-backdrop-filter: blur(12px)) {
            div {
              background-color: transparent !important;
            }
          }
        `}</style>
        <h1 className='text-green-600 tracking-tight text-center text-2xl sm:text-3xl font-extrabold mb-2 bg-clip-text drop-shadow-sm'>
          {siteName}
        </h1>
        <p className='text-center text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-6 sm:mb-8'>
          完成OIDC注册
        </p>

        {/* OIDC信息显示 */}
        {oidcInfo && (
          <div className='mb-5 sm:mb-6 p-3 sm:p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg'>
            <p className='text-xs sm:text-sm text-blue-700 dark:text-blue-400 leading-relaxed'>
              {oidcInfo.email && (
                <>
                  邮箱: <strong className='break-all'>{oidcInfo.email}</strong>
                  <br />
                </>
              )}
              {oidcInfo.name && (
                <>
                  名称: <strong className='break-all'>{oidcInfo.name}</strong>
                  <br />
                </>
              )}
              {oidcInfo.trust_level !== undefined && (
                <>
                  信任等级: <strong>{oidcInfo.trust_level}</strong>
                </>
              )}
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className='space-y-5 sm:space-y-6'>
          <div>
            <label htmlFor='username' className='block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 sm:mb-2'>
              选择用户名
            </label>
            <input
              id='username'
              type='text'
              autoComplete='username'
              className='block w-full rounded-lg border-0 py-2.5 sm:py-3 px-3 sm:px-4 text-gray-900 dark:text-gray-100 shadow-sm ring-1 ring-white/60 dark:ring-white/20 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-2 focus:ring-green-500 focus:outline-none text-sm sm:text-base bg-white/60 dark:bg-zinc-800/60 backdrop-blur transition-all'
              placeholder='输入用户名（3-20位）'
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <p className='mt-1.5 text-[11px] sm:text-xs text-gray-500 dark:text-gray-400'>
              用户名只能包含字母、数字、下划线，长度3-20位
            </p>
          </div>

          {error && (
            <div className='p-2.5 sm:p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50'>
              <p className='text-xs sm:text-sm text-red-600 dark:text-red-400'>{error}</p>
            </div>
          )}

          <button
            type='submit'
            disabled={!username || loading}
            className='inline-flex w-full justify-center rounded-lg bg-green-600 py-2.5 sm:py-3 text-sm sm:text-base font-semibold text-white shadow-lg transition-all duration-200 hover:bg-green-700 hover:shadow-xl hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-lg active:scale-95'
          >
            {loading ? '注册中...' : '完成注册'}
          </button>

          {/* 返回登录链接 */}
          <div className='text-center pt-2'>
            <a
              href='/login'
              className='text-xs sm:text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors inline-flex items-center gap-1'
            >
              <span>←</span>
              <span>返回登录</span>
            </a>
          </div>
        </form>

        {/* 版本信息 */}
        <div className='mt-6 sm:mt-8 text-center text-[11px] sm:text-xs text-gray-500 dark:text-gray-400'>
          v{CURRENT_VERSION}
        </div>
      </div>
    </div>
  );
}
