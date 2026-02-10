import { NextRequest, NextResponse } from 'next/server';

import { getCacheTime, getConfig } from '@/lib/config';
import { recordRequest, getDbQueryCount, resetDbQueryCount } from '@/lib/performance-monitor';
import { DEFAULT_USER_AGENT } from '@/lib/user-agent';

// 强制动态路由，禁用所有缓存
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

// 备用 API（乱短剧API）
const FALLBACK_API_BASE = 'https://api.r2afosne.dpdns.org';

// 从单个短剧源获取数据（通过分类名称查找）
async function fetchFromShortDramaSource(
  api: string,
  size: number
) {
  // Step 1: 获取分类列表，找到"短剧"分类的ID
  const listUrl = `${api}?ac=list`;

  const listResponse = await fetch(listUrl, {
    headers: {
      'User-Agent': DEFAULT_USER_AGENT,
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!listResponse.ok) {
    throw new Error(`HTTP error! status: ${listResponse.status}`);
  }

  const listData = await listResponse.json();
  const categories = listData.class || [];

  // 查找"短剧"分类（只要包含"短剧"两个字即可）
  const shortDramaCategory = categories.find((cat: any) =>
    cat.type_name && cat.type_name.includes('短剧')
  );

  if (!shortDramaCategory) {
    console.log(`该源没有短剧分类`);
    return [];
  }

  const categoryId = shortDramaCategory.type_id;
  console.log(`找到短剧分类ID: ${categoryId}`);

  // Step 2: 获取该分类的短剧列表
  const apiUrl = `${api}?ac=detail&t=${categoryId}&pg=1`;

  const response = await fetch(apiUrl, {
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
  const items = data.list || [];

  return items.slice(0, size).map((item: any) => ({
    id: item.vod_id,
    name: item.vod_name,
    cover: item.vod_pic || '',
    update_time: item.vod_time || new Date().toISOString(),
    score: parseFloat(item.vod_score) || 0,
    episode_count: parseInt(item.vod_remarks?.replace(/[^\d]/g, '') || '1'),
    description: item.vod_content || item.vod_blurb || '',
    author: item.vod_actor || '',
    backdrop: item.vod_pic_slide || item.vod_pic || '',
    vote_average: parseFloat(item.vod_score) || 0,
  }));
}

// 从备用 API（乱短剧API）获取推荐数据
async function fetchFromFallbackApi(size: number) {
  console.log('🔄 尝试备用API: 乱短剧API');

  const apiUrl = `${FALLBACK_API_BASE}/vod/recommend?size=${size}`;

  const response = await fetch(apiUrl, {
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
  const items = data.items || [];

  console.log(`✅ 备用API返回 ${items.length} 条数据`);

  return items.slice(0, size).map((item: any) => ({
    id: item.vod_id,
    name: item.vod_name,
    cover: item.vod_pic || '',
    update_time: new Date().toISOString(),
    score: parseFloat(item.vod_score) || 0,
    episode_count: parseInt(item.vod_remarks?.replace(/[^\d]/g, '') || '1'),
    description: '',
    author: '',
    backdrop: item.vod_pic || '',
    vote_average: parseFloat(item.vod_score) || 0,
    _source: 'fallback_api',
  }));
}

// 服务端专用函数，从所有短剧源聚合数据
async function getRecommendedShortDramasInternal(
  category?: number,
  size = 10
) {
  try {
    // 获取配置
    const config = await getConfig();

    // 筛选出所有启用的短剧源
    const shortDramaSources = config.SourceConfig.filter(
      source => source.type === 'shortdrama' && !source.disabled
    );

    console.log(`📺 找到 ${shortDramaSources.length} 个配置的短剧源`);

    // 如果没有配置短剧源，使用默认源
    if (shortDramaSources.length === 0) {
      console.log('📺 使用默认短剧源');
      return await fetchFromShortDramaSource(
        'https://wwzy.tv/api.php/provide/vod',
        size
      );
    }

    // 有配置短剧源，聚合所有源的数据
    console.log('📺 聚合多个短剧源的数据');
    const results = await Promise.allSettled(
      shortDramaSources.map(source => {
        console.log(`🔄 请求短剧源: ${source.name}`);
        return fetchFromShortDramaSource(source.api, size);
      })
    );

    // 合并所有成功的结果
    const allItems: any[] = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        console.log(`✅ ${shortDramaSources[index].name}: 获取到 ${result.value.length} 条数据`);
        allItems.push(...result.value);
      } else {
        console.error(`❌ ${shortDramaSources[index].name}: 请求失败`, result.reason);
      }
    });

    // 去重（根据名称）
    const uniqueItems = Array.from(
      new Map(allItems.map(item => [item.name, item])).values()
    );

    // 按更新时间排序
    uniqueItems.sort((a, b) =>
      new Date(b.update_time).getTime() - new Date(a.update_time).getTime()
    );

    // 返回指定数量
    const finalItems = uniqueItems.slice(0, size);
    console.log(`📊 最终返回 ${finalItems.length} 条短剧数据`);

    return finalItems;
  } catch (error) {
    console.error('获取短剧推荐失败:', error);
    // 出错时fallback到默认源
    try {
      console.log('⚠️ 出错，fallback到默认源');
      return await fetchFromShortDramaSource(
        'https://wwzy.tv/api.php/provide/vod',
        size
      );
    } catch (fallbackError) {
      console.error('默认源也失败:', fallbackError);
      // 尝试备用API
      try {
        console.log('⚠️ 默认源失败，尝试备用API');
        return await fetchFromFallbackApi(size);
      } catch (fallbackApiError) {
        console.error('备用API也失败:', fallbackApiError);
        return [];
      }
    }
  }
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const startMemory = process.memoryUsage().heapUsed;
  resetDbQueryCount();

  try {
    const { searchParams } = request.nextUrl;
    const category = searchParams.get('category');
    const size = searchParams.get('size');

    const categoryNum = category ? parseInt(category) : undefined;
    const pageSize = size ? parseInt(size) : 10;

    if ((category && isNaN(categoryNum!)) || isNaN(pageSize)) {
      const errorResponse = { error: '参数格式错误' };
      const responseSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

      recordRequest({
        timestamp: startTime,
        method: 'GET',
        path: '/api/shortdrama/recommend',
        statusCode: 400,
        duration: Date.now() - startTime,
        memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
        dbQueries: getDbQueryCount(),
        requestSize: 0,
        responseSize,
      });

      return NextResponse.json(errorResponse, { status: 400 });
    }

    const result = await getRecommendedShortDramasInternal(categoryNum, pageSize);

    // 测试1小时HTTP缓存策略
    const response = NextResponse.json(result);

    console.log('🕐 [RECOMMEND] 设置1小时HTTP缓存 - 测试自动过期刷新');

    // 1小时 = 3600秒
    const cacheTime = 3600;
    response.headers.set('Cache-Control', `public, max-age=${cacheTime}, s-maxage=${cacheTime}`);
    response.headers.set('CDN-Cache-Control', `public, s-maxage=${cacheTime}`);
    response.headers.set('Vercel-CDN-Cache-Control', `public, s-maxage=${cacheTime}`);

    // 调试信息
    response.headers.set('X-Cache-Duration', '1hour');
    response.headers.set('X-Cache-Expires-At', new Date(Date.now() + cacheTime * 1000).toISOString());
    response.headers.set('X-Debug-Timestamp', new Date().toISOString());

    // Vary头确保不同设备有不同缓存
    response.headers.set('Vary', 'Accept-Encoding, User-Agent');

    // 记录性能指标
    const responseSize = Buffer.byteLength(JSON.stringify(result), 'utf8');
    recordRequest({
      timestamp: startTime,
      method: 'GET',
      path: '/api/shortdrama/recommend',
      statusCode: 200,
      duration: Date.now() - startTime,
      memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
      dbQueries: getDbQueryCount(),
      requestSize: 0,
      responseSize,
    });

    return response;
  } catch (error) {
    console.error('获取推荐短剧失败:', error);

    const errorResponse = { error: '服务器内部错误' };
    const responseSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

    recordRequest({
      timestamp: startTime,
      method: 'GET',
      path: '/api/shortdrama/recommend',
      statusCode: 500,
      duration: Date.now() - startTime,
      memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
      dbQueries: getDbQueryCount(),
      requestSize: 0,
      responseSize,
    });

    return NextResponse.json(errorResponse, { status: 500 });
  }
}