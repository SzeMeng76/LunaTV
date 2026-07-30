import { NextRequest, NextResponse } from 'next/server';

import { readTextLimited } from '@/lib/proxy-security';

// oEmbed 响应体大小硬上限，防止异常上游返回超大响应把内存打爆
const MAX_RESPONSE_BYTES = 1 * 1024 * 1024; // 1MB（oEmbed 正常响应体很小）

/**
 * YouTube oEmbed API 代理路由
 * 解决客户端直接调用 YouTube API 可能遇到的 CORS 问题
 *
 * 用法:
 * GET /api/proxy/youtube?videoId=dQw4w9WgXcQ
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get('videoId');

  if (!videoId) {
    return NextResponse.json(
      { error: 'Missing videoId parameter' },
      { status: 400 }
    );
  }

  try {
    const apiUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;

    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'LunaTV/1.0 (https://github.com/yourusername/LunaTV)',
        'Accept': 'application/json',
      },
      next: {
        // 缓存1小时（视频信息不常变）
        revalidate: 3600,
      },
    });

    if (!response.ok) {
      // YouTube oEmbed 对无效视频返回 404
      if (response.status === 404) {
        return NextResponse.json(
          { error: 'Video not found or unavailable' },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: `YouTube API returned ${response.status}` },
        { status: response.status }
      );
    }

    const text = await readTextLimited(response, MAX_RESPONSE_BYTES);
    const data = JSON.parse(text);

    // 返回数据，并设置缓存头
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
      },
    });
  } catch (error) {
    console.error('YouTube API proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch from YouTube API' },
      { status: 500 }
    );
  }
}
