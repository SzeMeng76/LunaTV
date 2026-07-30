import { NextRequest, NextResponse } from 'next/server';

import { getCacheTime, getConfig } from '@/lib/config';
import { recordRequest, getDbQueryCount, resetDbQueryCount } from '@/lib/performance-monitor';
import { DEFAULT_USER_AGENT } from '@/lib/user-agent';

// 强制动态路由，禁用所有缓存
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

// 短剧相关分类关键词（父分类 + 子分类标签）
const SHORT_DRAMA_KEYWORDS = ['短剧', '女频恋爱', '反转爽剧', '古装仙侠', '年代穿越', '脑洞悬疑', '现代都市'];

// 从单个短剧源搜索数据（通过分类名称过滤）
async function searchFromSource(
  api: string,
  query: string,
  page: number,
  size: number
) {
  // Step 1: 获取分类列表，找到短剧相关分类的所有ID
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

  // 查找所有短剧相关分类（父分类 + 子分类标签）
  const shortDramaCategories = categories.filter((cat: any) =>
    cat.type_name && SHORT_DRAMA_KEYWORDS.some((kw: string) => cat.type_name.includes(kw))
  );

  if (shortDramaCategories.length === 0) {
    console.log(`该源没有短剧分类`);
    return { list: [], hasMore: false };
  }

  const categoryIds = new Set(shortDramaCategories.map((cat: any) => cat.type_id));

  // Step 2: 搜索短剧
  const apiUrl = `${api}?ac=detail&wd=${encodeURIComponent(query)}&pg=${page}`;

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

  // 过滤出短剧相关分类的结果
  const shortDramaItems = items.filter((item: any) => categoryIds.has(item.type_id));
  const limitedItems = shortDramaItems.slice(0, size);

  const list = limitedItems.map((item: any) => ({
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

  return {
    list,
    hasMore: data.page < data.pagecount,
  };
}

// 服务端专用函数，从所有短剧源聚合搜索结果
async function searchShortDramasInternal(
  query: string,
  page = 1,
  size = 20
) {
  try {
    const config = await getConfig();

    // 筛选出所有启用的短剧源
    const shortDramaSources = config.SourceConfig.filter(
      source => source.type === 'shortdrama' && !source.disabled
    );

    // 如果没有配置短剧源，使用默认源
    if (shortDramaSources.length === 0) {
      return await searchFromSource(
        'https://tyyszyapi.com/api.php/provide/vod',
        query,
        page,
        size
      );
    }

    // 有配置短剧源，聚合所有源的搜索结果
    const results = await Promise.allSettled(
      shortDramaSources.map(source =>
        searchFromSource(source.api, query, page, size)
      )
    );

    // 合并所有成功的结果
    const allItems: any[] = [];
    let hasMore = false;

    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        allItems.push(...result.value.list);
        hasMore = hasMore || result.value.hasMore;
      }
    });

    // 去重
    const uniqueItems = Array.from(
      new Map(allItems.map(item => [item.name, item])).values()
    );

    // 按更新时间排序
    uniqueItems.sort((a, b) =>
      new Date(b.update_time).getTime() - new Date(a.update_time).getTime()
    );

    return {
      list: uniqueItems.slice(0, size),
      hasMore,
    };
  } catch (error) {
    console.error('搜索短剧失败:', error);
    // fallback到默认源
    try {
      return await searchFromSource(
        'https://tyyszyapi.com/api.php/provide/vod',
        query,
        page,
        size
      );
    } catch (fallbackError) {
      return { list: [], hasMore: false };
    }
  }
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const startMemory = process.memoryUsage().heapUsed;
  resetDbQueryCount();

  try {
    const { searchParams } = request.nextUrl;
    const query = searchParams.get('query');
    const page = searchParams.get('page');
    const size = searchParams.get('size');

    if (!query) {
      const errorResponse = { error: '缺少必要参数: query' };
      const responseSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

      recordRequest({
        timestamp: startTime,
        method: 'GET',
        path: '/api/shortdrama/search',
        statusCode: 400,
        duration: Date.now() - startTime,
        memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
        dbQueries: getDbQueryCount(),
        requestSize: 0,
        responseSize,
      });

      return NextResponse.json(errorResponse, { status: 400 });
    }

    const pageNum = page ? parseInt(page) : 1;
    const pageSize = size ? parseInt(size) : 20;

    if (isNaN(pageNum) || isNaN(pageSize)) {
      const errorResponse = { error: '参数格式错误' };
      const responseSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

      recordRequest({
        timestamp: startTime,
        method: 'GET',
        path: '/api/shortdrama/search',
        statusCode: 400,
        duration: Date.now() - startTime,
        memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
        dbQueries: getDbQueryCount(),
        requestSize: 0,
        responseSize,
      });

      return NextResponse.json(errorResponse, { status: 400 });
    }

    const result = await searchShortDramasInternal(query, pageNum, pageSize);

    // 设置与网页端一致的缓存策略（搜索结果: 2小时）
    const cacheTime = await getCacheTime();
    const response = NextResponse.json(result);

    console.log(`🕐 [SEARCH] 设置 ${cacheTime / 3600} 小时 HTTP 缓存`);

    response.headers.set('Cache-Control', `public, max-age=${cacheTime}, s-maxage=${cacheTime}`);
    response.headers.set('CDN-Cache-Control', `public, s-maxage=${cacheTime}`);
    response.headers.set('Vercel-CDN-Cache-Control', `public, s-maxage=${cacheTime}`);

    // 调试信息
    response.headers.set('X-Cache-Duration', `${cacheTime / 3600}hours`);
    response.headers.set('X-Cache-Expires-At', new Date(Date.now() + cacheTime * 1000).toISOString());
    response.headers.set('X-Debug-Timestamp', new Date().toISOString());

    // Vary头确保不同设备有不同缓存
    response.headers.set('Vary', 'Accept-Encoding, User-Agent');

    // 记录性能指标
    const responseSize = Buffer.byteLength(JSON.stringify(result), 'utf8');
    recordRequest({
      timestamp: startTime,
      method: 'GET',
      path: '/api/shortdrama/search',
      statusCode: 200,
      duration: Date.now() - startTime,
      memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
      dbQueries: getDbQueryCount(),
      requestSize: 0,
      responseSize,
    });

    return response;
  } catch (error) {
    console.error('搜索短剧失败:', error);

    const errorResponse = { error: '服务器内部错误' };
    const responseSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

    recordRequest({
      timestamp: startTime,
      method: 'GET',
      path: '/api/shortdrama/search',
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