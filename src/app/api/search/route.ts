/* eslint-disable @typescript-eslint/no-explicit-any,no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getAvailableApiSites, getCacheTime, getConfig } from '@/lib/config';
import { searchFromApi } from '@/lib/downstream';
import { generateSearchVariants } from '@/lib/downstream';
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

  if (!query) {
    const cacheTime = await getCacheTime();
    return NextResponse.json(
      { results: [] },
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

  // 1. 查询本身含有违禁词 → 直接返回空结果
  const queryLower = query.toLowerCase();
  if (bannedWords.some(word => queryLower.includes(word.toLowerCase()))) {
    return NextResponse.json({ results: [] }, { status: 200 });
  }

  const config = await getConfig();
  const apiSites = await getAvailableApiSites(authInfo.username);

  const searchVariants = generateSearchVariants(query).slice(0, 2);

  const searchPromises = apiSites.map((site) =>
    Promise.race([
      searchFromApi(site, query, searchVariants),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`${site.name} timeout`)), 20000)
      ),
    ]).catch((err) => {
      console.warn(`搜索失败 ${site.name}:`, err.message);
      return [];
    })
  );

  try {
    const results = await Promise.allSettled(searchPromises);
    const successResults = results
      .filter((result) => result.status === 'fulfilled')
      .map((result) => (result as PromiseFulfilledResult<any>).value);

    let flattenedResults = successResults.flat();

    // 违禁词过滤（检查 title 和 type_name 字段）
    flattenedResults = flattenedResults.filter((item) => {
      const title = (item.title || item.name || '').toLowerCase();
      const typeName = (item.type_name || item.category || item.vod_type || '').toLowerCase();
      
      return !bannedWords.some((word) => {
        const lowerWord = word.toLowerCase();
        return title.includes(lowerWord) || typeName.includes(lowerWord);
      });
    });

    // 原有黄色内容过滤
    if (!config.SiteConfig.DisableYellowFilter) {
      flattenedResults = flattenedResults.filter((result) => {
        const typeName = (result.type_name || result.category || result.vod_type || '').toLowerCase();
        return !yellowWords.some((word: string) => typeName.includes(word.toLowerCase()));
      });
    }

    const cacheTime = await getCacheTime();

    if (flattenedResults.length === 0) {
      return NextResponse.json({ results: [] }, { status: 200 });
    }

    return NextResponse.json(
      { results: flattenedResults },
      {
        headers: {
          'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
          'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
          'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
          'Netlify-Vary': 'query',
        },
      }
    );
  } catch (error) {
    return NextResponse.json({ error: '搜索失败' }, { status: 500 });
  }
}