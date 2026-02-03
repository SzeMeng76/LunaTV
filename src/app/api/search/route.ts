/* eslint-disable @typescript-eslint/no-explicit-any,no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getAvailableApiSites, getCacheTime, getConfig } from '@/lib/config';
import { searchFromApi } from '@/lib/downstream';
import { generateSearchVariants } from '@/lib/downstream';
import { recordRequest, getDbQueryCount, resetDbQueryCount } from '@/lib/performance-monitor';
import { yellowWords } from '@/lib/yellow';
import { bannedWords } from '@/lib/filter';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const startMemory = process.memoryUsage().heapUsed;
  resetDbQueryCount();

  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    const errorResponse = { error: 'Unauthorized' };
    const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

    recordRequest({
      timestamp: startTime,
      method: 'GET',
      path: '/api/search',
      statusCode: 401,
      duration: Date.now() - startTime,
      memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
      dbQueries: getDbQueryCount(),
      requestSize: 0,
      responseSize: errorSize,
    });

    return NextResponse.json(errorResponse, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query) {
    const cacheTime = await getCacheTime();
    const successResponse = { results: [] };
    const responseSize = Buffer.byteLength(JSON.stringify(successResponse), 'utf8');

    recordRequest({
      timestamp: startTime,
      method: 'GET',
      path: '/api/search',
      statusCode: 200,
      duration: Date.now() - startTime,
      memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
      dbQueries: getDbQueryCount(),
      requestSize: 0,
      responseSize,
      filter: 'empty-query',
    });

    return NextResponse.json(
      successResponse,
      {
        headers: {
          'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
          'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
          'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
          'Netlify-Vary': 'query',
        },
      }
    );
  }

  // 1. 查询本身含有违禁词 → 直接返回空结果
  const queryLower = query.toLowerCase();
  if (bannedWords.some(word => queryLower.includes(word.toLowerCase()))) {
    return NextResponse.json({ results: [] }, { status: 200 });
  }

  const config = await getConfig();
  const apiSites = await getAvailableApiSites(authInfo.username);

  // 优化：预计算搜索变体，智能生成（普通查询1个，需要变体的2个）
  const searchVariants = generateSearchVariants(query);

  // 添加超时控制和错误处理，避免慢接口拖累整体响应
  const searchPromises = apiSites.map((site) =>
    Promise.race([
      searchFromApi(site, query, searchVariants),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`${site.name} timeout`)), 20000)
      ),
    ]).catch((err) => {
      console.warn(`搜索失败 ${site.name}:`, err.message);
      return [];
    })
  );

  try {
    const results = await Promise.allSettled(searchPromises);
    const successResults = results
      .filter((result) => result.status === 'fulfilled')
      .map((result) => (result as PromiseFulfilledResult<any>).value);

    let flattenedResults = successResults.flat();

    // 违禁词过滤（检查 title 和 type_name 字段）
    flattenedResults = flattenedResults.filter((item) => {
      const title = (item.title || item.name || '').toLowerCase();
      const typeName = (item.type_name || item.category || item.vod_type || '').toLowerCase();
      
      return !bannedWords.some((word) => {
        const lowerWord = word.toLowerCase();
        return title.includes(lowerWord) || typeName.includes(lowerWord);
      });
    });

    // 原有黄色内容过滤
    if (!config.SiteConfig.DisableYellowFilter) {
      flattenedResults = flattenedResults.filter((result) => {
        const typeName = (result.type_name || result.category || result.vod_type || '').toLowerCase();
        return !yellowWords.some((word: string) => typeName.includes(word.toLowerCase()));
      });
    }

    const cacheTime = await getCacheTime();

    if (flattenedResults.length === 0) {
      // no cache if empty
      const emptyResponse = { results: [] };
      const responseSize = Buffer.byteLength(JSON.stringify(emptyResponse), 'utf8');

      recordRequest({
        timestamp: startTime,
        method: 'GET',
        path: '/api/search',
        statusCode: 200,
        duration: Date.now() - startTime,
        memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
        dbQueries: getDbQueryCount(),
        requestSize: 0,
        responseSize,
        filter: `query:${query}`,
      });

      return NextResponse.json(emptyResponse, { status: 200 });
    }

    const successResponse = { results: flattenedResults };
    const responseSize = Buffer.byteLength(JSON.stringify(successResponse), 'utf8');

    recordRequest({
      timestamp: startTime,
      method: 'GET',
      path: '/api/search',
      statusCode: 200,
      duration: Date.now() - startTime,
      memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
      dbQueries: getDbQueryCount(),
      requestSize: 0,
      responseSize,
      filter: `query:${query}`,
    });

    return NextResponse.json(
      successResponse,
      {
        headers: {
          'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
          'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
          'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
          'Netlify-Vary': 'query',
        },
      }
    );
  } catch (error) {
    const errorResponse = { error: '搜索失败' };
    const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

    recordRequest({
      timestamp: startTime,
      method: 'GET',
      path: '/api/search',
      statusCode: 500,
      duration: Date.now() - startTime,
      memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
      dbQueries: getDbQueryCount(),
      requestSize: 0,
      responseSize: errorSize,
    });

    return NextResponse.json(errorResponse, { status: 500 });
  }
}