import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getAvailableApiSites, getCacheTime, getConfig } from '@/lib/config';
import { searchFromApi } from '@/lib/downstream';
import { yellowWords } from '@/lib/yellow';
import { blockedWords } from '@/lib/blocked';  // 新增

export const runtime = 'nodejs';

// OrionTV 兼容接口
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
      {
        headers: {
          'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
          'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
          'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
          'Netlify-Vary': 'query',
        },
      }
    );
  }

  const config = await getConfig();
  const apiSites = await getAvailableApiSites(authInfo.username);

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

    // 增强过滤：黄色 + 黑名单关键词
    const shouldFilterYellow = !config.SiteConfig.DisableYellowFilter;
    result = result.filter((item) => {
      const typeName = (item.type_name || '').toLowerCase();
      const title = (item.title || '').toLowerCase();

      // 黄色过滤
      if (shouldFilterYellow && yellowWords.some((word) => typeName.includes(word))) {
        return false;
      }

      // 黑名单关键词过滤（标题或分类）
      if (blockedWords.some((word) => title.includes(word) || typeName.includes(word))) {
        return false;
      }

      return true;
    });

    const cacheTime = await getCacheTime();

    if (result.length === 0) {
      return NextResponse.json(
        { error: '未找到结果', result: null },
        { status: 404 }
      );
    } else {
      return NextResponse.json(
        { results: result },
        {
          headers: {
            'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
            'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
            'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
            'Netlify-Vary': 'query',
          },
        }
      );
    }
  } catch (error) {
    return NextResponse.json(
      { error: '搜索失败', result: null },
      { status: 500 }
    );
  }
}