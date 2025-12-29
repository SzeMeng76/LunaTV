import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getAvailableApiSites, getCacheTime, getConfig } from '@/lib/config';
import { searchFromApi } from '@/lib/downstream';
import { yellowWords } from '@/lib/yellow';
import { blockedWords } from '@/lib/blocked';

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

    // 1. 整站成人源屏蔽
    if (targetSite.is_adult) {
      return NextResponse.json(
        { error: '未找到结果', result: null },
        { status: 404 }
      );
    }

    const results = await searchFromApi(targetSite, query);
    let result = results.filter((r: any) => r.title === query);

    // 统一三层过滤
    result = result.filter((item: any) => {
      const title = (item.title || '').toLowerCase();
      const typeName = (item.type_name || '').toLowerCase();

      // 2. 分类包含成人敏感词
      if (yellowWords.some((word: string) => typeName.includes(word.toLowerCase()))) {
        return false;
      }

      // 3. 标题或分类包含违禁词
      if (
        blockedWords.some(
          (word: string) =>
            title.includes(word.toLowerCase()) || typeName.includes(word.toLowerCase())
        )
      ) {
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