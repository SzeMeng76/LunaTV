import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getAvailableApiSites, getCacheTime } from '@/lib/config';
import { searchFromApi } from '@/lib/downstream';
import { recordRequest, getDbQueryCount, resetDbQueryCount } from '@/lib/performance-monitor';

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
      path: '/api/detail',
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
  const id = searchParams.get('id');
  const sourceCode = searchParams.get('source');
  const title = searchParams.get('title') || '';

  if (!id || !sourceCode) {
    const errorResponse = { error: '缺少必要参数' };
    const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

    recordRequest({
      timestamp: startTime,
      method: 'GET',
      path: '/api/detail',
      statusCode: 400,
      duration: Date.now() - startTime,
      memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
      dbQueries: getDbQueryCount(),
      requestSize: 0,
      responseSize: errorSize,
    });

    return NextResponse.json(errorResponse, { status: 400 });
  }

  if (!/^[\w-]+$/.test(id)) {
    const errorResponse = { error: '无效的视频ID格式' };
    const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

    recordRequest({
      timestamp: startTime,
      method: 'GET',
      path: '/api/detail',
      statusCode: 400,
      duration: Date.now() - startTime,
      memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
      dbQueries: getDbQueryCount(),
      requestSize: 0,
      responseSize: errorSize,
      filter: `id:${id}`,
    });

    return NextResponse.json(errorResponse, { status: 400 });
  }

  try {
    // 特殊处理 Emby 源
    if (sourceCode === 'emby' || sourceCode.startsWith('emby_')) {
      const { embyManager } = await import('@/lib/emby-manager');

      // 解析 embyKey
      let embyKey: string | undefined;
      if (sourceCode.startsWith('emby_')) {
        embyKey = sourceCode.substring(5); // 'emby_'.length = 5
      }

      // 获取客户端 - 使用用户配置
      const client = await embyManager.getClientForUser(authInfo.username, embyKey);
      const sources = await embyManager.getEnabledSourcesForUser(authInfo.username);
      const sourceConfig = sources.find(s => s.key === embyKey);
      const sourceName = sourceConfig?.name || 'Emby';

      // 获取媒体详情
      const item = await client.getItem(id);

      let result: any;

      if (item.Type === 'Movie') {
        // 电影
        result = {
          source: sourceCode,
          source_name: sourceName,
          id: item.Id,
          title: item.Name,
          poster: client.getImageUrl(item.Id, 'Primary'),
          year: item.ProductionYear?.toString() || '',
          douban_id: 0,
          desc: item.Overview || '',
          episodes: [await client.getStreamUrl(item.Id)],
          episodes_titles: [item.Name],
          proxyMode: false,
        };
      } else if (item.Type === 'Series') {
        // 剧集 - 获取所有季和集
        const seasons = await client.getSeasons(item.Id);
        const allEpisodes: any[] = [];

        for (const season of seasons) {
          const episodes = await client.getEpisodes(item.Id, season.Id);
          allEpisodes.push(...episodes);
        }

        // 按季和集排序
        allEpisodes.sort((a, b) => {
          if (a.ParentIndexNumber !== b.ParentIndexNumber) {
            return (a.ParentIndexNumber || 0) - (b.ParentIndexNumber || 0);
          }
          return (a.IndexNumber || 0) - (b.IndexNumber || 0);
        });

        result = {
          source: sourceCode,
          source_name: sourceName,
          id: item.Id,
          title: item.Name,
          poster: client.getImageUrl(item.Id, 'Primary'),
          year: item.ProductionYear?.toString() || '',
          douban_id: 0,
          desc: item.Overview || '',
          episodes: await Promise.all(allEpisodes.map((ep) => client.getStreamUrl(ep.Id))),
          episodes_titles: allEpisodes.map((ep) => {
            const seasonNum = ep.ParentIndexNumber || 1;
            const episodeNum = ep.IndexNumber || 1;
            return `S${seasonNum.toString().padStart(2, '0')}E${episodeNum.toString().padStart(2, '0')}`;
          }),
          proxyMode: false,
        };
      } else {
        throw new Error('不支持的媒体类型');
      }

      const responseSize = Buffer.byteLength(JSON.stringify(result), 'utf8');

      recordRequest({
        timestamp: startTime,
        method: 'GET',
        path: '/api/detail',
        statusCode: 200,
        duration: Date.now() - startTime,
        memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
        dbQueries: getDbQueryCount(),
        requestSize: 0,
        responseSize,
        filter: `source:${sourceCode}|id:${id}`,
      });

      return NextResponse.json(result, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        },
      });
    }

    // 处理普通 API 站点
    const apiSites = await getAvailableApiSites(authInfo.username);
    const apiSite = apiSites.find((site) => site.key === sourceCode);

    if (!apiSite) {
      const errorResponse = { error: '无效的API来源' };
      const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

      recordRequest({
        timestamp: startTime,
        method: 'GET',
        path: '/api/detail',
        statusCode: 400,
        duration: Date.now() - startTime,
        memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
        dbQueries: getDbQueryCount(),
        requestSize: 0,
        responseSize: errorSize,
        filter: `source:${sourceCode}`,
      });

      return NextResponse.json(errorResponse, { status: 400 });
    }

    // 使用搜索API获取结果，然后精确匹配source和id
    // 这样可以确保获取到完整的episodes数据
    const searchResults = await searchFromApi(apiSite, title.trim());

    // 从搜索结果中精确匹配 source 和 id
    const exactMatch = searchResults.find(
      (item: any) =>
        item.source?.toString() === sourceCode.toString() &&
        item.id?.toString() === id.toString()
    );

    if (!exactMatch) {
      const errorResponse = { error: '未找到匹配的视频源' };
      const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

      recordRequest({
        timestamp: startTime,
        method: 'GET',
        path: '/api/detail',
        statusCode: 404,
        duration: Date.now() - startTime,
        memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
        dbQueries: getDbQueryCount(),
        requestSize: 0,
        responseSize: errorSize,
        filter: `source:${sourceCode}|id:${id}`,
      });

      return NextResponse.json(errorResponse, { status: 404 });
    }

    const result = exactMatch;

    const cacheTime = await getCacheTime();

    const responseSize = Buffer.byteLength(JSON.stringify(result), 'utf8');

    recordRequest({
      timestamp: startTime,
      method: 'GET',
      path: '/api/detail',
      statusCode: 200,
      duration: Date.now() - startTime,
      memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
      dbQueries: getDbQueryCount(),
      requestSize: 0,
      responseSize,
      filter: `source:${sourceCode}|id:${id}`,
    });

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
        'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
        'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
        'Netlify-Vary': 'query',
      },
    });
  } catch (error) {
    const errorResponse = { error: (error as Error).message };
    const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

    recordRequest({
      timestamp: startTime,
      method: 'GET',
      path: '/api/detail',
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
