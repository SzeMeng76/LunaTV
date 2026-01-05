import { NextRequest, NextResponse } from 'next/server';

/**
 * Bangumi API 代理路由
 * 解决客户端直接调用 Bangumi API 可能遇到的 CORS 问题
 *
 * 用法:
 * GET /api/proxy/bangumi?path=calendar
 * GET /api/proxy/bangumi?path=v0/subjects/12345
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get('path');

  if (!path) {
    return NextResponse.json(
      { error: 'Missing path parameter' },
      { status: 400 }
    );
  }

  try {
    const apiUrl = `https://api.bgm.tv/${path}`;

    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'LunaTV/1.0 (https://github.com/yourusername/LunaTV)',
        'Accept': 'application/json',
      },
      next: {
        // 缓存5分钟
        revalidate: 300,
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Bangumi API returned ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    // 返回数据，并设置 CORS 头允许前端访问
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    console.error('Bangumi API proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch from Bangumi API' },
      { status: 500 }
    );
  }
}
