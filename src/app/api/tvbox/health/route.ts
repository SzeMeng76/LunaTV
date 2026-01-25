import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_USER_AGENT } from '@/lib/user-agent';

export const runtime = 'nodejs';

// Spider jar健康检查端点
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const jarUrl = searchParams.get('url');

    if (!jarUrl) {
      return NextResponse.json(
        {
          error: 'Missing jar URL parameter',
        },
        { status: 400 }
      );
    }

    // 清理URL（移除MD5部分）
    const cleanUrl = jarUrl.split(';')[0];

    // 检查jar文件可用性
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时

    try {
      const response = await fetch(cleanUrl, {
        method: 'HEAD',
        signal: controller.signal,
        headers: {
          'User-Agent':
            DEFAULT_USER_AGENT,
        },
      });

      clearTimeout(timeoutId);

      const result = {
        url: cleanUrl,
        status: response.status,
        statusText: response.statusText,
        accessible: response.ok,
        contentType: response.headers.get('content-type'),
        contentLength: response.headers.get('content-length'),
        lastModified: response.headers.get('last-modified'),
        timestamp: new Date().toISOString(),
      };

      return NextResponse.json(result);
    } catch (fetchError) {
      clearTimeout(timeoutId);

      const errorMessage =
        fetchError instanceof Error ? fetchError.message : 'Unknown error';

      return NextResponse.json({
        url: cleanUrl,
        accessible: false,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
