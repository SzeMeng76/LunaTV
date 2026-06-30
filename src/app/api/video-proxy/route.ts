import { NextResponse } from 'next/server';
import { DEFAULT_USER_AGENT } from '@/lib/user-agent';
import { isVideoCached, getCachedVideoPath, cacheVideoContent, deleteVideoCache } from '@/lib/video-cache';
import { validateProxyTargetUrl } from '@/lib/proxy-security';
import { promises as fs } from 'fs';
import { createReadStream } from 'fs';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

// 视频代理接口 - 支持流式传输和Range请求
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoUrl = searchParams.get('url');
  const doubanId = searchParams.get('douban_id'); // 🔥 从 URL 参数获取 douban_id

  if (!videoUrl) {
    return NextResponse.json({ error: 'Missing video URL' }, { status: 400 });
  }

  // SSRF 防护：验证目标 URL
  try {
    await validateProxyTargetUrl(videoUrl);
  } catch (error) {
    console.error('[VideoProxy] SSRF validation failed:', error);
    return NextResponse.json(
      { error: 'Invalid or blocked URL' },
      { status: 403 }
    );
  }

  // 🎯 优先检查缓存（Kvrocks + 文件系统）
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE;
  if (storageType === 'kvrocks') {
    try {
      // 🔥 使用 douban_id 检查缓存（如果有的话）
      const cached = await isVideoCached(videoUrl, doubanId || undefined);
      console.log(`[VideoProxy] 缓存检查结果: cached=${cached}, doubanId=${doubanId}, url=${videoUrl.substring(0, 50)}...`);
      if (cached) {
        const cachedPath = await getCachedVideoPath(videoUrl, doubanId || undefined);
        console.log(`[VideoProxy] 缓存路径: ${cachedPath}`);
        if (cachedPath) {
          console.log('[VideoProxy] 🎯 命中缓存，从本地文件返回');
          return serveVideoFromFile(cachedPath, request);
        }
      }
    } catch (error) {
      console.error('[VideoProxy] 缓存检查失败，降级到直接代理:', error);
    }
  }

  // 获取客户端的 Range 请求头
  const rangeHeader = request.headers.get('range');
  // 获取条件请求头（用于缓存重验证）
  const ifNoneMatch = request.headers.get('if-none-match');
  const ifModifiedSince = request.headers.get('if-modified-since');

  // 🎯 决定是否需要缓存：Kvrocks 存储 + 豆瓣视频
  const shouldCache = storageType === 'kvrocks' &&
                      (videoUrl.includes('douban') || videoUrl.includes('doubanio'));

  console.log(`[VideoProxy] 缓存检查: storageType=${storageType}, shouldCache=${shouldCache}, url=${videoUrl.substring(0, 50)}...`);

  // 创建 AbortController 用于超时控制
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒超时

  try {
    // 动态设置 Referer 和 Origin（根据视频源域名）
    const videoUrlObj = new URL(videoUrl);
    const sourceOrigin = `${videoUrlObj.protocol}//${videoUrlObj.host}`;

    // 构建请求头
    const fetchHeaders: HeadersInit = {
      'Referer': sourceOrigin + '/',
      'Origin': sourceOrigin,
      'User-Agent': DEFAULT_USER_AGENT,
      'Accept': 'video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Accept-Encoding': 'identity;q=1, *;q=0',
      'Connection': 'keep-alive',
    };

    // 🎯 如果需要缓存，不转发 Range 请求头（下载完整视频）
    // 如果不需要缓存，转发 Range 请求头（流式传输）
    if (rangeHeader && !shouldCache) {
      fetchHeaders['Range'] = rangeHeader;
    }

    // 转发条件请求头（用于缓存重验证）
    if (ifNoneMatch) {
      fetchHeaders['If-None-Match'] = ifNoneMatch;
    }
    if (ifModifiedSince) {
      fetchHeaders['If-Modified-Since'] = ifModifiedSince;
    }

    const videoResponse = await fetch(videoUrl, {
      signal: controller.signal,
      headers: fetchHeaders,
    });

    clearTimeout(timeoutId);

    // 处理 304 Not Modified（缓存重验证成功）
    if (videoResponse.status === 304) {
      const headers = new Headers();
      const etag = videoResponse.headers.get('etag');
      const lastModified = videoResponse.headers.get('last-modified');

      if (etag) headers.set('ETag', etag);
      if (lastModified) headers.set('Last-Modified', lastModified);

      headers.set(
        'Cache-Control',
        'public, max-age=1800, stale-while-revalidate=900, must-revalidate'
      );
      headers.set('Access-Control-Allow-Origin', '*');

      return new Response(null, {
        status: 304,
        headers,
      });
    }

    if (!videoResponse.ok) {
      // 🎯 如果是 403/404 等错误，检查视频文件缓存
      if (storageType === 'kvrocks' && (videoResponse.status === 403 || videoResponse.status === 404)) {
        console.log(`[VideoProxy] 视频URL返回 ${videoResponse.status}: ${videoUrl}`);

        // 🔥 如果有 doubanId，检查视频文件是否存在
        if (doubanId) {
          try {
            const videoFileExists = await isVideoCached('', doubanId);
            if (videoFileExists) {
              console.log(`[VideoProxy] URL过期但视频文件存在，返回缓存: movie_${doubanId}`);
              const cachedPath = await getCachedVideoPath('', doubanId);
              if (cachedPath) {
                return serveVideoFromFile(cachedPath, request);
              }
            } else {
              console.log(`[VideoProxy] 视频文件不存在，清除 Redis URL 缓存: trailer:${doubanId}`);
              // 🔥 清除 refresh-trailer 的 Redis URL 缓存，下次请求会获取新 URL
              try {
                await db.deleteCache(`trailer:${doubanId}`);
                console.log(`[VideoProxy] ✅ 已清除 Redis URL 缓存: trailer:${doubanId}`);
              } catch (err) {
                console.error('[VideoProxy] 清除 Redis URL 缓存失败:', err);
              }
            }
          } catch (error) {
            console.error('[VideoProxy] 检查视频文件缓存失败:', error);
          }
        }
      }

      const errorResponse = NextResponse.json(
        {
          error: 'Failed to fetch video',
          status: videoResponse.status,
          statusText: videoResponse.statusText,
        },
        { status: videoResponse.status }
      );
      // 错误响应不缓存，避免缓存失效的视频链接
      errorResponse.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      return errorResponse;
    }

    if (!videoResponse.body) {
      return NextResponse.json(
        { error: 'Video response has no body' },
        { status: 500 }
      );
    }

    const contentType = videoResponse.headers.get('content-type');
    const contentLength = videoResponse.headers.get('content-length');
    const contentRange = videoResponse.headers.get('content-range');
    const acceptRanges = videoResponse.headers.get('accept-ranges');
    const etag = videoResponse.headers.get('etag');
    const lastModified = videoResponse.headers.get('last-modified');

    console.log(`[VideoProxy] 响应头: status=${videoResponse.status}, contentLength=${contentLength}, contentRange=${contentRange}, rangeHeader=${rangeHeader}`);

    // 创建响应头
    const headers = new Headers();
    if (contentType) headers.set('Content-Type', contentType);
    if (contentLength) headers.set('Content-Length', contentLength);
    if (contentRange) headers.set('Content-Range', contentRange);
    if (acceptRanges) headers.set('Accept-Ranges', acceptRanges);
    if (etag) headers.set('ETag', etag);
    if (lastModified) headers.set('Last-Modified', lastModified);

    // 设置缓存头（视频30分钟缓存 + 智能重验证）
    // 使用 stale-while-revalidate 策略：允许在后台重新验证时提供旧内容
    // 但添加 must-revalidate 确保过期后必须验证源服务器
    // trailer URL 有时效性，使用较短的 30 分钟缓存
    headers.set(
      'Cache-Control',
      'public, max-age=1800, stale-while-revalidate=900, must-revalidate'
    );
    // CDN缓存：30分钟 + 15分钟宽限期
    headers.set('CDN-Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=900');

    // 添加 CORS 支持
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Range');

    // 返回正确的状态码：Range请求返回206，完整请求返回200
    const statusCode = rangeHeader && contentRange ? 206 : 200;

    // 🎯 如果需要缓存且下载了完整视频，缓存视频内容
    console.log(`[VideoProxy] 缓存条件检查: shouldCache=${shouldCache}, contentRange=${contentRange}, hasBody=${!!videoResponse.body}, rangeHeader=${rangeHeader}`);

    if (shouldCache && !contentRange && videoResponse.body) {
      try {
        console.log('[VideoProxy] 开始缓存视频...');
        // 读取完整视频内容
        const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
        console.log(`[VideoProxy] 视频下载完成，大小: ${(videoBuffer.length / 1024 / 1024).toFixed(2)}MB`);

        // 异步缓存视频内容（不阻塞响应）
        // 🔥 传入 doubanId，确保同一部影片只有一个视频文件
        cacheVideoContent(videoUrl, videoBuffer, contentType || 'video/mp4', doubanId || undefined).catch(err => {
          console.error('[VideoProxy] 缓存视频失败:', err);
        });

        console.log(`[VideoProxy] ✅ 视频已缓存: ${videoUrl.substring(0, 50)}...`);

        // 🎯 如果客户端请求的是 Range，从缓存的完整视频中返回指定范围
        if (rangeHeader) {
          const fileSize = videoBuffer.length;
          const parts = rangeHeader.replace(/bytes=/, '').split('-');
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
          const chunkSize = end - start + 1;

          const rangeHeaders = new Headers(headers);
          rangeHeaders.set('Content-Range', `bytes ${start}-${end}/${fileSize}`);
          rangeHeaders.set('Content-Length', chunkSize.toString());

          return new Response(videoBuffer.slice(start, end + 1), {
            status: 206,
            headers: rangeHeaders,
          });
        }

        // 返回完整视频
        return new Response(videoBuffer, {
          status: 200,
          headers,
        });
      } catch (error) {
        console.error('[VideoProxy] 处理视频缓存失败:', error);
        // 缓存失败时返回错误响应，因为流已经被消费无法再使用
        return NextResponse.json(
          { error: 'Failed to cache video', details: error instanceof Error ? error.message : 'Unknown error' },
          { status: 500 }
        );
      }
    }

    // 直接返回视频流（Range 请求或缓存失败）
    return new Response(videoResponse.body, {
      status: statusCode,
      headers,
    });
  } catch (error: any) {
    clearTimeout(timeoutId);

    // 错误类型判断
    if (error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Video fetch timeout (30s)' },
        { status: 504 }
      );
    }

    console.error('[Video Proxy] Error fetching video:', error.message);
    return NextResponse.json(
      { error: 'Error fetching video', details: error.message },
      { status: 500 }
    );
  }
}

