import { NextResponse } from 'next/server';
import { DEFAULT_USER_AGENT } from '@/lib/user-agent';

export const runtime = 'nodejs';

// 图片代理接口 - 解决防盗链和 Mixed Content 问题
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const imageUrl = searchParams.get('url');

  if (!imageUrl) {
    return NextResponse.json({ error: 'Missing image URL' }, { status: 400 });
  }

  // URL 格式验证
  try {
    new URL(imageUrl);
  } catch {
    return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
  }

  // 创建 AbortController 用于超时控制
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15秒超时

  try {
    // 动态设置 Referer 和 Origin（根据图片源域名）
    const imageUrlObj = new URL(imageUrl);
    const sourceOrigin = `${imageUrlObj.protocol}//${imageUrlObj.host}`;

    // 构建请求头
    const fetchHeaders: HeadersInit = {
      'Referer': sourceOrigin + '/',
      'Origin': sourceOrigin,
      'User-Agent': DEFAULT_USER_AGENT,
      'Accept': 'image/avif,image/webp,image/jxl,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
    };

    const imageResponse = await fetch(imageUrl, {
      signal: controller.signal,
      headers: fetchHeaders,
    });

    clearTimeout(timeoutId);

    if (!imageResponse.ok) {
      const errorResponse = NextResponse.json(
        {
          error: 'Failed to fetch image',
          status: imageResponse.status,
          statusText: imageResponse.statusText
        },
        { status: imageResponse.status }
      );
      // 错误响应不缓存，避免缓存失效的图片链接
      errorResponse.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      return errorResponse;
    }

    const contentType = imageResponse.headers.get('content-type');

    if (!imageResponse.body) {
      return NextResponse.json(
        { error: 'Image response has no body' },
        { status: 500 }
      );
    }

    // 创建响应头
    const headers = new Headers();
    if (contentType) {
      headers.set('Content-Type', contentType);
    }

    // 传递Content-Length以支持进度显示和更好的缓存（如果上游提供）
    const contentLength = imageResponse.headers.get('content-length');
    if (contentLength) {
      headers.set('Content-Length', contentLength);
    }

    // 设置缓存头 - 缓存7天（604800秒），允许重新验证
    headers.set('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
    headers.set('CDN-Cache-Control', 'public, s-maxage=604800');
    headers.set('Vercel-CDN-Cache-Control', 'public, s-maxage=604800');
    headers.set('Netlify-Vary', 'query');

    // 添加 CORS 支持
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');

    // 直接返回图片流
    return new Response(imageResponse.body, {
      status: 200,
      headers,
    });
  } catch (error: any) {
    clearTimeout(timeoutId);

    // 错误类型判断
    if (error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Image fetch timeout (15s)' },
        { status: 504 }
      );
    }

    console.error('[Image Proxy] Error fetching image:', error.message);
    return NextResponse.json(
      { error: 'Error fetching image', details: error.message },
      { status: 500 }
    );
  }
}

// 处理 CORS 预检请求
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}
