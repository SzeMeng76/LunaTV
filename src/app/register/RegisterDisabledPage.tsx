'use client';

import { AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useSite } from '@/components/SiteProvider';
import { ThemeToggle } from '@/components/ThemeToggle';

import { VersionDisplay } from './VersionDisplay';

interface RegisterDisabledPageProps {
  reason: string;
}

export default function RegisterDisabledPage({ reason }: RegisterDisabledPageProps) {
  const router = useRouter();
  const { siteName } = useSite();
  const [bingWallpaper, setBingWallpaper] = useState<string>('');

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

  return (
    <div className='relative min-h-screen flex items-center justify-center px-4 overflow-hidden bg-gradient-to-br from-purple-100 via-blue-50 to-pink-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900'>
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
      <div className='relative z-10 w-full max-w-md rounded-3xl bg-gradient-to-br from-white/95 via-white/85 to-white/75 dark:from-zinc-900/95 dark:via-zinc-900/85 dark:to-zinc-900/75 backdrop-blur-2xl shadow-[0_20px_80px_rgba(0,0,0,0.3)] dark:shadow-[0_20px_80px_rgba(0,0,0,0.6)] p-10 border border-white/50 dark:border-zinc-700/50 animate-fade-in hover:shadow-[0_25px_100px_rgba(0,0,0,0.4)] transition-shadow duration-500'
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
        }}
      >
        {/* Fallback for browsers without backdrop-filter support */}
        <style jsx>{`
          @supports (backdrop-filter: blur(24px)) or (-webkit-backdrop-filter: blur(24px)) {
            div {
              background-color: transparent !important;
            }
          }
        `}</style>
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
              {reason || '管理员已关闭用户注册功能'}
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
