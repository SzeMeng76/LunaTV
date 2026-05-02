/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps, no-console */

import { Suspense } from 'react';
import { getConfig } from '@/lib/config';
import HomeClient from './HomeClient';

// 🔥 Server Component - 获取配置并传递给客户端
export default async function Home() {
  // 🔥 在服务端获取配置
  const config = await getConfig();
  const homePageConfig = config.HomePageConfig || {
    showHeroBanner: true,
    showContinueWatching: true,
    showUpcomingReleases: true,
    showHotMovies: true,
    showHotTvShows: true,
    showNewAnime: true,
    showHotVariety: true,
    showHotShortDramas: true,
  };

  // 🔥 不再进行服务端 prefetch，让所有数据在客户端加载
  // 好处：导航快速，立即显示 loading 页面
  // 客户端的 useHomePageQueries 会根据配置条件性地获取数据

  return (
    <Suspense>
      <HomeClient initialConfig={homePageConfig} />
    </Suspense>
  );
}
