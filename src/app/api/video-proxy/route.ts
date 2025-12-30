import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// 视频代理接口 - 支持流式传输和Range请求
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoUrl = searchParams.get('url');

  if (!videoUrl) {
    return NextResponse.json({ error: 'Missing video URL' }, { status: 400 });
  }

  // URL 格式验证
  try {
    new URL(videoUrl);
  } catch {
    return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
  }

  // 获取客户端的 Range 请求头
  const rangeHeader = request.headers.get('range');

  // 创建 AbortController 用于超时控制
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒超时

  try {
    // 构建请求头
    const fetchHeaders: HeadersInit = {
      'Referer': 'https://movie.douban.com/',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Accept': 'video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    };

    // 如果客户端发送了 Range 请求，转发给目标服务器
    if (rangeHeader) {
      fetchHeaders['Range'] = rangeHeader;
    }

    const videoResponse = await fetch(videoUrl, {
      signal: controller.signal,
      headers: fetchHeaders,
    });

    clearTimeout(timeoutId);

    if (!videoResponse.ok) {
      return NextResponse.json(
        {
          error: 'Failed to fetch video',
          status: videoResponse.status,
          statusText: videoResponse.statusText,
        },
        { status: videoResponse.status }
      );
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

    // 创建响应头
    const headers = new Headers();
    if (contentType) headers.set('Content-Type', contentType);
    if (contentLength) headers.set('Content-Length', contentLength);
    if (contentRange) headers.set('Content-Range', contentRange);
    if (acceptRanges) headers.set('Accept-Ranges', acceptRanges);

    // 设置缓存头（视频缓存4小时）
    headers.set('Cache-Control', 'public, max-age=14400');
    headers.set('CDN-Cache-Control', 'public, s-maxage=14400');

    // 添加 CORS 支持
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Range');

    // 返回正确的状态码：Range请求返回206，完整请求返回200
    const statusCode = rangeHeader && contentRange ? 206 : 200;

    // 直接返回视频流
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
    const videoResponse = await fetch(videoUrl, {
      method: 'HEAD',
      headers: {
        'Referer': 'https://movie.douban.com/',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    const headers = new Headers();
    const contentType = videoResponse.headers.get('content-type');
    const contentLength = videoResponse.headers.get('content-length');
    const acceptRanges = videoResponse.headers.get('accept-ranges');

    if (contentType) headers.set('Content-Type', contentType);
    if (contentLength) headers.set('Content-Length', contentLength);
    if (acceptRanges) headers.set('Accept-Ranges', acceptRanges);

    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Cache-Control', 'public, max-age=3600');

    return new NextResponse(null, {
      status: videoResponse.status,
      headers,
    });
  } catch (error: any) {
    console.error('[Video Proxy] HEAD request error:', error.message);
    return new NextResponse(null, { status: 500 });
  }
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
