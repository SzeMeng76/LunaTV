/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { cookies } from 'next/headers';
import { Suspense } from 'react';
import { Toaster } from 'sonner';

import './globals.css';

import { getConfig } from '@/lib/config';

import { GlobalErrorIndicator } from '../components/GlobalErrorIndicator';
import { SessionTracker } from '../components/SessionTracker';
import { SiteProvider } from '../components/SiteProvider';
import { ThemeProvider } from '../components/ThemeProvider';
import { WatchRoomProvider } from '../components/WatchRoomProvider';
import { DownloadProvider } from '../contexts/DownloadContext';
import { GlobalCacheProvider } from '../contexts/GlobalCacheContext';
import { DownloadPanel } from '../components/download/DownloadPanel';
import ChatFloatingWindow from '../components/watch-room/ChatFloatingWindow';
import QueryProvider from '../components/QueryProvider';

const inter = Inter({ subsets: ['latin'] });
export const dynamic = 'force-dynamic';

// 动态生成 metadata，支持配置更新后的标题变化
export async function generateMetadata(): Promise<Metadata> {
  // 🔥 调用 cookies() 强制动态渲染，防止 Docker 环境下的缓存问题
  await cookies();

  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  const config = await getConfig();
  let siteName = process.env.NEXT_PUBLIC_SITE_NAME || 'MoonTV';
  if (storageType !== 'localstorage') {
    siteName = config.SiteConfig.SiteName;
  }

  return {
    title: siteName,
    description: '影视聚合',
    manifest: '/manifest.json',
  };
}

export const viewport: Viewport = {
  viewportFit: 'cover',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 🔥 调用 cookies() 强制动态渲染，防止 Docker 环境下的缓存问题
  await cookies();

  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';

  let siteName = process.env.NEXT_PUBLIC_SITE_NAME || 'MoonTV';
  let announcement =
    process.env.ANNOUNCEMENT ||
    '本网站仅提供影视信息搜索服务，所有内容均来自第三方网站。本站不存储任何视频资源，不对任何内容的准确性、合法性、完整性负责。';

  let doubanProxyType = process.env.NEXT_PUBLIC_DOUBAN_PROXY_TYPE || 'direct';
  let doubanProxy = process.env.NEXT_PUBLIC_DOUBAN_PROXY || '';
  let doubanImageProxyType =
    process.env.NEXT_PUBLIC_DOUBAN_IMAGE_PROXY_TYPE || 'server';
  let doubanImageProxy = process.env.NEXT_PUBLIC_DOUBAN_IMAGE_PROXY || '';
  let disableYellowFilter =
    process.env.NEXT_PUBLIC_DISABLE_YELLOW_FILTER === 'true';
  let fluidSearch = process.env.NEXT_PUBLIC_FLUID_SEARCH !== 'false';
  let enableWebLive = false;
  let customAdFilterVersion = 0;
  let aiRecommendEnabled = false;
  let embyEnabled = false;
  let customCategories = [] as {
    name: string;
    type: 'movie' | 'tv';
    query: string;
  }[];
  if (storageType !== 'localstorage') {
    const config = await getConfig();
    siteName = config.SiteConfig.SiteName;
    announcement = config.SiteConfig.Announcement;

    doubanProxyType = config.SiteConfig.DoubanProxyType;
    doubanProxy = config.SiteConfig.DoubanProxy;
    doubanImageProxyType = config.SiteConfig.DoubanImageProxyType;
    doubanImageProxy = config.SiteConfig.DoubanImageProxy;
    disableYellowFilter = config.SiteConfig.DisableYellowFilter;
    customCategories = config.CustomCategories.filter(
      (category) => !category.disabled
    ).map((category) => ({
      name: category.name || '',
      type: category.type,
      query: category.query,
    }));
    fluidSearch = config.SiteConfig.FluidSearch;
    enableWebLive = config.SiteConfig.EnableWebLive ?? false;
    customAdFilterVersion = config.SiteConfig?.CustomAdFilterVersion || 0;
    aiRecommendEnabled = config.AIRecommendConfig?.enabled ?? false;
    // 检查是否启用了 Emby 功能（支持多源）
    embyEnabled = !!(
      config.EmbyConfig?.Sources &&
      config.EmbyConfig.Sources.length > 0 &&
      config.EmbyConfig.Sources.some(s => s.enabled && s.ServerURL)
    );
  }

  // 将运行时配置注入到全局 window 对象，供客户端在运行时读取
  const runtimeConfig = {
    STORAGE_TYPE: process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage',
    DOUBAN_PROXY_TYPE: doubanProxyType,
    DOUBAN_PROXY: doubanProxy,
    DOUBAN_IMAGE_PROXY_TYPE: doubanImageProxyType,
    DOUBAN_IMAGE_PROXY: doubanImageProxy,
    DISABLE_YELLOW_FILTER: disableYellowFilter,
    CUSTOM_CATEGORIES: customCategories,
    FLUID_SEARCH: fluidSearch,
    ENABLE_WEB_LIVE: enableWebLive,
    CUSTOM_AD_FILTER_VERSION: customAdFilterVersion,
    AI_RECOMMEND_ENABLED: aiRecommendEnabled,
    EMBY_ENABLED: embyEnabled,
    PRIVATE_LIBRARY_ENABLED: embyEnabled,
    // 禁用预告片：Vercel 自动检测，或用户手动设置 DISABLE_HERO_TRAILER=true
    DISABLE_HERO_TRAILER: process.env.VERCEL === '1' || process.env.DISABLE_HERO_TRAILER === 'true',
  };

  return (
    <html lang='zh-CN' suppressHydrationWarning>
      <head>
        <meta
          name='viewport'
          content='width=device-width, initial-scale=1.0, viewport-fit=cover'
        />
        <meta name='color-scheme' content='light dark' />
        <link rel='apple-touch-icon' href='/icons/icon-192x192.png' />
        {/* 将配置序列化后直接写入脚本，浏览器端可通过 window.RUNTIME_CONFIG 获取 */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script
          dangerouslySetInnerHTML={{
            __html: `window.RUNTIME_CONFIG = ${JSON.stringify(runtimeConfig)};`,
          }}
        />
      </head>
      <body
        className={`${inter.className} min-h-screen bg-white text-gray-900 dark:bg-black dark:text-gray-200`}
      >
        <ThemeProvider
          attribute='class'
          defaultTheme='system'
          enableSystem
          disableTransitionOnChange
        >
          <QueryProvider>
            <GlobalCacheProvider>
              <DownloadProvider>
                <WatchRoomProvider>
                  <SiteProvider siteName={siteName} announcement={announcement}>
                    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
                      <SessionTracker />
                      {children}
                      <GlobalErrorIndicator />
                    </Suspense>
                  </SiteProvider>
                  <Suspense fallback={null}>
                    <DownloadPanel />
                    <ChatFloatingWindow />
                  </Suspense>
                </WatchRoomProvider>
              </DownloadProvider>
            </GlobalCacheProvider>
          </QueryProvider>
          <Toaster position="top-center" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
