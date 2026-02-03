import { NextResponse } from 'next/server';

import { getCacheTime } from '@/lib/config';
import { DEFAULT_USER_AGENT } from '@/lib/user-agent';

// 强制动态路由，禁用所有缓存
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

// 备用 API（乱短剧API）
const FALLBACK_API_BASE = 'https://api.r2afosne.dpdns.org';

// 服务端专用函数，直接调用外部API
async function getShortDramaCategoriesInternal() {
  const response = await fetch('https://wwzy.tv/api.php/provide/vod?ac=list', {
    headers: {
      'User-Agent': DEFAULT_USER_AGENT,
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(10000),
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

// 从备用API获取分类
async function getCategoriesFromFallbackApi() {
  console.log('🔄 尝试备用API分类: 乱短剧API');

  const response = await fetch(`${FALLBACK_API_BASE}/vod/categories`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Fallback API HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  const categories = data.categories || [];

  console.log(`✅ 备用API分类返回 ${categories.length} 条数据`);

  return categories.map((cat: any) => ({
    type_id: cat.type_id,
    type_name: cat.type_name,
  }));
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

    // 尝试备用API
    try {
      console.log('⚠️ 主API失败，尝试备用API');
      const categories = await getCategoriesFromFallbackApi();

      const response = NextResponse.json(categories);
      const cacheTime = 14400;
      response.headers.set('Cache-Control', `public, max-age=${cacheTime}, s-maxage=${cacheTime}`);
      response.headers.set('CDN-Cache-Control', `public, s-maxage=${cacheTime}`);
      response.headers.set('Vercel-CDN-Cache-Control', `public, s-maxage=${cacheTime}`);
      response.headers.set('Vary', 'Accept-Encoding, User-Agent');

      return response;
    } catch (fallbackError) {
      console.error('备用API也失败:', fallbackError);
      return NextResponse.json(
        { error: '服务器内部错误' },
        { status: 500 }
      );
    }
  }
}