// 处理 HEAD 请求（用于获取视频元数据）
export async function HEAD(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoUrl = searchParams.get('url');

  if (!videoUrl) {
    return new NextResponse(null, { status: 400 });
  }

  try {
    // 动态设置 Referer 和 Origin（根据视频源域名）
    const videoUrlObj = new URL(videoUrl);
    const sourceOrigin = `${videoUrlObj.protocol}//${videoUrlObj.host}`;

    const videoResponse = await fetch(videoUrl, {
      method: 'HEAD',
      headers: {
        'Referer': sourceOrigin + '/',
        'Origin': sourceOrigin,
        'User-Agent':
          DEFAULT_USER_AGENT,
        'Accept': 'video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept-Encoding': 'identity;q=1, *;q=0',
        'Connection': 'keep-alive',
      },
    });

    const headers = new Headers();
    const contentType = videoResponse.headers.get('content-type');
    const contentLength = videoResponse.headers.get('content-length');
    const acceptRanges = videoResponse.headers.get('accept-ranges');
    const etag = videoResponse.headers.get('etag');
    const lastModified = videoResponse.headers.get('last-modified');

    if (contentType) headers.set('Content-Type', contentType);
    if (contentLength) headers.set('Content-Length', contentLength);
    if (acceptRanges) headers.set('Accept-Ranges', acceptRanges);
    if (etag) headers.set('ETag', etag);
    if (lastModified) headers.set('Last-Modified', lastModified);

    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=1800, must-revalidate');

    return new NextResponse(null, {
      status: videoResponse.status,
      headers,
    });
  } catch (error: any) {
    console.error('[Video Proxy] HEAD request error:', error.message);
    return new NextResponse(null, { status: 500 });
  }
}

/**
 * 从缓存文件返回视频（支持 Range 请求）
 */
async function serveVideoFromFile(filePath: string, request: Request): Promise<Response> {
  const rangeHeader = request.headers.get('range');
  const stats = await fs.stat(filePath);
  const fileSize = stats.size;

  const headers = new Headers({
    'Content-Type': 'video/mp4',
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=7200', // 2小时缓存
  });

  // 处理 Range 请求
  if (rangeHeader) {
    const parts = rangeHeader.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;

    headers.set('Content-Range', `bytes ${start}-${end}/${fileSize}`);
    headers.set('Content-Length', chunkSize.toString());

    const fileStream = createReadStream(filePath, { start, end });

    return new Response(fileStream as any, {
      status: 206,
      headers,
    });
  }

  // 完整文件请求
  headers.set('Content-Length', fileSize.toString());
  const fileStream = createReadStream(filePath);

  return new Response(fileStream as any, {
    status: 200,
    headers,
  });
}

// 处理 CORS 预检请求
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type',
    },
  });
}
