import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getAvailableApiSites, getCacheTime, getConfig } from '@/lib/config';
import { searchFromApi } from '@/lib/downstream';
import { yellowWords } from '@/lib/yellow';
import { bannedWords } from '@/lib/filter';

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

  // 1. 查询本身含有违禁词 → 直接返回空
  const queryLower = query.toLowerCase();
  if (bannedWords.some(word => queryLower.includes(word.toLowerCase()))) {
    return NextResponse.json({ results: [] }, { status: 200 });
  }

  const config = await getConfig();
  const apiSites = await getAvailableApiSites(authInfo.username);

  try {
    const targetSite = apiSites.find((site) => site.key === resourceId);
    if (!targetSite) {
      return NextResponse.json(
        {
          error: `未找到指定的视频源: ${resourceId}`,
          result: null,
        },
        { status: 404 }
      );
    }

    const results = await searchFromApi(targetSite, query);
    let result = results.filter((r) => r.title === query);

    // 违禁词过滤
    result = result.filter((item) => {
      const title = (item.title || item.name || '').toLowerCase();
      const typeName = (item.type_name || item.category || item.vod_type || '').toLowerCase();
      
      return !bannedWords.some((word) => {
        const lowerWord = word.toLowerCase();
        return title.includes(lowerWord) || typeName.includes(lowerWord);
      });
    });

    if (!config.SiteConfig.DisableYellowFilter) {
      result = result.filter((item) => {
        const typeName = (item.type_name || item.category || item.vod_type || '').toLowerCase();
        return !yellowWords.some((word: string) => typeName.includes(word.toLowerCase()));
      });
    }

    const cacheTime = await getCacheTime();

    if (result.length === 0) {
      return NextResponse.json(
        {
          error: '未找到结果',
          result: null,
        },
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
      {
        error: '搜索失败',
        result: null,
      },
      { status: 500 }
    );
  }
}