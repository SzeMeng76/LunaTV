import { NextRequest, NextResponse } from 'next/server';

import { getCacheTime } from '@/lib/config';
import { searchTMDBActorWorks, isTMDBEnabled } from '@/lib/tmdb.client';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // 获取参数
  const actorName = searchParams.get('actor');
  const type = searchParams.get('type') || 'movie';
  const pageLimit = parseInt(searchParams.get('limit') || '999');

  // 验证参数
  if (!actorName?.trim()) {
    return NextResponse.json(
      { error: '缺少必要参数: actor（演员名字）' },
      { status: 400 }
    );
  }

  if (!['tv', 'movie'].includes(type)) {
    return NextResponse.json(
      { error: 'type 参数必须是 tv 或 movie' },
      { status: 400 }
    );
  }

  if (pageLimit < 1 || pageLimit > 100) {
    return NextResponse.json(
      { error: 'limit 必须在 1-100 之间' },
      { status: 400 }
    );
  }

  try {
    // 检查TMDB是否启用
    const enabled = await isTMDBEnabled();
    if (!enabled) {
      return NextResponse.json(
        {
          error: 'TMDB演员搜索功能未启用',
          message: '请在管理后台配置TMDB API Key并启用此功能'
        },
        { status: 503 }
      );
    }

    console.log(`[TMDB演员搜索API] 搜索演员: ${actorName}, 类型: ${type}`);

    // 调用TMDB演员搜索函数
    const result = await searchTMDBActorWorks(
      actorName.trim(),
      type as 'movie' | 'tv',
      pageLimit
    );

    console.log(`[TMDB演员搜索API] 搜索结果: ${result.list?.length || 0} 项`);

    // 暂时禁用缓存用于调试
    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (error) {
    console.error(`[TMDB演员搜索API] 搜索失败: ${actorName}`, (error as Error).message);
    return NextResponse.json(
      {
        error: 'TMDB演员搜索失败',
        details: (error as Error).message,
        params: { actorName, type, pageLimit }
      },
      { status: 500 }
    );
  }
}