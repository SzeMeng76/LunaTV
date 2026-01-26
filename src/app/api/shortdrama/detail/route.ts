/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from 'next/server';

import { getCacheTime, getConfig } from '@/lib/config';
import { parseShortDramaEpisode } from '@/lib/shortdrama.client';
import { recordRequest, getDbQueryCount, resetDbQueryCount } from '@/lib/performance-monitor';

// 标记为动态路由
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const startMemory = process.memoryUsage().heapUsed;
  resetDbQueryCount();

  try {
    const { searchParams } = request.nextUrl;
    const id = searchParams.get('id');
    const episode = searchParams.get('episode');
    const name = searchParams.get('name'); // 可选：用于备用API

    if (!id) {
      const errorResponse = { error: '缺少必要参数: id' };
      const responseSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

      recordRequest({
        timestamp: startTime,
        method: 'GET',
        path: '/api/shortdrama/detail',
        statusCode: 400,
        duration: Date.now() - startTime,
        memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
        dbQueries: getDbQueryCount(),
        requestSize: 0,
        responseSize,
      });

      return NextResponse.json(errorResponse, { status: 400 });
    }

    const videoId = parseInt(id);
    const episodeNum = episode ? parseInt(episode) : 1;

    if (isNaN(videoId) || isNaN(episodeNum)) {
      const errorResponse = { error: '参数格式错误' };
      const responseSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

      recordRequest({
        timestamp: startTime,
        method: 'GET',
        path: '/api/shortdrama/detail',
        statusCode: 400,
        duration: Date.now() - startTime,
        memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
        dbQueries: getDbQueryCount(),
        requestSize: 0,
        responseSize,
      });

      return NextResponse.json(errorResponse, { status: 400 });
    }

    // 读取配置以获取备用API地址
    let alternativeApiUrl: string | undefined;
    try {
      const config = await getConfig();
      const shortDramaConfig = config.ShortDramaConfig;
      alternativeApiUrl = shortDramaConfig?.enableAlternative ? shortDramaConfig.alternativeApiUrl : undefined;

      // 调试日志
      console.log('[ShortDrama Detail] 配置读取:', {
        hasConfig: !!shortDramaConfig,
        enableAlternative: shortDramaConfig?.enableAlternative,
        hasAlternativeUrl: !!alternativeApiUrl,
        name: name,
      });
    } catch (configError) {
      console.error('读取短剧配置失败:', configError);
      // 配置读取失败时，不使用备用API
      alternativeApiUrl = undefined;
    }

    // 先尝试指定集数，如果提供了剧名且配置了备用API则自动fallback
    let result = await parseShortDramaEpisode(
      videoId,
      episodeNum,
      true,
      name || undefined,
      alternativeApiUrl
    );

    // 如果失败，尝试其他集数
    if (result.code !== 0 || !result.data || !result.data.totalEpisodes) {
      result = await parseShortDramaEpisode(
        videoId,
        episodeNum === 1 ? 2 : 1,
        true,
        name || undefined,
        alternativeApiUrl
      );
    }

    // 如果还是失败，尝试第0集
    if (result.code !== 0 || !result.data || !result.data.totalEpisodes) {
      result = await parseShortDramaEpisode(
        videoId,
        0,
        true,
        name || undefined,
        alternativeApiUrl
      );
    }

    if (result.code !== 0 || !result.data) {
      const errorResponse = { error: result.msg || '解析失败' };
      const responseSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

      recordRequest({
        timestamp: startTime,
        method: 'GET',
        path: '/api/shortdrama/detail',
        statusCode: 400,
        duration: Date.now() - startTime,
        memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
        dbQueries: getDbQueryCount(),
        requestSize: 0,
        responseSize,
      });

      return NextResponse.json(errorResponse, { status: 400 });
    }

    const totalEpisodes = Math.max(result.data.totalEpisodes || 1, 1);

    // 转换为兼容格式
    // 注意：始终使用请求的原始ID（主API的ID），不使用result.data.videoId（可能是备用API的ID）
    const response: any = {
      id: id, // 使用原始请求ID，保持一致性
      title: result.data!.videoName,
      poster: result.data!.cover,
      episodes: Array.from({ length: totalEpisodes }, (_, i) =>
        `shortdrama:${id}:${i}` // 使用原始请求ID
      ),
      episodes_titles: Array.from({ length: totalEpisodes }, (_, i) =>
        `第${i + 1}集`
      ),
      source: 'shortdrama',
      source_name: '短剧',
      year: new Date().getFullYear().toString(),
      desc: result.data!.description,
      type_name: '短剧',
      drama_name: result.data!.videoName, // 添加剧名，用于备用API fallback
    };

    // 如果备用API返回了元数据，添加到响应中
    if (result.metadata) {
      response.metadata = result.metadata;
    }

    // 设置与豆瓣一致的缓存策略
    const cacheTime = await getCacheTime();
    const finalResponse = NextResponse.json(response);
    finalResponse.headers.set('Cache-Control', `public, max-age=${cacheTime}, s-maxage=${cacheTime}`);
    finalResponse.headers.set('CDN-Cache-Control', `public, s-maxage=${cacheTime}`);
    finalResponse.headers.set('Vercel-CDN-Cache-Control', `public, s-maxage=${cacheTime}`);
    finalResponse.headers.set('Netlify-Vary', 'query');

    // 记录性能指标
    const responseSize = Buffer.byteLength(JSON.stringify(response), 'utf8');
    recordRequest({
      timestamp: startTime,
      method: 'GET',
      path: '/api/shortdrama/detail',
      statusCode: 200,
      duration: Date.now() - startTime,
      memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
      dbQueries: getDbQueryCount(),
      requestSize: 0,
      responseSize,
    });

    return finalResponse;
  } catch (error) {
    console.error('短剧详情获取失败:', error);

    const errorResponse = { error: '服务器内部错误' };
    const responseSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

    recordRequest({
      timestamp: startTime,
      method: 'GET',
      path: '/api/shortdrama/detail',
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