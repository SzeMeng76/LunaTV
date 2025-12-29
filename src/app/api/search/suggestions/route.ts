/* eslint-disable @typescript-eslint/no-explicit-any,no-console */

import { NextRequest, NextResponse } from 'next/server';

import { AdminConfig } from '@/lib/admin.types';
import { getAuthInfoFromCookie } from '@/lib/auth';
import { getAvailableApiSites, getConfig } from '@/lib/config';
import { searchFromApi } from '@/lib/downstream';
import { yellowWords } from '@/lib/yellow';
import { blockedKeywords } from '@/lib/blockedKeywords'; // 新增

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const config = await getConfig();
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.trim();

    if (!query) {
      return NextResponse.json({ suggestions: [] });
    }

    // 新增：关键词黑名单检查，直接返回空建议
    if (blockedKeywords.some(word => query.includes(word))) {
      return NextResponse.json({ suggestions: [] });
    }

    const suggestions = await generateSuggestions(config, query, authInfo.username);

    const cacheTime = config.SiteConfig.SiteInterfaceCacheTime || 300;

    return NextResponse.json(
      { suggestions },
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
    console.error('获取搜索建议失败', error);
    return NextResponse.json({ error: '获取搜索建议失败' }, { status: 500 });
  }
}

async function generateSuggestions(config: AdminConfig, query: string, username: string): Promise<
  Array<{
    text: string;
    type: 'exact' | 'related' | 'suggestion';
    score: number;
  }>
> {
  const queryLower = query.toLowerCase();

  const apiSites = await getAvailableApiSites(username);
  let realKeywords: string[] = [];

  if (apiSites.length > 0) {
    const firstSite = apiSites[0];
    const results = await searchFromApi(firstSite, query);

    realKeywords = Array.from(
      new Set(
        results
          .filter((r: any) => config.SiteConfig.DisableYellowFilter || !yellowWords.some((word: string) => (r.type_name || '').includes(word)))
          .map((r: any) => r.title)
          .filter(Boolean)
          .flatMap((title: string) => title.split(/[ -:：·、-]/))
          .filter(
            (w: string) => w.length > 1 && w.toLowerCase().includes(queryLower)
          )
      )
    ).slice(0, 8);
  }

  const realSuggestions = realKeywords.map((word) => {
    const wordLower = word.toLowerCase();
    const queryWords = queryLower.split(/[ -:：·、-]/);

    let score = 1.0;
    if (wordLower === queryLower) {
      score = 2.0;
    } else if (
      wordLower.startsWith(queryLower) ||
      wordLower.endsWith(queryLower)
    ) {
      score = 1.8;
    } else if (queryWords.some((qw) => wordLower.includes(qw))) {
      score = 1.5;
    }

    let type: 'exact' | 'related' | 'suggestion' = 'related';
    if (score >= 2.0) {
      type = 'exact';
    } else if (score >= 1.5) {
      type = 'related';
    } else {
      type = 'suggestion';
    }

    return {
      text: word,
      type,
      score,
    };
  });

  const sortedSuggestions = realSuggestions.sort((a, b) => {
    if (a.score !== b.score) {
      return b.score - a.score;
    }
    const typePriority = { exact: 3, related: 2, suggestion: 1 };
    return typePriority[b.type] - typePriority[a.type];
  });

  return sortedSuggestions;
}