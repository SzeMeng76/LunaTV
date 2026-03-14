import { NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';
import { DEFAULT_USER_AGENT } from '@/lib/user-agent';

// 强制动态路由，禁用所有缓存
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

// 备用 API（乱短剧API）
const FALLBACK_API_BASE = 'https://api.r2afosne.dpdns.org';

// 默认短剧源
const DEFAULT_SHORT_DRAMA_API = 'https://wwzy.tv/api.php/provide/vod';

// 从单个源获取短剧分类
async function getCategoriesFromSource(api: string): Promise<{ type_id: number; type_name: string }[]> {
  const response = await fetch(`${api}?ac=list`, {
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
  const categories = data.class || [];

  // 筛选包含"短剧"的分类
  const shortDramaCategories = categories.filter((cat: any) =>
    cat.type_name && cat.type_name.includes('短剧')
  );

  if (shortDramaCategories.length > 0) {
    return shortDramaCategories.map((cat: any) => ({
      type_id: cat.type_id,
      type_name: cat.type_name,
    }));
  }

  // 如果没有找到包含"短剧"的分类，返回所有分类供用户查看
  return categories.map((cat: any) => ({
    type_id: cat.type_id,
    type_name: cat.type_name,
  }));
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

// 从配置的短剧源获取分类
async function getShortDramaCategoriesInternal() {
  const config = await getConfig();

  // 筛选出所有启用的短剧源
  const shortDramaSources = config.SourceConfig.filter(
    source => source.type === 'shortdrama' && !source.disabled
  );

  // 如果有配置短剧源，从配置的源获取分类
  if (shortDramaSources.length > 0) {
    console.log(`📋 [CATEGORIES] 从 ${shortDramaSources.length} 个配置的短剧源获取分类`);

    const results = await Promise.allSettled(
      shortDramaSources.map(source => {
        console.log(`  → 尝试源: ${source.name} (${source.api})`);
        return getCategoriesFromSource(source.api);
      })
    );

    // 合并所有成功的结果并去重
    const allCategories: { type_id: number; type_name: string }[] = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value.length > 0) {
        console.log(`  ✅ 源 ${shortDramaSources[index].name} 返回 ${result.value.length} 个分类`);
        allCategories.push(...result.value);
      } else if (result.status === 'rejected') {
        console.log(`  ❌ 源 ${shortDramaSources[index].name} 失败:`, result.reason?.message);
      }
    });

    if (allCategories.length > 0) {
      // 按 type_id 去重
      const uniqueCategories = Array.from(
        new Map(allCategories.map(cat => [`${cat.type_id}_${cat.type_name}`, cat])).values()
      );
      return uniqueCategories;
    }

    console.log('⚠️ 所有配置的短剧源都未返回分类，回退到默认源');
  }

  // 没有配置短剧源或全部失败，使用默认源
  console.log(`📋 [CATEGORIES] 使用默认短剧源: ${DEFAULT_SHORT_DRAMA_API}`);
  return await getCategoriesFromSource(DEFAULT_SHORT_DRAMA_API);
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
