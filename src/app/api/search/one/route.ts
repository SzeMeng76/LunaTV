// app/api/search/one/route.ts  (单源搜索接口，已添加赌博关键词屏蔽)

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getAvailableApiSites, getCacheTime, getConfig } from '@/lib/config';
import { searchFromApi } from '@/lib/downstream';
import { filterSensitiveContent } from '@/lib/filter';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const resourceId = searchParams.get('resourceId');

  if (!query || !resourceId) {
    const cacheTime = await getCacheTime();
    return NextResponse.json(
      { result: null, error: '缺少必要参数: q 或 resourceId' },
      { headers: { 'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}` } }
    );
  }

  const config = await getConfig();
  const apiSites = await getAvailableApiSites(authInfo.username);
  const shouldFilter = !config.SiteConfig.DisableYellowFilter;

  try {
    const targetSite = apiSites.find((site) => site.key === resourceId);
    if (!targetSite) {
      return NextResponse.json(
        { error: `未找到指定的视频源: ${resourceId}`, result: null },
        { status: 404 }
      );
    }

    const results = await searchFromApi(targetSite, query);
    let result = results.filter((r) => r.title === query);

    // 统一过滤（成人 + 赌博关键词）
    result = filterSensitiveContent(result, shouldFilter);

    const cacheTime = await getCacheTime();

    if (result.length === 0) {
      return NextResponse.json({ error: '未找到结果', result: null }, { status: 404 });
    }

    return NextResponse.json({ results: result }, {
      headers: { 'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}` },
    });
  } catch {
    return NextResponse.json({ error: '搜索失败', result: null }, { status: 500 });
  }
}