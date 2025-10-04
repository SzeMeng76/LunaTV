import { NextRequest, NextResponse } from 'next/server';
import { getSpiderJar } from '@/lib/spiderJar';

export const runtime = 'nodejs';

// Spider JAR 本地代理端点 - 使用统一的 jar 获取逻辑
export async function GET(_req: NextRequest) {
  try {
    // 使用管理模块获取 jar（优先使用缓存）
    const jarInfo = await getSpiderJar(false);

    console.log(`[Spider Proxy] 提供 ${jarInfo.success ? '真实' : '降级'} jar: ${jarInfo.source}, 大小: ${jarInfo.size} bytes, 缓存: ${jarInfo.cached}`);

    return new NextResponse(new Uint8Array(jarInfo.buffer), {
      headers: {
        'Content-Type': 'application/java-archive',
        'Content-Length': jarInfo.size.toString(),
        'Cache-Control': 'public, max-age=3600', // 1小时缓存
        'Access-Control-Allow-Origin': '*',
        'X-Spider-Source': jarInfo.source,
        'X-Spider-Success': jarInfo.success.toString(),
        'X-Spider-Cached': jarInfo.cached.toString(),
      },
    });
  } catch (error) {
    console.error('[Spider Proxy] 代理错误:', error);
    return NextResponse.json(
      {
        error: 'Proxy error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
