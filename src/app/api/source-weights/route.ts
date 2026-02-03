/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';

export const runtime = 'nodejs';

/**
 * 获取源权重映射
 * 返回格式: { [sourceKey]: weight }
 * 用于播放页在优选时按权重排序源
 */
export async function GET(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const config = await getConfig();

    // 构建源权重映射
    const weights: Record<string, number> = {};
    for (const source of config.SourceConfig) {
      if (!source.disabled) {
        weights[source.key] = source.weight ?? 50; // 默认权重 50
      }
    }

    return NextResponse.json(
      { weights },
      {
        headers: {
          // 缓存 5 分钟，权重配置不会频繁变化
          'Cache-Control': 'public, max-age=300, s-maxage=300',
        },
      }
    );
  } catch (error) {
    console.error('获取源权重失败:', error);
    return NextResponse.json({ error: '获取源权重失败' }, { status: 500 });
  }
}
