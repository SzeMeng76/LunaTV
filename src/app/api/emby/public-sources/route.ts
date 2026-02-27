import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/emby/public-sources
 * Returns admin Emby sources marked as isPublic: true (no credentials exposed)
 */
export async function GET(request: NextRequest) {
  try {
    const authCookie = getAuthInfoFromCookie(request);
    if (!authCookie?.username) {
      return NextResponse.json({ error: '未登录', sources: [] }, { status: 401 });
    }

    const adminConfig = await getConfig();
    const allSources = adminConfig.EmbyConfig?.Sources || [];
    const publicSources = allSources
      .filter((s) => s.isPublic === true && s.enabled)
      .map((s) => ({
        key: s.key,
        name: s.name,
        isPublic: true,
      }));

    return NextResponse.json({ sources: publicSources });
  } catch (error) {
    console.error('[Emby Public Sources] 获取公共源失败:', error);
    return NextResponse.json({ error: '获取公共源失败', sources: [] }, { status: 500 });
  }
}
