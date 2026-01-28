import { NextResponse } from 'next/server';

import { getCacheTime } from '@/lib/config';
import { DEFAULT_USER_AGENT } from '@/lib/user-agent';

// 强制动态路由，禁用所有缓存
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

// 服务端专用函数，直接调用外部API
async function getShortDramaCategoriesInternal() {
  const response = await fetch('https://cj.rycjapi.com/api.php/provide/vod?ac=list', {
    headers: {
      'User-Agent': DEFAULT_USER_AGENT,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();

  // 新API返回所有分类，我们只返回短剧分类
  return [
    {
      type_id: 46,
      type_name: '全部短剧',
    }
  ];
}

export async function GET() {
  try {
    const categories = await getShortDramaCategoriesInternal();

    // 设置与网页端一致的缓存策略（categories: 4小时）
    const response = NextResponse.json(categories);

    console.log('🕐 [CATEGORIES] 设置4小时HTTP缓存 - 与网页端categories缓存一致');

    // 4小时 = 14400秒（与网页端SHORTDRAMA_CACHE_EXPIRE.categories一致）
    const cacheTime = 14400;
    response.headers.set('Cache-Control', `public, max-age=${cacheTime}, s-maxage=${cacheTime}`);
    response.headers.set('CDN-Cache-Control', `public, s-maxage=${cacheTime}`);
    response.headers.set('Vercel-CDN-Cache-Control', `public, s-maxage=${cacheTime}`);

    // 调试信息
    response.headers.set('X-Cache-Duration', '4hour');
    response.headers.set('X-Cache-Expires-At', new Date(Date.now() + cacheTime * 1000).toISOString());
    response.headers.set('X-Debug-Timestamp', new Date().toISOString());

    // Vary头确保不同设备有不同缓存
    response.headers.set('Vary', 'Accept-Encoding, User-Agent');

    return response;
  } catch (error) {
    console.error('获取短剧分类失败:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}